import assert from "node:assert/strict"
import test from "node:test"
import {
  getPhaseStatus,
  validatePhaseWindow,
} from "../src/lib/competitionPhases"

const now = new Date("2026-07-29T12:00:00.000Z")

test("käsitsi avatud või suletud olek on ajakavast tähtsam", () => {
  assert.equal(
    getPhaseStatus({
      override: "OPEN",
      opensAt: null,
      closesAt: new Date("2026-07-28T12:00:00.000Z"),
      finalizedAt: null,
    }, now),
    "OPEN"
  )
  assert.equal(
    getPhaseStatus({
      override: "CLOSED",
      opensAt: new Date("2026-07-28T12:00:00.000Z"),
      closesAt: new Date("2026-07-30T12:00:00.000Z"),
      finalizedAt: null,
    }, now),
    "CLOSED"
  )
})

test("automaatne ajakava avab ja sulgeb etapi õigel ajal", () => {
  assert.equal(
    getPhaseStatus({
      override: "AUTO",
      opensAt: new Date("2026-07-29T13:00:00.000Z"),
      closesAt: null,
      finalizedAt: null,
    }, now),
    "NOT_OPEN"
  )
  assert.equal(
    getPhaseStatus({
      override: "AUTO",
      opensAt: new Date("2026-07-29T11:00:00.000Z"),
      closesAt: new Date("2026-07-29T13:00:00.000Z"),
      finalizedAt: null,
    }, now),
    "OPEN"
  )
  assert.equal(
    getPhaseStatus({
      override: "AUTO",
      opensAt: null,
      closesAt: new Date("2026-07-29T11:00:00.000Z"),
      finalizedAt: null,
    }, now),
    "CLOSED"
  )
})

test("kinnitatud etappi ei saa ajakava ega käsitsi valik uuesti avada", () => {
  assert.equal(
    getPhaseStatus({
      override: "OPEN",
      opensAt: null,
      closesAt: null,
      finalizedAt: now,
    }, now),
    "FINALIZED"
  )
})

test("eeltingimuseta mandaat jääb avamata", () => {
  assert.equal(
    getPhaseStatus({
      override: "OPEN",
      opensAt: null,
      closesAt: null,
      finalizedAt: null,
    }, now, false),
    "NOT_OPEN"
  )
})

test("ajakava algus peab olema lõpust varasem", () => {
  assert.equal(
    validatePhaseWindow(
      "2026-07-29T10:00:00.000Z",
      "2026-07-29T11:00:00.000Z"
    ),
    true
  )
  assert.equal(
    validatePhaseWindow(
      "2026-07-29T11:00:00.000Z",
      "2026-07-29T10:00:00.000Z"
    ),
    false
  )
})
