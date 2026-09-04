import type { Prisma } from "@prisma/client"
import { getCompetitionMandateStatus } from "@/lib/competitionPhases"
import { prisma } from "@/lib/prisma"
import {
  competitionStartedNotificationContent,
  mandateOpenedNotificationContent,
  notificationEmailHtml,
  registrationNotificationContent,
  teamWorkflowNotificationContent,
  type NotificationContent,
} from "@/lib/notifications"

type TransactionClient = Prisma.TransactionClient

type QueueNotificationInput = NotificationContent & {
  userId: string
  competitionId?: string | null
  href?: string | null
  emailTo: string
  emailReplyTo?: string | null
  dedupeKey?: string | null
}

export async function queueUserNotification(
  tx: TransactionClient,
  input: QueueNotificationInput
) {
  const data = {
    userId: input.userId,
    competitionId: input.competitionId ?? null,
    type: input.type,
    title: input.title,
    message: input.message,
    href: input.href ?? null,
    emailTo: input.emailTo.trim().toLowerCase(),
    emailReplyTo: input.emailReplyTo?.trim().toLowerCase() || null,
    dedupeKey: input.dedupeKey ?? null,
  }
  if (data.dedupeKey) {
    return tx.notification.upsert({
      where: { dedupeKey: data.dedupeKey },
      create: data,
      update: {},
      select: { id: true },
    })
  }
  return tx.notification.create({ data, select: { id: true } })
}

export async function queueRegistrationApplicationNotification(
  tx: TransactionClient,
  applicationId: string,
  status: string,
  options: { note?: string | null; dedupeKey?: string | null } = {}
) {
  const application = await tx.registrationApplication.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      teamName: true,
      waitlistPosition: true,
      submittedBy: { select: { id: true, email: true } },
      competition: {
        select: {
          id: true,
          name: true,
          organizer: { select: { email: true } },
        },
      },
    },
  })
  if (!application) return null
  const content = registrationNotificationContent({
    status,
    competitionName: application.competition.name,
    teamName: application.teamName,
    waitlistPosition: application.waitlistPosition,
    note: options.note,
  })
  if (!content) return null
  return queueUserNotification(tx, {
    ...content,
    userId: application.submittedBy.id,
    competitionId: application.competition.id,
    href: "/dashboard",
    emailTo: application.submittedBy.email,
    emailReplyTo: application.competition.organizer.email,
    dedupeKey: options.dedupeKey,
  })
}

export async function queueTeamWorkflowNotification(
  tx: TransactionClient,
  teamId: string,
  phase: "REGISTRATION" | "MANDATE",
  status: string,
  options: { note?: string | null; dedupeKey?: string | null } = {}
) {
  const team = await tx.team.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      name: true,
      competition: {
        select: {
          id: true,
          name: true,
          organizer: { select: { email: true } },
        },
      },
      representative: {
        select: {
          member: { select: { user: { select: { id: true, email: true } } } },
        },
      },
    },
  })
  const recipient = team?.representative?.member.user
  if (!team || !recipient) return null
  const content = teamWorkflowNotificationContent({
    phase,
    status,
    competitionName: team.competition.name,
    teamName: team.name,
    note: options.note,
  })
  if (!content) return null
  return queueUserNotification(tx, {
    ...content,
    userId: recipient.id,
    competitionId: team.competition.id,
    href: `/dashboard/representative/teams/${team.id}`,
    emailTo: recipient.email,
    emailReplyTo: team.competition.organizer.email,
    dedupeKey: options.dedupeKey,
  })
}

export async function queueMandateOpenedNotifications(
  tx: TransactionClient,
  competitionId: string
) {
  const teams = await tx.team.findMany({
    where: { competitionId, registrationStatus: "APPROVED" },
    select: {
      id: true,
      name: true,
      competition: {
        select: {
          name: true,
          organizer: { select: { email: true } },
        },
      },
      representative: {
        select: {
          member: { select: { user: { select: { id: true, email: true } } } },
        },
      },
    },
  })
  const notifications: Prisma.NotificationCreateManyInput[] = []
  for (const team of teams) {
    const recipient = team.representative?.member.user
    if (!recipient) continue
    const content = mandateOpenedNotificationContent({
      competitionName: team.competition.name,
      teamName: team.name,
    })
    notifications.push({
      ...content,
      userId: recipient.id,
      competitionId,
      href: `/dashboard/representative/teams/${team.id}`,
      emailTo: recipient.email.trim().toLowerCase(),
      emailReplyTo:
        team.competition.organizer.email.trim().toLowerCase() || null,
      dedupeKey: `mandate-opened:${competitionId}:${team.id}:${recipient.id}`,
    })
  }
  if (notifications.length === 0) return 0
  const result = await tx.notification.createMany({
    data: notifications,
    skipDuplicates: true,
  })
  return result.count
}

export async function enqueueDueMandateOpenedNotifications(
  now = new Date()
) {
  const competitions = await prisma.competition.findMany({
    where: {
      status: "SETUP",
      registrationFinalizedAt: { not: null },
      mandateFinalizedAt: null,
      OR: [
        { mandateOverride: "OPEN" },
        {
          mandateOverride: "AUTO",
          mandateOpensAt: { lte: now },
          OR: [
            { mandateClosesAt: null },
            { mandateClosesAt: { gt: now } },
          ],
        },
      ],
    },
    select: {
      id: true,
      registrationFinalizedAt: true,
      mandateOverride: true,
      mandateOpensAt: true,
      mandateClosesAt: true,
      mandateFinalizedAt: true,
    },
  })

  let queued = 0
  for (const competition of competitions) {
    if (getCompetitionMandateStatus(competition, now) !== "OPEN") continue
    queued += await prisma.$transaction((tx) =>
      queueMandateOpenedNotifications(tx, competition.id)
    )
  }
  return queued
}

