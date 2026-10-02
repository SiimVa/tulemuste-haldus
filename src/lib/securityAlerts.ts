// Turvalogi mustrid, mis väärivad administraatori tähelepanu. Siin on ainult
// puhas loogika; andmebaasi lugemine ja kirjutamine on securityAlerts.server.ts-is.

export const SECURITY_ALERT_WINDOW_MS = 60 * 60 * 1000

export const SECURITY_ALERT_SEVERITIES = ["HIGH", "MEDIUM", "LOW"] as const
export type SecurityAlertSeverity = (typeof SECURITY_ALERT_SEVERITIES)[number]

export const SECURITY_ALERT_SEVERITY_LABELS: Record<SecurityAlertSeverity, string> = {
  HIGH: "Kõrge",
  MEDIUM: "Keskmine",
  LOW: "Madal",
}

// Thresholds count events inside SECURITY_ALERT_WINDOW_MS.
export const SECURITY_ALERT_THRESHOLDS = {
  failuresBeforeSuccess: 5,
  accountsFromOneSource: 5,
  probingDenials: 20,
  probingTargets: 5,
  exports: 10,
  exportedRows: 1000,
  exportedCompetitions: 3,
} as const

export type AlertEvent = {
  createdAt: Date
  action: string
  outcome: string
  route: string
  method: string
  status: number | null
  actorUserId: string | null
  actorTokenId: string | null
  fingerprint: string | null
  targetIds: Record<string, string>
  recordCount: number | null
}

type Details = Record<string, number>

type AlertRule = {
  severity: SecurityAlertSeverity
  title: string
  // Events of one subject are counted together; null means the rule ignores the event.
  subject: (event: AlertEvent) => string | null
  triggered: (events: AlertEvent[]) => boolean
  details: (events: AlertEvent[]) => Details
  // Distinct counts cannot be added up when later events extend an open alert.
  distinctKeys?: readonly string[]
  describe: (subject: string, details: Details) => string
}

const T = SECURITY_ALERT_THRESHOLDS
const isLogin = (event: AlertEvent) => event.action === "LOGIN"
const distinct = (values: (string | undefined)[]) => new Set(values.filter(Boolean)).size
const exportedRows = (events: AlertEvent[]) => events.reduce((sum, event) => sum + (event.recordCount ?? 0), 0)
const exportedCompetitions = (events: AlertEvent[]) =>
  distinct(events.map((event) => event.targetIds.competitionId ?? event.targetIds.id))
const deniedTargets = (events: AlertEvent[]) =>
  distinct(events.map((event) => `${event.route} ${JSON.stringify(Object.entries(event.targetIds).sort())}`))
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

function actorSubject(event: AlertEvent) {
  if (event.actorUserId) return `user:${event.actorUserId}`
  if (event.actorTokenId) return `token:${event.actorTokenId}`
  return event.fingerprint ? `source:${event.fingerprint}` : null
}

// One successful sensitive change is already worth an alert.
function sensitiveChange(
  route: string,
  method: string,
  severity: SecurityAlertSeverity,
  title: string,
  describe: (subject: string, changes: number) => string
): AlertRule {
  return {
    severity,
    title,
    subject: (event) =>
      event.route === route && event.method === method && event.outcome === "SUCCEEDED"
        ? actorSubject(event)
        : null,
    triggered: (events) => events.length > 0,
    details: (events) => ({ changes: events.length }),
    describe: (subject, details) => describe(subject, details.changes ?? 0),
  }
}

