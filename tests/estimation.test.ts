import test from "node:test"
import assert from "node:assert/strict"
import { calculateEstimation, defaultEstimation, validateEstimation, type EstimationConfig } from "../src/lib/estimation"
import { pointFieldValue, validatePointFields } from "../src/lib/pointFields"
import { validateFieldValue } from "../src/lib/fieldValidation"
import { computeFields, calculateScores } from "../src/lib/calculators"
import { simulateElementScore } from "../src/lib/athleteSimulate"
import type { FieldDefinition } from "@prisma/client"
const config: EstimationConfig = { ...defaultEstimation, targets: [{ id: "a", label: "Esimene", correct: 100 }, { id: "b", label: "Teine", correct: 200 }] }
function field(c = config): FieldDefinition { return { id: "f", elementId: "el", sectionId: null, name: "kaugused", label: "Kaugused", type: "ESTIMATION", isResultField: true, rankingPriority: 1, order: 0, formula: null, meta: JSON.stringify({ estimation: c, higherIsBetter: true }), validation: '{"required":true}' } }
const guesses = JSON.stringify({ a: "110", b: "180" })
test("absolute errors do not cancel, both error sums and points are computed", () => {
  const result = calculateEstimation(config, guesses)
  assert.equal(result.complete, true)
  assert.equal(result.points, 4)
  assert.equal(result.error, 30)
  assert.equal(result.errorPercent, 20)
  assert.equal(pointFieldValue(field(), guesses), 4)
  assert.equal(pointFieldValue(field({ ...config, result: "ERROR_ABSOLUTE" }), guesses), 30)
  assert.equal(pointFieldValue(field({ ...config, result: "ERROR_PERCENT" }), guesses), 20)
})
test("positive and negative boundaries are inclusive; just outside receives fewer points", () => {
  const single = { ...config, targets: [config.targets[0]] }
  for (const [guess, points] of [[100,3],[95,3],[105,3],[94.999,2],[105.001,2],[85,2],[115,2],[84.999,1],[115.001,1],[70,1],[130,1],[69.999,0],[130.001,0],[0,0]]) {
    assert.equal(calculateEstimation(single, JSON.stringify({ a: guess })).points, points, String(guess))
  }
  const decimal = { ...config, targets: [{ id: "x", label: "X", correct: 0.1 }] }
  assert.equal(calculateEstimation(decimal, '{"x":"0,105"}').points, 3)
})
test("ten distances sum every error and score", () => {
  const ten = { ...config, targets: Array.from({ length: 10 }, (_, i) => ({ id: String(i), label: String(i), correct: (i + 1) * 100 })) }
  const raw = JSON.stringify(Object.fromEntries(ten.targets.map((t, i) => [t.id, t.correct + (i % 2 ? -1 : 1) * t.correct / 10])))
  const result = calculateEstimation(ten, raw)
  assert.equal(result.points, 20)
  assert.equal(result.error, 550)
  assert.equal(result.errorPercent, 100)
})
test("blank references are configurable but must be filled before scoring; invalid guesses rejected", () => {
  assert.equal(validatePointFields([field()]), null)
  const unconfigured = { ...config, targets: [{ id: "a", label: "A", correct: null }] }
  assert.equal(validateEstimation(unconfigured), null)
  assert.equal(calculateEstimation(unconfigured, '{"a":100}').result, undefined)
  for (const value of ["{}", '{"a":100}', '{"a":-1,"b":200}', '{"a":"no","b":200}', '{"a":null,"b":200}', '[]']) {
    assert.ok(validateFieldValue(value, "kaugused", "Kaugused", "ESTIMATION", { required: true }, field().meta), value)
  }
  assert.ok(validateEstimation({ ...config, targets: [{ id: "a", label: "A", correct: 0 }] }))
  assert.ok(validateEstimation({ ...config, bands: [{ through: 15, points: 2 }, { through: 5, points: 3 }] }))
})
test("server, computed formulas and athlete simulation agree", () => {
  const f = field()
  const total: FieldDefinition = { ...f, id: "total", name: "kokku", type: "COMPUTED", isResultField: false, rankingPriority: null, order: 1, formula: "kaugused + 5", meta: null }
  assert.equal(computeFields({ kaugused: guesses }, [f, total]).kokku, 9)
  assert.equal(simulateElementScore({ calcType: "ABSOLUTE_POINTS", customFormula: null, calcParams: {}, fields: [f], values: { kaugused: guesses }, maxValue: 6, scoringMode: "PLUS" }), 4)
  const scores = calculateScores({ id: "el", fields: [f], exceptions: [], maxValue: 6, calcMethod: { id: "m", elementId: "el", type: "ABSOLUTE_POINTS", params: "{}", customFormula: null } }, [{ teamId: "t", team: { id: "t" }, values: JSON.stringify({ kaugused: guesses }), exceptionLabel: null, exceptionPenalty: null }], { scoringMode: "PLUS", defaultKPMaxValue: 6, defaultPKMaxValue: 30 })
  assert.equal(scores[0].penaltyPoints, 4)
})

test("mixed cm and m errors are converted to the total unit while percentages and points stay unchanged", () => {
  const mixed = { ...config, targets: config.targets.map((t, i) => ({ ...t, unit: i === 0 ? "cm" : "m" })) }
  assert.equal(validateEstimation(mixed), null)
  const result = calculateEstimation(mixed, guesses)
  assert.equal(result.points, 4)
  assert.equal(result.errorPercent, 20)
  assert.equal(result.error, 20.1)
  assert.deepEqual(result.rows.map(r => r.unit), ["cm", "m"])
  assert.equal(calculateEstimation({ ...mixed, unit: "cm" }, guesses).error, 2010)
  assert.equal(calculateEstimation({ ...mixed, result: "ERROR_ABSOLUTE" }, guesses).result, 20.1)
})

test("legacy shared units remain unchanged; incompatible units cannot be added together", () => {
  assert.equal(calculateEstimation({ ...config, unit: "cm" }, guesses).error, 30)
  assert.deepEqual(calculateEstimation({ ...config, unit: "cm" }, guesses).rows.map(r => r.unit), ["cm", "cm"])
  assert.ok(validateEstimation({ ...config, targets: config.targets.map(t => ({ ...t, unit: "kg" })) }))
  assert.equal(validateEstimation({ ...config, unit: "kg", targets: config.targets.map(t => ({ ...t, unit: "g" })) }), null)
})
