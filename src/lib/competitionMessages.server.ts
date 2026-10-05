import "server-only"
import { prisma } from "@/lib/prisma"
import { resendConfig } from "@/lib/email.server"
import { toFormFieldDefinition } from "@/lib/registrationForm"
import {
  MESSAGE_RECIPIENT_MAX,
  collectMessageContacts,
  messageEmailContent,
  normalizeMessageEmail,
  selectMessageRecipients,
  type MessageContact,
  type MessageFilters,
} from "@/lib/competitionMessages"

// Resendi partii on kuni 100 kirja; iga saaja saab eraldi kirja.
export const MESSAGE_BATCH_SIZE = 100
const MAX_ATTEMPTS = 6

export class MessageError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message)
  }
}

export async function loadMessageContacts(competitionId: string): Promise<MessageContact[]> {
  const [fields, applications, teams] = await Promise.all([
    prisma.competitionFormField.findMany({ where: { competitionId }, orderBy: [{ order: "asc" }, { createdAt: "asc" }] }),
    prisma.registrationApplication.findMany({
      where: { competitionId, teamId: null, status: { in: ["CONFIRMED", "WAITLISTED", "PENDING_REVIEW", "SUBMITTED", "CHANGES_REQUESTED"] } },
      orderBy: [{ submittedAt: "asc" }, { createdAt: "asc" }],
      select: {
        id: true, teamName: true, status: true, teamId: true, pendingRepresentativeName: true, pendingRepresentativeEmail: true,
        class: { select: { name: true } },
        submittedBy: { select: { name: true, email: true } },
        fieldValues: { select: { fieldId: true, value: true } },
      },
    }),
    prisma.team.findMany({
      where: { competitionId },
      orderBy: { code: "asc" },
      select: {
        id: true, name: true, class: true, pendingRepresentativeName: true, pendingRepresentativeEmail: true,
        representative: { select: { member: { select: { user: { select: { name: true, email: true } } } } } },
        members: { orderBy: { name: "asc" }, select: { name: true, email: true } },
        formValues: { select: { fieldId: true, value: true } },
      },
    }),
  ])
  return collectMessageContacts({
    fields: fields.map(toFormFieldDefinition),
    applications: applications.map((application) => ({ ...application, className: application.class?.name ?? null })),
    teams: teams.map((team) => ({ ...team, className: team.class, representative: team.representative?.member.user ?? null })),
  })
}

// Loob kirja valitud saajatele. Saajad arvutatakse serveris uuesti; brauseri
// saadetud aadressidest jäetakse alles ainult need, kes filtrile vastavad.
export async function createCompetitionMessage(input: {
  competitionId: string
  subject: string
  body: string
  filters: MessageFilters
  emails: string[]
  sender: { id: string; email: string | null }
}) {
  const { recipients } = selectMessageRecipients(await loadMessageContacts(input.competitionId), input.filters)
  const selected = new Set(input.emails.map(normalizeMessageEmail))
  const chosen = recipients.filter((recipient) => selected.has(recipient.email))
  if (chosen.length === 0) throw new MessageError("Vali vähemalt üks saaja")
  if (chosen.length > MESSAGE_RECIPIENT_MAX) throw new MessageError(`Korraga saab saata kuni ${MESSAGE_RECIPIENT_MAX} saajale`)
  return prisma.competitionMessage.create({
    data: {
      competitionId: input.competitionId,
      subject: input.subject.trim(),
      body: input.body.trimEnd(),
      replyTo: input.sender.email ? normalizeMessageEmail(input.sender.email) : null,
      sentById: input.sender.id,
      recipientCount: chosen.length,
      recipients: {
        create: chosen.map((recipient, index) => ({
          email: recipient.email,
          name: recipient.name,
          context: recipient.contexts.join(", "),
          batchNo: Math.floor(index / MESSAGE_BATCH_SIZE),
        })),
      },
    },
    select: { id: true, recipientCount: true },
  })
}