export const SECURITY_ALERT_RULES = {
  LOGIN_SUCCESS_AFTER_FAILURES: {
    severity: "HIGH",
    title: "Sisselogimine õnnestus pärast korduvaid ebaõnnestumisi",
    subject: (event) => {
      if (!isLogin(event)) return null
      if (event.outcome === "DENIED" && event.targetIds.userId) return `user:${event.targetIds.userId}`
      return event.outcome === "SUCCEEDED" && event.actorUserId ? `user:${event.actorUserId}` : null
    },
    triggered: (events) => {
      let failures = 0
      for (const event of events) {
        if (event.outcome === "DENIED") failures += 1
        else if (failures >= T.failuresBeforeSuccess) return true
      }
      return false
    },
    details: (events) => ({
      failures: events.filter((event) => event.outcome === "DENIED").length,
      successes: events.filter((event) => event.outcome === "SUCCEEDED").length,
    }),
    describe: (subject, details) =>
      `${subject}: ${details.failures} ebaõnnestunud paroolikatset ja seejärel õnnestunud sisselogimine. ` +
      "Kui see ei olnud konto omanik, lähtesta parool ja kontrolli konto tegevusi.",
  },
  LOGIN_MANY_ACCOUNTS: {
    severity: "MEDIUM",
    title: "Üks allikas proovis mitut kontot",
    subject: (event) =>
      isLogin(event) && event.outcome === "DENIED" && event.fingerprint ? `source:${event.fingerprint}` : null,
    triggered: (events) =>
      distinct(events.map((event) => event.targetIds.loginAccountHash)) >= T.accountsFromOneSource,
    details: (events) => ({
      attempts: events.length,
      accounts: distinct(events.map((event) => event.targetIds.loginAccountHash)),
    }),
    distinctKeys: ["accounts"],
    describe: (subject, details) =>
      `${subject}: ${details.attempts} ebaõnnestunud sisselogimist ${details.accounts} erinevasse kontosse. ` +
      "Võimalik on lekkinud paroolide proovimine.",
  },
  LOGIN_RATE_LIMITED: {
    severity: "MEDIUM",
    title: "Sisselogimiskatsete piirang rakendus",
    subject: (event) => {
      if (!isLogin(event) || event.outcome !== "RATE_LIMITED") return null
      if (event.targetIds.loginAccountHash) return `account:${event.targetIds.loginAccountHash}`
      return event.fingerprint ? `source:${event.fingerprint}` : null
    },
    triggered: (events) => events.length > 0,
    details: (events) => ({ blocks: events.length }),
    describe: (subject, details) =>
      `${subject}: sisselogimiskatsete piirang rakendus ${details.blocks} korda. ` +
      "Nii palju katseid lühikese ajaga viitab automaatsele proovimisele.",
  },
  ACCESS_PROBING: {
    severity: "MEDIUM",
    title: "Korduvad keelatud päringud",
    subject: (event) =>
      !isLogin(event) && event.status !== null && [401, 403, 404].includes(event.status)
        ? actorSubject(event)
        : null,
    triggered: (events) => events.length >= T.probingDenials && deniedTargets(events) >= T.probingTargets,
    details: (events) => ({ denials: events.length, targets: deniedTargets(events) }),
    distinctKeys: ["targets"],
    describe: (subject, details) =>
      `${subject}: ${details.denials} keelatud või „ei leitud” vastust ${details.targets} erineva objekti kohta. ` +
      "Võimalik on võõraste andmete otsimine.",
  },
  LARGE_EXPORT: {
    severity: "MEDIUM",
    title: "Tavapärasest suurem andmete eksport",
    subject: (event) => (event.action === "EXPORT" && event.outcome === "SUCCEEDED" ? actorSubject(event) : null),
    triggered: (events) =>
      events.length >= T.exports ||
      exportedRows(events) >= T.exportedRows ||
      exportedCompetitions(events) >= T.exportedCompetitions,
    details: (events) => ({
      exports: events.length,
      rows: exportedRows(events),
      competitions: exportedCompetitions(events),
    }),
    distinctKeys: ["competitions"],
    describe: (subject, details) =>
      `${subject}: ${plural(details.exports, "eksport", "eksporti")}, kokku ${details.rows} rida ` +
      `${details.competitions} võistluselt.`,
  },
  API_RATE_LIMITED: {
    severity: "LOW",
    title: "API päringute piirang rakendus",
    subject: (event) => (!isLogin(event) && event.outcome === "RATE_LIMITED" ? actorSubject(event) : null),
    triggered: (events) => events.length > 0,
    details: (events) => ({ blocks: events.length }),
    describe: (subject, details) =>
      `${subject}: API päringute piirang rakendus ${details.blocks} korda. ` +
      "Põhjuseks võib olla ka sama võrgu taga töötav võistluse meeskond.",
  },
  ADMIN_SETUP: sensitiveChange("/api/setup", "POST", "HIGH", "Loodi administraatori konto",
    (subject) => `${subject}: algseadistusega loodi administraatori konto.`),
  PASSWORD_RESET: sensitiveChange("/api/users/[id]", "PATCH", "MEDIUM", "Kasutaja parool lähtestati",
    (subject, changes) => `${subject} lähtestas ${changes} kasutaja parooli.`),
  ACCOUNT_DELETED: sensitiveChange("/api/users/[id]", "DELETE", "MEDIUM", "Kasutajakonto kustutati",
    (subject, changes) => `${subject} kustutas ${plural(changes, "kasutajakonto", "kasutajakontot")}.`),
  OWNER_CHANGED: sensitiveChange("/api/competitions/[id]/roles", "PATCH", "MEDIUM", "Võistluse omanik vahetati",
    (subject, changes) => `${subject} vahetas ${changes} võistluse omaniku.`),
  COMPETITION_DELETED: sensitiveChange("/api/competitions/[id]", "DELETE", "MEDIUM", "Võistlus kustutati",
    (subject, changes) => `${subject} kustutas ${plural(changes, "võistluse", "võistlust")}.`),
  PERSONAL_DATA_PURGED: sensitiveChange("/api/competitions/[id]/personal-data/purge", "POST", "MEDIUM",
    "Võistluse isikuandmed kustutati",
    (subject, changes) => `${subject} kustutas ${changes} võistluse isikuandmed.`),
  ACCOUNT_CREATED: sensitiveChange("/api/users", "POST", "LOW", "Loodi kasutajakonto",
    (subject, changes) => `${subject} lõi ${plural(changes, "kasutajakonto", "kasutajakontot")}.`),
} satisfies Record<string, AlertRule>

export type SecurityAlertRuleId = keyof typeof SECURITY_ALERT_RULES

