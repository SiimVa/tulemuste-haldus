import assert from "node:assert/strict"
import test from "node:test"
import {
  isRegistrationAccessMode,
  isRegistrationLinkToken,
  registrationAccessModeFromRequest,
} from "../src/lib/registrationAccess"
import {
  generateRegistrationLinkToken,
  hashRegistrationLinkToken,
} from "../src/lib/registrationAccess.server"

test("registreerimise ligipääsurežiimid on piiratud kolme valikuga", () => {
  assert.equal(isRegistrationAccessMode("PUBLIC"), true)
  assert.equal(isRegistrationAccessMode("LINK_ONLY"), true)
  assert.equal(isRegistrationAccessMode("PRIVATE"), true)
  assert.equal(isRegistrationAccessMode("SECRET"), false)
})

test("vana isPublic väli säilitab API tagasiühilduvuse", () => {
  assert.equal(registrationAccessModeFromRequest(undefined, true), "PUBLIC")
  assert.equal(registrationAccessModeFromRequest(undefined, false), "PRIVATE")
  assert.equal(
    registrationAccessModeFromRequest("LINK_ONLY", true),
    "LINK_ONLY"
  )
  assert.equal(registrationAccessModeFromRequest("UNKNOWN", true), null)
})

test("registreerimislink kasutab juhuslikku 256-bitist tunnust ja salvestab räsi", () => {
  const first = generateRegistrationLinkToken()
  const second = generateRegistrationLinkToken()

  assert.equal(isRegistrationLinkToken(first), true)
  assert.equal(first.length, 43)
  assert.notEqual(first, second)
  assert.match(hashRegistrationLinkToken(first), /^[a-f0-9]{64}$/)
  assert.equal(
    hashRegistrationLinkToken(first),
    hashRegistrationLinkToken(first)
  )
  assert.notEqual(
    hashRegistrationLinkToken(first),
    hashRegistrationLinkToken(second)
  )
})
