import assert from "node:assert/strict"
import test from "node:test"
import { mandateProgress, matchesSearch, statusCounts } from "../src/lib/registrationDashboard"

test("mandate progress counts submitted and approved teams as done", () => {
  const progress = mandateProgress([
    { mandateStatus: "APPROVED" },
    { mandateStatus: "APPROVED" },
    { mandateStatus: "SUBMITTED" },
    { mandateStatus: "CHANGES_REQUESTED" },
    { mandateStatus: "DRAFT" },
    { mandateStatus: "DRAFT" },
  ])
  assert.deepEqual(progress, { total: 6, done: 3, approved: 2, submitted: 1, changesRequested: 1, notStarted: 2 })
  assert.deepEqual(mandateProgress([]), { total: 0, done: 0, approved: 0, submitted: 0, changesRequested: 0, notStarted: 0 })
})

test("search matches every word across fields, ignoring case", () => {
  const fields = ["Öökullid", "Katrin Liidlein", "katrin@example.com", null, "Sega"]
  assert.equal(matchesSearch("", fields), true)
  assert.equal(matchesSearch("  ", fields), true)
  assert.equal(matchesSearch("ÖÖKULL", fields), true)
  assert.equal(matchesSearch("katrin sega", fields), true)
  assert.equal(matchesSearch("katrin poisid", fields), false)
})

test("status counts keep the given order and drop empty statuses", () => {
  const items = [{ status: "B" }, { status: "A" }, { status: "B" }] as { status: "A" | "B" | "C" }[]
  assert.deepEqual(statusCounts(items, ["C", "B", "A"] as const), [
    { status: "B", count: 2 },
    { status: "A", count: 1 },
  ])
})