export function isSecurityAlertRule(value: string): value is SecurityAlertRuleId {
  return Object.prototype.hasOwnProperty.call(SECURITY_ALERT_RULES, value)
}

export type AlertState = {
  id: string
  rule: string
  subjectKey: string
  eventCount: number
  details: Details
  lastEventAt: Date
  resolvedAt: Date | null
}

export type NewSecurityAlert = {
  rule: SecurityAlertRuleId
  severity: SecurityAlertSeverity
  subjectKey: string
  userId: string | null
  fingerprint: string | null
  targetIds: Record<string, string>
  eventCount: number
  details: Details
  firstEventAt: Date
  lastEventAt: Date
}

export type SecurityAlertChange =
  | { kind: "create"; alert: NewSecurityAlert }
  | { kind: "update"; id: string; eventCount: number; details: Details; lastEventAt: Date; targetIds: Record<string, string> }

function mergeDetails(previous: Details, next: Details, distinctKeys: readonly string[] = []) {
  const merged: Details = { ...previous }
  for (const [key, value] of Object.entries(next)) {
    merged[key] = distinctKeys.includes(key) ? Math.max(merged[key] ?? 0, value) : (merged[key] ?? 0) + value
  }
  return merged
}

export function parseAlertSubject(subjectKey: string) {
  const separator = subjectKey.indexOf(":")
  const kind = subjectKey.slice(0, separator)
  const value = subjectKey.slice(separator + 1)
  if ((kind === "user" || kind === "token") && /^c[a-z0-9]{24}$/.test(value)) return { kind, value } as const
  if ((kind === "source" || kind === "account") && /^[a-f0-9]{64}$/.test(value)) return { kind, value } as const
  return null
}

// Events must be sorted oldest first. An open alert collects the subject's new
// events; after an alert is resolved, new events must cross the threshold again.
export function evaluateSecurityAlerts(
  events: readonly AlertEvent[],
  recentAlerts: readonly AlertState[],
  ignoredSubjects: ReadonlySet<string> = new Set()
): SecurityAlertChange[] {
  const latest = new Map<string, AlertState>()
  for (const alert of recentAlerts) {
    const key = `${alert.rule} ${alert.subjectKey}`
    const current = latest.get(key)
    if (!current || alert.lastEventAt > current.lastEventAt) latest.set(key, alert)
  }

  const changes: SecurityAlertChange[] = []
  for (const [rule, definition] of Object.entries(SECURITY_ALERT_RULES) as [SecurityAlertRuleId, AlertRule][]) {
    const groups = new Map<string, AlertEvent[]>()
    for (const event of events) {
      const subject = definition.subject(event)
      if (!subject || ignoredSubjects.has(subject)) continue
      const group = groups.get(subject)
      if (group) group.push(event)
      else groups.set(subject, [event])
    }
    for (const [subjectKey, subjectEvents] of groups) {
      const previous = latest.get(`${rule} ${subjectKey}`)
      const fresh = previous
        ? subjectEvents.filter((event) => event.createdAt > previous.lastEventAt)
        : subjectEvents
      if (fresh.length === 0) continue
      const last = fresh[fresh.length - 1]
      if (previous && !previous.resolvedAt) {
        changes.push({
          kind: "update",
          id: previous.id,
          eventCount: previous.eventCount + fresh.length,
          details: mergeDetails(previous.details, definition.details(fresh), definition.distinctKeys),
          lastEventAt: last.createdAt,
          targetIds: last.targetIds,
        })
      } else if (definition.triggered(fresh)) {
        const subject = parseAlertSubject(subjectKey)
        changes.push({
          kind: "create",
          alert: {
            rule,
            severity: definition.severity,
            subjectKey,
            userId: subject?.kind === "user" ? subject.value : last.targetIds.userId ?? null,
            fingerprint: subject?.kind === "source" ? subject.value : null,
            targetIds: last.targetIds,
            eventCount: fresh.length,
            details: definition.details(fresh),
            firstEventAt: fresh[0].createdAt,
            lastEventAt: last.createdAt,
          },
        })
      }
    }
  }
  return changes
}

// Human-readable subject: the account name when known, otherwise a pseudonymous ID.
export function securityAlertSubjectLabel(
  subjectKey: string,
  userName: string | null | undefined
) {
  const subject = parseAlertSubject(subjectKey)
  if (userName) return userName
  if (!subject) return "Tuvastamata"
  if (subject.kind === "user") return `Kasutaja ${subject.value}`
  if (subject.kind === "token") return `Ligipääsutoken ${subject.value}`
  if (subject.kind === "account") return `Konto tunnusega ${subject.value.slice(0, 12)}`
  return `Pseudonüümne allikas ${subject.value.slice(0, 12)}`
}

export function securityAlertText(
  alert: { rule: string; details: Details },
  subjectLabel: string
) {
  if (!isSecurityAlertRule(alert.rule)) {
    return { title: "Turvahoiatus", description: subjectLabel }
  }
  const definition: AlertRule = SECURITY_ALERT_RULES[alert.rule]
  return { title: definition.title, description: definition.describe(subjectLabel, alert.details) }
}
