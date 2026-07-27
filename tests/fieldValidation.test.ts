import test from "node:test"
import assert from "node:assert/strict"
import { validateClockValue, validateFieldValue } from "../src/lib/fieldValidation"

test("arvuväli ei aktsepteeri osaliselt loetavat väärtust", () => {
  assert.ok(validateFieldValue("12abc", "points", "Punktid", "NUMBER", {}))
  assert.equal(validateFieldValue("-12.5", "points", "Punktid", "NUMBER", {}), null)
})

test("kestuse minutid ja sekundid peavad olema korrektsed", () => {
  assert.ok(validateFieldValue("1:70", "time", "Aeg", "TIME", {}))
  assert.ok(validateFieldValue("1:20:80", "time", "Aeg", "TIME", {}))
  assert.equal(validateFieldValue("1:20:08", "time", "Aeg", "TIME", {}), null)
})

test("kellaaja valideerimine lubab ainult ööpäeva kellaaega", () => {
  assert.ok(validateClockValue("25:00:00", "start", "Algus", true))
  assert.ok(validateClockValue("", "start", "Algus", true))
  assert.equal(validateClockValue("23:59:59", "start", "Algus", true), null)
})
