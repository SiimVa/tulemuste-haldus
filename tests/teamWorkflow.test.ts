import assert from "node:assert/strict"
import test from "node:test"
import {
  canEditMandate,
  canEditWorkflow,
  canReviewWorkflow,
  canSubmitMandate,
  canSubmitRegistration,
} from "../src/lib/teamWorkflow"

test("registreerimist saab muuta ja esitada mustandist või parandamisel", () => {
  for (const status of ["DRAFT", "CHANGES_REQUESTED"] as const) {
    assert.equal(canEditWorkflow(status), true)
    assert.equal(canSubmitRegistration(status), true)
  }

  assert.equal(canEditWorkflow("SUBMITTED"), false)
  assert.equal(canEditWorkflow("APPROVED"), false)
})

test("mandaati saab muuta alles kinnitatud registreerimise järel", () => {
  assert.equal(canEditMandate("DRAFT", "DRAFT"), false)
  assert.equal(canEditMandate("SUBMITTED", "DRAFT"), false)
  assert.equal(canEditMandate("APPROVED", "DRAFT"), true)
  assert.equal(canEditMandate("APPROVED", "CHANGES_REQUESTED"), true)
  assert.equal(canEditMandate("APPROVED", "SUBMITTED"), false)
})

test("mandaadi esitamiseks peab olema vähemalt üks võistleja", () => {
  assert.equal(canSubmitMandate("APPROVED", "DRAFT", 0), false)
  assert.equal(canSubmitMandate("APPROVED", "DRAFT", 1), true)
})

test("korraldaja kinnitab esitatud etapi ja võib kinnitatud etapi tagasi saata", () => {
  assert.equal(canReviewWorkflow("SUBMITTED"), true)
  assert.equal(canReviewWorkflow("DRAFT"), false)
  assert.equal(canReviewWorkflow("APPROVED"), false)
  assert.equal(canReviewWorkflow("APPROVED", "REQUEST_CHANGES"), true)
  assert.equal(canReviewWorkflow("CHANGES_REQUESTED"), false)
})