// Saadab ootel partiid (kuni maxBatches). Partii saadetakse Resendi
// partiiliidese kaudu; ebaõnnestunud partii proovitakse hiljem uuesti.
export async function deliverCompetitionMessages(options: { messageId?: string; maxBatches?: number; now?: Date } = {}) {
  const config = resendConfig()
  if (!config) return { sent: 0, failed: 0, configurationMissing: true }
  const now = options.now ?? new Date()
  await prisma.competitionMessageRecipient.updateMany({
    where: { status: "SENDING", updatedAt: { lte: new Date(now.getTime() - 10 * 60 * 1000) } },
    data: { status: "FAILED", nextAttemptAt: now },
  })
  const dueWhere = {
    ...(options.messageId ? { messageId: options.messageId } : {}),
    status: { in: ["PENDING", "FAILED"] },
    nextAttemptAt: { lte: now },
    attempts: { lt: MAX_ATTEMPTS },
  }
  const dueRows = await prisma.competitionMessageRecipient.findMany({
    where: dueWhere,
    orderBy: [{ messageId: "asc" }, { batchNo: "asc" }],
    select: { messageId: true, batchNo: true },
    take: 2_000,
  })
  const batches = [...new Map(dueRows.map((row) => [`${row.messageId}:${row.batchNo}`, row])).values()].slice(0, options.maxBatches ?? 5)

  let sent = 0
  let failed = 0
  for (const { messageId, batchNo } of batches) {
    const claimed = await prisma.competitionMessageRecipient.updateMany({
      where: { ...dueWhere, messageId, batchNo },
      data: { status: "SENDING", attempts: { increment: 1 }, lastError: null },
    })
    if (claimed.count === 0) continue
    const rows = await prisma.competitionMessageRecipient.findMany({
      where: { messageId, batchNo, status: "SENDING" },
      orderBy: { email: "asc" },
      select: {
        id: true, email: true, context: true, attempts: true,
        message: { select: { subject: true, body: true, replyTo: true, competition: { select: { name: true } } } },
      },
    })
    if (rows.length === 0) continue
    const message = rows[0].message
    const ids = rows.map((row) => row.id)
    try {
      const response = await fetch(`${config.baseUrl}/emails/batch`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
          // Sama partii korduskatse ei saada kirju topelt.
          "Idempotency-Key": `competition-message-${messageId}-${batchNo}`,
        },
        body: JSON.stringify(rows.map((row) => {
          const content = messageEmailContent({ competitionName: message.competition.name, subject: message.subject, body: message.body, contexts: [row.context] })
          return {
            from: config.from,
            to: [row.email],
            subject: content.subject,
            text: content.text,
            html: content.html,
            ...(message.replyTo ? { reply_to: message.replyTo } : {}),
          }
        })),
        signal: AbortSignal.timeout(20_000),
      })
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 500)
        throw new Error(`Resend vastas staatusega ${response.status}${detail ? `: ${detail}` : ""}`)
      }
      await prisma.competitionMessageRecipient.updateMany({ where: { id: { in: ids } }, data: { status: "SENT", sentAt: new Date(), lastError: null } })
      sent += rows.length
    } catch (error) {
      const attempts = Math.max(...rows.map((row) => row.attempts))
      const delayMinutes = Math.min(2 ** attempts, 60)
      await prisma.competitionMessageRecipient.updateMany({
        where: { id: { in: ids } },
        data: {
          status: "FAILED",
          lastError: (error instanceof Error ? error.message : "Kirja saatmine ebaõnnestus").slice(0, 2000),
          nextAttemptAt: new Date(now.getTime() + delayMinutes * 60_000),
        },
      })
      failed += rows.length
    }
  }
  return { sent, failed, configurationMissing: false }
}

export async function deliverPendingCompetitionMessagesSafely() {
  try {
    return await deliverCompetitionMessages({ maxBatches: 20 })
  } catch (error) {
    console.error("Võistluse kirjade saatmine ebaõnnestus:", error instanceof Error ? error.message : String(error))
    return { sent: 0, failed: 0, configurationMissing: false, error: true }
  }
}

// Proovikiri saatjale endale: sama kujundus, saajate põhjus näidisena.
export async function sendTestMessage(input: { competitionName: string; subject: string; body: string; to: string }) {
  const config = resendConfig()
  if (!config) throw new MessageError("E-posti saatmine ei ole seadistatud", 503)
  const content = messageEmailContent({
    competitionName: input.competitionName,
    subject: `[Proov] ${input.subject}`,
    body: input.body,
    contexts: ["näiteks võistkond (esindaja)"],
  })
  const response = await fetch(`${config.baseUrl}/emails`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: config.from, to: [input.to], subject: content.subject, text: content.text, html: content.html, reply_to: input.to }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new MessageError("Proovikirja saatmine ebaõnnestus", 502)
}

export type MessageHistoryItem = {
  id: string
  subject: string
  body: string
  replyTo: string | null
  senderName: string | null
  createdAt: Date
  recipientCount: number
  counts: { sent: number; pending: number; failed: number }
  failures: { email: string; error: string | null }[]
  recipients: { email: string; name: string | null; context: string; status: string }[]
}

export async function loadMessageHistory(competitionId: string): Promise<MessageHistoryItem[]> {
  const messages = await prisma.competitionMessage.findMany({
    where: { competitionId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true, subject: true, body: true, replyTo: true, createdAt: true, recipientCount: true,
      sentBy: { select: { name: true } },
      recipients: { orderBy: { email: "asc" }, select: { email: true, name: true, context: true, status: true, attempts: true, lastError: true } },
    },
  })
  return messages.map((message) => {
    // Lõplikult ebaõnnestunud: korduskatsed on otsas.
    const finalFailures = message.recipients.filter((recipient) => recipient.status === "FAILED" && recipient.attempts >= MAX_ATTEMPTS)
    return {
      id: message.id,
      subject: message.subject,
      body: message.body,
      replyTo: message.replyTo,
      senderName: message.sentBy?.name ?? null,
      createdAt: message.createdAt,
      recipientCount: message.recipientCount,
      counts: {
        sent: message.recipients.filter((recipient) => recipient.status === "SENT").length,
        failed: finalFailures.length,
        pending: message.recipients.filter((recipient) => recipient.status !== "SENT").length - finalFailures.length,
      },
      failures: message.recipients.filter((recipient) => recipient.status === "FAILED").map((recipient) => ({ email: recipient.email, error: recipient.lastError })),
      recipients: message.recipients.map(({ email, name, context, status }) => ({ email, name, context, status })),
    }
  })
}
