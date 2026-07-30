import assert from "node:assert/strict"
import test from "node:test"
import {
  canWithdrawRegistration,
  initialRegistrationStatus,
} from "../src/lib/registrationApplications"

test("piiranguta registreerimine kinnitatakse automaatselt", () => {
  assert.equal(initialRegistrationStatus(100, null), "CONFIRMED")
})

test("täitunud üldarv viib uue avalduse ootenimekirja", () => {
  assert.equal(initialRegistrationStatus(19, 20), "CONFIRMED")
  assert.equal(initialRegistrationStatus(20, 20), "WAITLISTED")
})

test("ainult aktiivsest avaldusest saab loobuda", () => {
  assert.equal(canWithdrawRegistration("CONFIRMED"), true)
  assert.equal(canWithdrawRegistration("WAITLISTED"), true)
  assert.equal(canWithdrawRegistration("PENDING_REVIEW"), true)
  assert.equal(canWithdrawRegistration("REJECTED"), false)
  assert.equal(canWithdrawRegistration("WITHDRAWN"), false)
})
