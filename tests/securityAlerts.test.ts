import assert from "node:assert/strict"
import test from "node:test"
import {
  evaluateSecurityAlerts,
  securityAlertSubjectLabel,
  securityAlertText,
  type AlertEvent,
  type AlertState,
} from "../src/lib/securityAlerts"

const userId = "c" + "u".repeat(24)
const adminId = "c" + "a".repeat(24)
const source = "f".repeat(64)
const start = new Date("2026-10-02T18:00:00Z").getTime()

function event(minute: number, overrides: Partial<AlertEvent>): AlertEvent {
  return {
    createdAt: new Date(start + minute * 60_000),
    action: "API_READ", outcome: "SUCCEEDED", route: "/api/users", method: "GET", status: 200,
    actorUserId: null, actorTokenId: null, fingerprint: source, targetIds: {}, recordCount: null,
    ...overrides,
  }
}
const failedLogin = (minute: number, account = "1") => event(minute, {
  action: "LOGIN", outcome: "DENIED", route: "/api/auth/callback/credentials", method: "POST", status: 401,
  targetIds: { userId, loginAccountHash: account.repeat(64).slice(0, 64) },
})
const successfulLogin = (minute: number) => event(minute, {
  action: "LOGIN", outcome: "SUCCEEDED", route: "/api/auth/[...nextauth]", method: "AUTH", status: null, actorUserId: userId,
})
const created = (changes: ReturnType<typeof evaluateSecurityAlerts>, rule: string) =>
  changes.filter(change => change.kind === "create" && change.alert.rule === rule)

test("successful login after five failures is a high alert; four failures are not", () => {
  const five = evaluateSecurityAlerts([...[1, 2, 3, 4, 5].map(m => failedLogin(m)), successfulLogin(6)], [])
  const [alert] = created(five, "LOGIN_SUCCESS_AFTER_FAILURES")
  assert.equal(alert?.kind, "create")
  if (alert?.kind !== "create") return
  assert.equal(alert.alert.severity, "HIGH")
  assert.equal(alert.alert.userId, userId)
  assert.deepEqual(alert.alert.details, { failures: 5, successes: 1 })

  const four = evaluateSecurityAlerts([...[1, 2, 3, 4].map(m => failedLogin(m)), successfulLogin(6)], [])
  assert.equal(created(four, "LOGIN_SUCCESS_AFTER_FAILURES").length, 0)
  const successFirst = evaluateSecurityAlerts([successfulLogin(0), ...[1, 2, 3, 4, 5].map(m => failedLogin(m))], [])
  assert.equal(created(successFirst, "LOGIN_SUCCESS_AFTER_FAILURES").length, 0)
})

test("one source failing on five accounts is reported unless the source is the shared fallback", () => {
  const attempts = ["1", "2", "3", "4", "5"].map((account, index) => failedLogin(index, account))
  const [alert] = created(evaluateSecurityAlerts(attempts, []), "LOGIN_MANY_ACCOUNTS")
  assert.equal(alert?.kind === "create" && alert.alert.fingerprint, source)
  assert.equal(created(evaluateSecurityAlerts(attempts.slice(0, 4), []), "LOGIN_MANY_ACCOUNTS").length, 0)
  assert.equal(created(evaluateSecurityAlerts(attempts, [], new Set([`source:${source}`])), "LOGIN_MANY_ACCOUNTS").length, 0)
})

test("probing needs many denials across different objects", () => {
  const denied = (minute: number, id: string) => event(minute, {
    actorUserId: userId, status: 403, outcome: "DENIED", route: "/api/competitions/[id]", targetIds: { id },
  })
  const spread = Array.from({ length: 20 }, (_, i) => denied(i, "c" + String(i % 5).repeat(24)))
  assert.equal(created(evaluateSecurityAlerts(spread, []), "ACCESS_PROBING").length, 1)
  const sameTarget = Array.from({ length: 30 }, (_, i) => denied(i, "c" + "1".repeat(24)))
  assert.equal(created(evaluateSecurityAlerts(sameTarget, []), "ACCESS_PROBING").length, 0)
})

