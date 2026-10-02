import type { Prisma, SecurityAlert } from "@prisma/client"
import { queueUserNotification } from "./notifications.server"
import { prisma } from "./prisma"
import { securityFingerprint } from "./security.server"
import {
  evaluateSecurityAlerts,
  parseAlertSubject,
  SECURITY_ALERT_SEVERITIES,
  SECURITY_ALERT_WINDOW_MS,
  securityAlertSubjectLabel,
  securityAlertText,
  type SecurityAlertSeverity,
} from "./securityAlerts"

// Events from the last seconds may still be committing; they are read next run.
const SETTLE_MS = 10_000
const MAX_EVENTS = 20_000

type TransactionClient = Prisma.TransactionClient

function jsonRecord<T extends string | number>(value: Prisma.JsonValue, type: "string" | "number") {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {} as Record<string, T>
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, T] => typeof entry[1] === type)
  )
}
const details = (value: Prisma.JsonValue) => jsonRecord<number>(value, "number")
const targets = (value: Prisma.JsonValue) => jsonRecord<string>(value, "string")

function formatTime(date: Date) {
  return date.toLocaleString("et-EE", { timeZone: "Europe/Tallinn", dateStyle: "medium", timeStyle: "short" })
}

async function userNames(client: TransactionClient | typeof prisma, ids: (string | null)[]) {
  const uniqueIds = [...new Set(ids.filter((id): id is string => Boolean(id)))]
  if (uniqueIds.length === 0) return new Map<string, string>()
  const users = await client.user.findMany({ where: { id: { in: uniqueIds } }, select: { id: true, name: true } })
  return new Map(users.map((user) => [user.id, user.name]))
}

function presentAlert(alert: SecurityAlert, names: Map<string, string>) {
  const subjectLabel = securityAlertSubjectLabel(alert.subjectKey, alert.userId ? names.get(alert.userId) : null)
  return { alert, subjectLabel, ...securityAlertText({ rule: alert.rule, details: details(alert.details) }, subjectLabel) }
}

async function notifyAdmins(tx: TransactionClient, alerts: SecurityAlert[]) {
  if (alerts.length === 0) return
  const [admins, names] = await Promise.all([
    tx.user.findMany({ where: { role: "ADMIN" }, select: { id: true, email: true } }),
    userNames(tx, alerts.map((alert) => alert.userId)),
  ])
  for (const alert of alerts) {
    const { title, description } = presentAlert(alert, names)
    for (const admin of admins) {
      await queueUserNotification(tx, {
        userId: admin.id,
        type: "SECURITY_ALERT",
        title: `Turvahoiatus: ${title}`,
        message: `${description} Viimane sündmus: ${formatTime(alert.lastEventAt)}.`,
        href: "/dashboard/security",
        emailTo: admin.email,
        dedupeKey: `security-alert:${alert.id}:${admin.id}`,
      })
    }
  }
}

