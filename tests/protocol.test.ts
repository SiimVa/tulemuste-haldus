import assert from "node:assert/strict"
import test from "node:test"
import { protocolFieldHeading } from "../src/lib/protocol"

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
