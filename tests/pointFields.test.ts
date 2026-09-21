import { examplePointFields } from "./pointFieldFixture"
import test from "node:test"
import assert from "node:assert/strict"
import { calculateScores, computeFields } from "../src/lib/calculators"
import { simulateElementScore } from "../src/lib/athleteSimulate"
import { compareElementTimes, durationLabel, pointFieldValue, validatePointFields } from "../src/lib/pointFields"
import { validateFieldValue } from "../src/lib/fieldValidation"
import type { FieldDefinition } from "@prisma/client"

const fields = examplePointFields().map((f, order) => ({ ...f, id: f.name, elementId: "el", sectionId: null, order, isResultField: f.rankingPriority === 1, meta: "meta" in f ? f.meta : null, validation: JSON.stringify(f.validation) })) as FieldDefinition[]
const time = fields.find(f => f.name === "aeg")!
const selection = fields[0]

test("time table covers every boundary, including below four minutes and eight minutes", () => {
  assert.equal(pointFieldValue(time, "0:00"), 15)
  assert.equal(pointFieldValue(time, "3:59"), 15)
  for (let i = 0; i < 15; i++) {
    const end = 255 + 16 * i
    assert.equal(pointFieldValue(time, durationLabel(end)), 15 - i)
    assert.equal(pointFieldValue(time, durationLabel(end + 1)), Math.max(0, 14 - i))
  }
  assert.equal(pointFieldValue(time, "1:00:00"), 0)
  assert.equal(pointFieldValue(time, ""), undefined)
  assert.equal(pointFieldValue(time, "4:99"), undefined)
})

test("NATO example sums choices, slips and time; client and server agree", () => {
  const values = { nato: "yes", sedelid: "9", lahendus: "yes", aeg: "4:15" }
  assert.equal(computeFields(values, fields).kokku, 40)
  const partial = { nato: "partly", sedelid: "5", lahendus: "no", aeg: "6:40" }
  assert.equal(computeFields(partial, fields).kokku, 16)
  assert.equal(simulateElementScore({ calcType: "ABSOLUTE_POINTS", customFormula: null, calcParams: {}, fields, values: partial, maxValue: 40, scoringMode: "PLUS" }), 16)
  const method = { id: "m", elementId: "el", sectionId: null, type: "ABSOLUTE_POINTS", params: "{}", customFormula: null }
  const entries = calculateScores({ id: "el", fields, exceptions: [], maxValue: 40, calcMethod: method }, ["4:01", "4:15"].map((aeg, i) => ({ teamId: String(i), team: { id: String(i) }, values: JSON.stringify({ ...values, aeg }), exceptionLabel: null, exceptionPenalty: null })), { scoringMode: "PLUS", defaultKPMaxValue: 40, defaultPKMaxValue: 30 })
  assert.deepEqual(entries.map(e => e.penaltyPoints), [40, 40], "time must not modify competition points")
})

test("time breaks only equal element scores when enabled, equal times stay tied", () => {
  assert.ok(compareElementTimes(fields, { aeg: "4:01" }, { aeg: "4:15" }) < 0)
  assert.equal(compareElementTimes(fields, { aeg: "4:15" }, { aeg: "4:15" }), 0)
  assert.ok(compareElementTimes(fields, {}, { aeg: "4:15" }) > 0)
  assert.equal(compareElementTimes(fields, {}, {}), 0)
  assert.equal(compareElementTimes([{ ...time, meta: JSON.stringify({ timeTieBreak: false }) }], { aeg: "4:01" }, { aeg: "4:15" }), 0)
})

test("reject forged choices, invalid times and incomplete/overlapping configuration", () => {
  assert.equal(validatePointFields(fields), null)
  assert.ok(validateFieldValue("999", selection.name, selection.label, selection.type, {}, selection.meta))
  assert.equal(validateFieldValue("no", selection.name, selection.label, selection.type, { required: true }, selection.meta), null)
  assert.ok(validateFieldValue("", time.name, time.label, time.type, { required: true }, time.meta))
  assert.ok(validateFieldValue("4:60", time.name, time.label, time.type, {}, time.meta))
  assert.ok(validatePointFields([{ ...time, meta: JSON.stringify({ timeBands: [{ through: 30, points: 1 }, { through: 20, points: 0 }], overflowPoints: 0 }) }]))
  assert.ok(validatePointFields([{ ...selection, meta: "{}" }]))
})

test("ranking points use original time instead of equal time-table points", () => {
  const inputs = [
    { nato: "yes", sedelid: "9", lahendus: "yes", aeg: "3:00" },
    { nato: "yes", sedelid: "9", lahendus: "yes", aeg: "2:00" },
    { nato: "partly", sedelid: "8", lahendus: "no", aeg: "4:00" },
  ].map((values, i) => ({ teamId: String(i), team: { id: String(i) }, values: JSON.stringify(values), exceptionLabel: null, exceptionPenalty: null }))
  for (const priority of [null, 2]) {
    const rankedFields = fields.map(f => f.name === "aeg" ? { ...f, rankingPriority: priority } : f)
    for (const type of ["RELATIVE_RANKING", "FIXED_RANKING", "VALUE_BASED"]) {
      const element = { id: "el", fields: rankedFields, exceptions: [], maxValue: 40, calcMethod: { id: "m", elementId: "el", sectionId: null, type, params: JSON.stringify({ higherIsBetter: true, minPoints: 0 }), customFormula: null } }
      const scores = calculateScores(element, inputs, { scoringMode: "PENALTY", defaultKPMaxValue: 40, defaultPKMaxValue: 30 })
      assert.deepEqual(scores.map(e => e.penaltyPoints), [type === "VALUE_BASED" ? 13.3333 : 20, 0, 40], `${type}, priority ${priority}`)
      assert.equal(scores[0].allValues.aeg, 15)
      assert.equal(scores[0].allValues.kokku, 40)
      const tied = calculateScores(element, inputs.map(r => ({ ...r, values: r.values.replace("3:00", "2:00") })), { scoringMode: "PENALTY", defaultKPMaxValue: 40, defaultPKMaxValue: 30 })
      assert.deepEqual(tied.map(e => e.penaltyPoints), [0, 0, 40])
    }
  }
})
