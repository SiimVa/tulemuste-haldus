import assert from "node:assert/strict"
import test from "node:test"
import { protocolFieldHeading, normalizeEmptyProtocolRowCount, MAX_EMPTY_PROTOCOL_ROWS } from "../src/lib/protocol"

test("tühja protokolli päis kasutab ka pika välja puhul kuvamisnime", () => {
  assert.equal(
    protocolFieldHeading({
      name: "aeg1",
      label: "Takistusraja läbimise aeg",
    }),
    "Takistusraja läbimise aeg"
  )
})

test("tühja kuvamisnime korral kasutatakse varuvariandina välja nime", () => {
  assert.equal(
    protocolFieldHeading({ name: "aeg1", label: "  " }),
    "aeg1"
  )
})


test("tühjade lisaridade arv püsib piirides ka väga suure sisendi korral", () => {
  for (const value of [101, 999, 1000, 1e100, Number.MAX_VALUE, Infinity]) {
    assert.equal(normalizeEmptyProtocolRowCount(value), MAX_EMPTY_PROTOCOL_ROWS)
  }
  for (const value of [-1, -Infinity, NaN]) {
    assert.equal(normalizeEmptyProtocolRowCount(value), 0)
  }
  assert.equal(normalizeEmptyProtocolRowCount(0), 0)
  assert.equal(normalizeEmptyProtocolRowCount(12), 12)
  assert.equal(normalizeEmptyProtocolRowCount(12.9), 12)
  assert.equal(normalizeEmptyProtocolRowCount(100), 100)
})
