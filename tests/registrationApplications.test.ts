import assert from "node:assert/strict"
import test from "node:test"
import {
  canEditRegistration,
  canWithdrawRegistration,
  initialRegistrationStatus,
  isPublicRegistrationApplicationStatus,
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
  assert.equal(canWithdrawRegistration("CHANGES_REQUESTED"), true)
  assert.equal(canWithdrawRegistration("REJECTED"), false)
  assert.equal(canWithdrawRegistration("WITHDRAWN"), false)
})

test("ainult aktiivset avaldust saab registreerimise ajal muuta", () => {
  assert.equal(canEditRegistration("CONFIRMED"), true)
  assert.equal(canEditRegistration("WAITLISTED"), true)
  assert.equal(canEditRegistration("PENDING_REVIEW"), true)
  assert.equal(canEditRegistration("CHANGES_REQUESTED"), true)
  assert.equal(canEditRegistration("REJECTED"), false)
  assert.equal(canEditRegistration("WITHDRAWN"), false)
})

test("avalikus nimekirjas on ainult aktiivselt esitatud registreeringud", () => {
  assert.equal(isPublicRegistrationApplicationStatus("CONFIRMED"), true)
  assert.equal(isPublicRegistrationApplicationStatus("WAITLISTED"), true)
  assert.equal(isPublicRegistrationApplicationStatus("PENDING_REVIEW"), true)
  assert.equal(isPublicRegistrationApplicationStatus("CHANGES_REQUESTED"), true)
  assert.equal(isPublicRegistrationApplicationStatus("DRAFT"), false)
  assert.equal(isPublicRegistrationApplicationStatus("REJECTED"), false)
  assert.equal(isPublicRegistrationApplicationStatus("WITHDRAWN"), false)
})