export async function queueCompetitionStartedNotifications(
  tx: TransactionClient,
  competitionId: string
) {
  const teams = await tx.team.findMany({
    where: { competitionId, registrationStatus: "APPROVED" },
    select: {
      id: true,
      name: true,
      competition: {
        select: {
          name: true,
          organizer: { select: { email: true } },
        },
      },
      representative: {
        select: {
          member: { select: { user: { select: { id: true, email: true } } } },
        },
      },
      members: {
        where: { userId: { not: null } },
        select: { user: { select: { id: true, email: true } } },
      },
    },
  })
  const notifications: Prisma.NotificationCreateManyInput[] = []
  for (const team of teams) {
    const recipients = new Map<string, { id: string; email: string }>()
    const representative = team.representative?.member.user
    if (representative) recipients.set(representative.id, representative)
    for (const member of team.members) {
      if (member.user) recipients.set(member.user.id, member.user)
    }
    for (const recipient of recipients.values()) {
      const content = competitionStartedNotificationContent({
        competitionName: team.competition.name,
        teamName: team.name,
      })
      notifications.push({
        ...content,
        userId: recipient.id,
        competitionId,
        href: `/dashboard/teams/${team.id}/results`,
        emailTo: recipient.email.trim().toLowerCase(),
        emailReplyTo:
          team.competition.organizer.email.trim().toLowerCase() || null,
        dedupeKey: `competition-started:${competitionId}:${team.id}:${recipient.id}`,
      })
    }
  }
  if (notifications.length === 0) return 0
  const result = await tx.notification.createMany({
    data: notifications,
    skipDuplicates: true,
  })
  return result.count
}

function applicationBaseUrl() {
  const configured =
    process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? "https://www.matkamang.ee"
  return configured.replace(/\/$/, "")
}

function absoluteNotificationUrl(href: string | null) {
  if (!href?.startsWith("/")) return null
  return `${applicationBaseUrl()}${href}`
}

export async function deliverPendingNotifications(
  options: { limit?: number; now?: Date } = {}
) {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM
  if (!apiKey || !from) {
    return { sent: 0, failed: 0, configurationMissing: true }
  }

  const now = options.now ?? new Date()
  const staleSending = new Date(now.getTime() - 10 * 60 * 1000)
  await prisma.notification.updateMany({
    where: { emailStatus: "SENDING", updatedAt: { lte: staleSending } },
    data: { emailStatus: "FAILED", emailNextAttemptAt: now },
  })
  const pending = await prisma.notification.findMany({
    where: {
      emailStatus: { in: ["PENDING", "FAILED"] },
      emailNextAttemptAt: { lte: now },
      emailAttempts: { lt: 6 },
    },
    include: { competition: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
    take: Math.min(Math.max(options.limit ?? 25, 1), 100),
  })

  let sent = 0
  let failed = 0
  for (const notification of pending) {
    const claimed = await prisma.notification.updateMany({
      where: {
        id: notification.id,
        emailStatus: { in: ["PENDING", "FAILED"] },
        emailNextAttemptAt: { lte: now },
      },
      data: {
        emailStatus: "SENDING",
        emailAttempts: { increment: 1 },
        emailLastError: null,
      },
    })
    if (claimed.count !== 1) continue

    const actionUrl = absoluteNotificationUrl(notification.href)
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": notification.id,
        },
        body: JSON.stringify({
          from,
          to: [notification.emailTo],
          subject: notification.competition?.name
            ? `${notification.title} – ${notification.competition.name}`
            : notification.title,
          text: `${notification.message}${actionUrl ? `\n\n${actionUrl}` : ""}`,
          html: notificationEmailHtml({
            title: notification.title,
            message: notification.message,
            actionUrl,
          }),
          ...(notification.emailReplyTo
            ? { reply_to: notification.emailReplyTo }
            : {}),
        }),
        signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 500)
        throw new Error(
          `Resend vastas staatusega ${response.status}${detail ? `: ${detail}` : ""}`
        )
      }
      await prisma.notification.update({
        where: { id: notification.id },
        data: {
          emailStatus: "SENT",
          emailSentAt: new Date(),
          emailLastError: null,
        },
      })
      sent += 1
    } catch (error) {
      const attempts = notification.emailAttempts + 1
      const delayMinutes = Math.min(2 ** attempts, 60)
      const message =
        error instanceof Error ? error.message : "E-kirja saatmine ebaõnnestus"
      await prisma.notification.update({
        where: { id: notification.id },
        data: {
          emailStatus: "FAILED",
          emailLastError: message.slice(0, 2000),
          emailNextAttemptAt: new Date(now.getTime() + delayMinutes * 60_000),
        },
      })
      failed += 1
    }
  }
  return { sent, failed, configurationMissing: false }
}

export async function deliverPendingNotificationsSafely() {
  try {
    return await deliverPendingNotifications()
  } catch (error) {
    console.error(
      "Teavituste saatmine ebaõnnestus:",
      error instanceof Error ? error.message : String(error)
    )
    return { sent: 0, failed: 1, configurationMissing: false }
  }
}
