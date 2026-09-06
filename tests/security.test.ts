import assert from "node:assert/strict"
import test from "node:test"
import { apiRateLimitPolicy, securityAction, securityOutcome, securityTargetIds } from "../src/lib/security"
import { requestFingerprint, securityFingerprint } from "../src/lib/security.server"

test("security targets exclude tokens, emails and arbitrary values", () => {
  const id = "c" + "a".repeat(24)
  assert.deepEqual(securityTargetIds({ id, teamId: id, token: id, email: "x@example.com", entryId: "secret-value", userId: "\nforged-log" }), { id, teamId: id })
})

test("audit classification includes exports, access, results and registration", () => {
  assert.equal(securityAction("/api/competitions/[id]/tokens/export", "GET"), "EXPORT")
  assert.equal(securityAction("/api/competitions/[id]/roles", "PUT"), "ACCESS_CHANGE")
  assert.equal(securityAction("/api/elements/[id]/results", "POST"), "RESULT_CHANGE")
  assert.equal(securityAction("/api/representative/teams/[teamId]/submit", "POST"), "REGISTRATION_CHANGE")
  assert.equal(securityAction("/api/security-events", "GET"), "AUDIT_READ")
})

test("audit outcomes distinguish denials, failed operations and throttling", () => {
  assert.equal(securityOutcome(200), "SUCCEEDED")
  assert.equal(securityOutcome(401), "DENIED")
  assert.equal(securityOutcome(403), "DENIED")
  assert.equal(securityOutcome(422), "FAILED")
  assert.equal(securityOutcome(500), "FAILED")
  assert.equal(securityOutcome(429), "RATE_LIMITED")
})

test("API scopes are shared across routes, with separate export and password limits", () => {
  assert.deepEqual(apiRateLimitPolicy("/api/users", "POST", true), apiRateLimitPolicy("/api/competitions", "DELETE", true))
  assert.equal(apiRateLimitPolicy("/api/users/me/password", "POST", true).limit, 10)
  assert.equal(apiRateLimitPolicy("/api/competitions/[id]/export", "GET", true).limit, 20)
  assert.ok(apiRateLimitPolicy("/api/users", "GET", false).limit < apiRateLimitPolicy("/api/users", "GET", true).limit)
})

test("fingerprints are keyed, scoped and do not trust caller forwarding headers locally", () => {
  const saved = { secret: process.env.AUTH_SECRET, next: process.env.NEXTAUTH_SECRET, railway: process.env.RAILWAY_ENVIRONMENT_ID }
  try {
    delete process.env.NEXTAUTH_SECRET
    delete process.env.RAILWAY_ENVIRONMENT_ID
    process.env.AUTH_SECRET = "unit-test-fingerprint-secret"
    const empty = requestFingerprint(new Headers())
    assert.equal(requestFingerprint(new Headers({ "x-real-ip": "192.0.2.1", "x-forwarded-for": "198.51.100.1" })), empty)
    process.env.RAILWAY_ENVIRONMENT_ID = "test-railway"
    const trusted = requestFingerprint(new Headers({ "x-real-ip": "192.0.2.1" }))
    assert.notEqual(trusted, empty)
    assert.match(trusted, /^[a-f0-9]{64}$/)
    assert.equal(requestFingerprint(new Headers({ "x-real-ip": "not-an-ip" })), empty)
    assert.notEqual(securityFingerprint("one", "same"), securityFingerprint("two", "same"))
    process.env.AUTH_SECRET = "different-secret"
    assert.notEqual(requestFingerprint(new Headers({ "x-real-ip": "192.0.2.1" })), trusted)
  } finally {
    for (const [key, value] of Object.entries({ AUTH_SECRET: saved.secret, NEXTAUTH_SECRET: saved.next, RAILWAY_ENVIRONMENT_ID: saved.railway })) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})
