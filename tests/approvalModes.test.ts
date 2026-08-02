import assert from "node:assert/strict"
import test from "node:test"
import {
  applicationStatusAfterSubmission,
  isApprovalMode,
  workflowStatusAfterSubmission,
} from "../src/lib/approvalModes"

test("kinnitamisrežiim lubab ainult automaatset ja käsitsi valikut", () => {
  assert.equal(isApprovalMode("AUTOMATIC"), true)
  assert.equal(isApprovalMode("MANUAL"), true)
  assert.equal(isApprovalMode("AUTO"), false)
})

test("automaatne režiim kinnitab töövoo ja saadab avalduse jaotusse", () => {
  assert.equal(workflowStatusAfterSubmission("AUTOMATIC"), "APPROVED")
  assert.equal(applicationStatusAfterSubmission("AUTOMATIC"), "WAITLISTED")
})

test("käsitsi režiim jätab esituse korraldaja otsust ootama", () => {
  assert.equal(workflowStatusAfterSubmission("MANUAL"), "SUBMITTED")
  assert.equal(applicationStatusAfterSubmission("MANUAL"), "PENDING_REVIEW")
})
