import test from "node:test"
import assert from "node:assert/strict"
import { resendBatchFailures } from "../src/lib/resendBatch"

test("batch acknowledges successful recipients and isolates indexed failures", () => {
  assert.deepEqual([...resendBatchFailures({ data: [{ id: "a" }, { id: "b" }] }, 2)], [])
  assert.deepEqual([...resendBatchFailures({ data: [{ id: "a" }, { id: "b" }], errors: [{ index: 1, message: "Invalid to" }] }, 3)], [[1, "Invalid to"]])
  assert.equal(resendBatchFailures({ data: [], errors: [{ index: 0, message: "Invalid to" }] }, 1).size, 1)
})

test("ambiguous responses cannot mark an unconfirmed recipient as sent", () => {
  for (const payload of [null, {}, { data: [] }, { data: [{}] }, { data: [{ id: "a" }], errors: [{ index: 2, message: "bad" }] }, { data: [], errors: [{ index: 0, message: "bad" }, { index: 0, message: "duplicate" }] }]) assert.throws(() => resendBatchFailures(payload, 1))
})
