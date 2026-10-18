import test from "node:test"
import assert from "node:assert/strict"
import { parseDeliveryEvent, messageDeliveryLabel, type DeliveryDates } from "../src/lib/messageDelivery"
import { resendBatchResults } from "../src/lib/resendBatch"

const dates: DeliveryDates = { deliveredAt: null, openedAt: null, bouncedAt: null, complainedAt: null, deliveryDelayedAt: null, deliveryFailedAt: null }
test("delivery events validate identifiers, date and exactly one recipient", () => {
  const event = { type: "email.opened", created_at: "2026-10-18T18:00:00Z", data: { email_id: "id", to: ["TEST@example.com"], tags: { portal_recipient_id: "recipient" } } }
  assert.equal(parseDeliveryEvent(event)?.email, "test@example.com")
  assert.equal(parseDeliveryEvent(event)?.recipientId, "recipient")
  assert.equal(parseDeliveryEvent(event)?.field, "openedAt")
  for (const value of [null, {}, { ...event, type: "email.received" }, { ...event, created_at: "bad" }, { ...event, data: { ...event.data, to: [] } }, { ...event, data: { ...event.data, to: ["a", "b"] } }]) assert.equal(parseDeliveryEvent(value), null)
})
test("late delay events cannot downgrade delivery or open; failures stay distinct", () => {
  const at = new Date()
  assert.equal(messageDeliveryLabel({ ...dates, status: "SENT" }), "Saadetud")
  assert.equal(messageDeliveryLabel({ ...dates, status: "SENT", deliveredAt: at, deliveryDelayedAt: at }), "Kohale toimetatud")
  assert.equal(messageDeliveryLabel({ ...dates, status: "SENT", openedAt: at, deliveredAt: at }), "Avatud")
  assert.equal(messageDeliveryLabel({ ...dates, status: "SENT", openedAt: at, bouncedAt: at }), "Tagasi põrganud")
  assert.equal(messageDeliveryLabel({ ...dates, status: "SENT", complainedAt: at }), "Märgitud rämpspostiks")
})
test("permissive batch IDs skip failed indices without mixing recipients", () => {
  const results = resendBatchResults({ data: [{ id: "a" }, { id: "c" }, { id: "e" }], errors: [{ index: 3, message: "bad" }, { index: 1, message: "bad" }] }, 5)
  assert.deepEqual([...results.ids], [[0, "a"], [2, "c"], [4, "e"]])
  assert.throws(() => resendBatchResults({ data: [{ id: "same" }, { id: "same" }] }, 2))
})