export async function detectSecurityAlerts(now = new Date()) {
  const until = new Date(now.getTime() - SETTLE_MS)
  const since = new Date(until.getTime() - SECURITY_ALERT_WINDOW_MS)
  return prisma.$transaction(async (tx) => {
    // Overlapping cron runs or app instances must not create duplicate alerts.
    const [lock] = await tx.$queryRaw<Array<{ locked: boolean }>>`
      SELECT pg_try_advisory_xact_lock(hashtext('security-alert-detection')) AS "locked"
    `
    if (!lock?.locked) return { created: 0, updated: 0, skipped: true }

    const [events, recentAlerts] = await Promise.all([
      tx.securityEvent.findMany({
        where: { createdAt: { gt: since, lte: until } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: MAX_EVENTS,
        select: {
          createdAt: true, action: true, outcome: true, route: true, method: true, status: true,
          actorUserId: true, actorTokenId: true, fingerprint: true, targetIds: true, recordCount: true,
        },
      }),
      tx.securityAlert.findMany({
        where: { lastEventAt: { gt: since } },
        select: { id: true, rule: true, subjectKey: true, eventCount: true, details: true, lastEventAt: true, resolvedAt: true },
      }),
    ])
    const changes = evaluateSecurityAlerts(
      events.reverse().map((event) => ({ ...event, targetIds: targets(event.targetIds) })),
      recentAlerts.map((alert) => ({ ...alert, details: details(alert.details) })),
      // Without a trusted proxy every client shares this source, so it identifies nobody.
      new Set([`source:${securityFingerprint("client", "unknown")}`])
    )

    const created: SecurityAlert[] = []
    for (const change of changes) {
      if (change.kind === "update") {
        await tx.securityAlert.update({
          where: { id: change.id },
          data: {
            eventCount: change.eventCount, details: change.details,
            lastEventAt: change.lastEventAt, targetIds: change.targetIds,
          },
        })
      } else {
        created.push(await tx.securityAlert.create({ data: change.alert }))
      }
    }
    await notifyAdmins(tx, created.filter((alert) => alert.severity !== "LOW"))
    return { created: created.length, updated: changes.length - created.length, skipped: false }
  }, { maxWait: 10_000, timeout: 30_000 })
}

export async function detectSecurityAlertsSafely() {
  try {
    return await detectSecurityAlerts()
  } catch (error) {
    console.error("Security alert detection failed:", error instanceof Error ? error.message : String(error))
    return { created: 0, updated: 0, skipped: false, failed: true }
  }
}

const severityRank = (severity: string) =>
  SECURITY_ALERT_SEVERITIES.indexOf(severity as SecurityAlertSeverity)

export async function listSecurityAlerts() {
  const [open, resolved] = await Promise.all([
    prisma.securityAlert.findMany({ where: { resolvedAt: null }, orderBy: { lastEventAt: "desc" }, take: 100 }),
    prisma.securityAlert.findMany({ where: { resolvedAt: { not: null } }, orderBy: { resolvedAt: "desc" }, take: 20 }),
  ])
  const names = await userNames(prisma, [...open, ...resolved].flatMap((alert) => [alert.userId, alert.resolvedById]))
  const response = (alert: SecurityAlert) => {
    const { title, description, subjectLabel } = presentAlert(alert, names)
    return {
      id: alert.id, rule: alert.rule, severity: alert.severity, title, description,
      subjectKey: alert.subjectKey, subjectLabel, eventCount: alert.eventCount,
      firstEventAt: alert.firstEventAt, lastEventAt: alert.lastEventAt, resolvedAt: alert.resolvedAt,
      resolvedByName: alert.resolvedById ? names.get(alert.resolvedById) ?? null : null,
    }
  }
  return {
    // Stable sort keeps the newest first within each severity.
    open: open.map(response).sort((a, b) => severityRank(a.severity) - severityRank(b.severity)),
    resolved: resolved.map(response),
  }
}

export async function resolveSecurityAlert(id: string, resolvedById: string) {
  const result = await prisma.securityAlert.updateMany({
    where: { id, resolvedAt: null },
    data: { resolvedAt: new Date(), resolvedById },
  })
  if (result.count) return "RESOLVED" as const
  const exists = await prisma.securityAlert.findUnique({ where: { id }, select: { id: true } })
  return exists ? ("ALREADY_RESOLVED" as const) : ("NOT_FOUND" as const)
}

export function openSecurityAlertCount() {
  return prisma.securityAlert.count({ where: { resolvedAt: null, severity: { in: ["HIGH", "MEDIUM"] } } })
}

// Event-log filter for "show related events" on an alert.
export function securityEventSubjectWhere(subjectKey: string): Prisma.SecurityEventWhereInput | null {
  const subject = parseAlertSubject(subjectKey)
  if (!subject) return null
  if (subject.kind === "user") {
    return { OR: [{ actorUserId: subject.value }, { targetIds: { path: ["userId"], equals: subject.value } }] }
  }
  if (subject.kind === "token") return { actorTokenId: subject.value }
  if (subject.kind === "source") return { fingerprint: subject.value }
  return { targetIds: { path: ["loginAccountHash"], equals: subject.value } }
}