test("exports are flagged by row count or by the number of competitions", () => {
  const exported = (minute: number, id: string, rows: number) => event(minute, {
    action: "EXPORT", route: "/api/competitions/[id]/export", actorUserId: adminId, targetIds: { id }, recordCount: rows,
  })
  assert.equal(created(evaluateSecurityAlerts([exported(1, "c" + "1".repeat(24), 600), exported(2, "c" + "1".repeat(24), 400)], []), "LARGE_EXPORT").length, 1)
  assert.equal(created(evaluateSecurityAlerts(["1", "2", "3"].map((n, i) => exported(i, "c" + n.repeat(24), 10)), []), "LARGE_EXPORT").length, 1)
  assert.equal(created(evaluateSecurityAlerts([exported(1, "c" + "1".repeat(24), 150), exported(2, "c" + "2".repeat(24), 150)], []), "LARGE_EXPORT").length, 0)
})

test("one successful password reset is an alert, a denied attempt is not", () => {
  const reset = (outcome: string) => event(1, { route: "/api/users/[id]", method: "PATCH", outcome, actorUserId: adminId, targetIds: { id: userId } })
  const [alert] = created(evaluateSecurityAlerts([reset("SUCCEEDED")], []), "PASSWORD_RESET")
  assert.equal(alert?.kind === "create" && alert.alert.severity, "MEDIUM")
  assert.equal(created(evaluateSecurityAlerts([reset("DENIED")], []), "PASSWORD_RESET").length, 0)
})

test("open alerts collect new events once; resolved alerts need a new threshold breach", () => {
  const events = [...[1, 2, 3, 4, 5].map(m => failedLogin(m)), successfulLogin(6)]
  const state = (resolvedAt: Date | null): AlertState => ({
    id: "c" + "s".repeat(24), rule: "LOGIN_SUCCESS_AFTER_FAILURES", subjectKey: `user:${userId}`,
    eventCount: 6, details: { failures: 5, successes: 1 }, lastEventAt: events[5].createdAt, resolvedAt,
  })
  const relevant = (changes: ReturnType<typeof evaluateSecurityAlerts>) =>
    changes.filter(change => change.kind === "update" || change.alert.rule === "LOGIN_SUCCESS_AFTER_FAILURES")

  assert.deepEqual(relevant(evaluateSecurityAlerts(events, [state(null)])), [])
  const [update] = relevant(evaluateSecurityAlerts([...events, failedLogin(7), failedLogin(8)], [state(null)]))
  assert.equal(update?.kind, "update")
  if (update?.kind !== "update") return
  assert.equal(update.eventCount, 8)
  assert.deepEqual(update.details, { failures: 7, successes: 1 })
  assert.deepEqual(update.lastEventAt, new Date(start + 8 * 60_000))

  const resolved = state(new Date(start + 10 * 60_000))
  assert.deepEqual(relevant(evaluateSecurityAlerts([...events, failedLogin(11), successfulLogin(12)], [resolved])), [])
  const again = relevant(evaluateSecurityAlerts(
    [...events, ...[11, 12, 13, 14, 15].map(m => failedLogin(m)), successfulLogin(16)], [resolved]))
  assert.equal(again.length, 1)
  assert.equal(again[0].kind, "create")
})

test("distinct counts are not added up when an open alert grows", () => {
  const open: AlertState = {
    id: "c" + "s".repeat(24), rule: "LOGIN_MANY_ACCOUNTS", subjectKey: `source:${source}`,
    eventCount: 5, details: { attempts: 5, accounts: 5 }, lastEventAt: new Date(start), resolvedAt: null,
  }
  const [update] = evaluateSecurityAlerts([failedLogin(1, "1"), failedLogin(2, "2")], [open])
    .filter(change => change.kind === "update")
  assert.equal(update?.kind === "update" && update.details.attempts, 7)
  assert.equal(update?.kind === "update" && update.details.accounts, 5)
})

test("alert texts name the account or only a pseudonymous source", () => {
  assert.equal(securityAlertSubjectLabel(`source:${source}`, null), `Pseudonüümne allikas ${source.slice(0, 12)}`)
  assert.equal(securityAlertSubjectLabel(`user:${userId}`, "Mari Maasikas"), "Mari Maasikas")
  const text = securityAlertText({ rule: "LOGIN_SUCCESS_AFTER_FAILURES", details: { failures: 7, successes: 1 } }, "Mari Maasikas")
  assert.equal(text.title, "Sisselogimine õnnestus pärast korduvaid ebaõnnestumisi")
  assert.match(text.description, /^Mari Maasikas: 7 ebaõnnestunud paroolikatset/)
  assert.equal(securityAlertText({ rule: "UNKNOWN", details: {} }, "x").title, "Turvahoiatus")
})
