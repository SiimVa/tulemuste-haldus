import test from "node:test"
import assert from "node:assert/strict"
import { evaluateFailureRule, failureFieldValues, parseFailureMode, resolveFailure, validateFailureRule, type FailureField, type FailureOperator, type FailureRule } from "../src/lib/failureRules"

const fields: FailureField[] = [
  { name: "cards", label: "Õigeid triaažikaarte", type: "NUMBER" },
  { name: "items", label: "Korjatud esemeid", type: "NUMBER" },
]
const config = (conditions: FailureRule["conditions"], match: FailureRule["match"] = "ALL") => ({ failureRule: { match, conditions } })
const threshold = config([{ field: "cards", operator: "<", value: 3 }])
const element = { config: threshold, fields, exceptions: [
  { label: "Kriteerium täitmata", kind: "FAILED", penalty: 10 },
  { label: "Ei läbinud", kind: "NOT_PASSED", penalty: 40 },
] }

test("threshold boundaries distinguish zero from empty, null, absent and invalid inputs", () => {
  for (const value of [undefined, null, "", " ", "invalid", Infinity]) {
    const result = evaluateFailureRule(threshold, fields, { cards: value })
    assert.equal(result.failed, null)
    assert.match(result.reason, /Automaatseks kontrolliks puudub Õigeid triaažikaarte/)
  }
  for (const [value, failed] of [[0, true], [2, true], [3, false], [4, false]] as const) assert.equal(evaluateFailureRule(threshold, fields, { cards: String(value) }).failed, failed)
})

test("all six comparisons include the intended boundary", () => {
  const expected: Record<FailureOperator, boolean[]> = { "=": [false, true, false], "≠": [true, false, true], "<": [true, false, false], "≤": [true, true, false], ">": [false, false, true], "≥": [false, true, true] }
  for (const [operator, results] of Object.entries(expected)) for (const [index, value] of [2, 3, 4].entries()) assert.equal(evaluateFailureRule(config([{ field: "cards", operator: operator as FailureOperator, value: 3 }]), fields, { cards: value }).failed, results[index])
})

test("Puhas loodus requires both criteria; ANY supports alternate failure causes", () => {
  const conditions: FailureRule["conditions"] = [{ field: "items", operator: "<", value: 5 }, { field: "cards", operator: "=", value: 0 }]
  for (const [values, all, any] of [
    [{ items: 4, cards: 0 }, true, true], [{ items: 5, cards: 0 }, false, true], [{ items: 4, cards: 1 }, false, true], [{ items: 5, cards: 1 }, false, false],
  ] as const) {
    assert.equal(evaluateFailureRule(config(conditions), fields, values).failed, all)
    assert.equal(evaluateFailureRule(config(conditions, "ANY"), fields, values).failed, any)
  }
  assert.equal(evaluateFailureRule(config(conditions, "ANY"), fields, { cards: 0 }).failed, null)
})

test("computed dependencies stay unknown until supplied; submitted computed values cannot override formulas", () => {
  const computedFields = [...fields,
    { name: "sum", label: "Summa", type: "COMPUTED", formula: "cards + items", order: 1 },
    { name: "double", label: "Topelt", type: "COMPUTED", formula: "sum * 2", order: 2 },
  ]
  const rule = config([{ field: "double", operator: "<", value: 6 }])
  assert.equal(evaluateFailureRule(rule, computedFields, { cards: 0, double: 100 }).failed, null)
  assert.equal(evaluateFailureRule(rule, computedFields, { cards: 1, items: 1, double: 100 }).failed, true)
  assert.equal(evaluateFailureRule(rule, computedFields, { cards: 1, items: 2 }).failed, false)
  assert.equal(failureFieldValues({ cards: 1, items: 1 }, [{ name: "bad", label: "Vigane", type: "COMPUTED", formula: "1 / 0" }]).bad, undefined)
})

test("point selections, booleans, time and overnight ranges use scoring units without empty defaults", () => {
  const selected: FailureField[] = [
    { name: "egg", label: "Muna valmis", type: "POINTS_SELECT", meta: JSON.stringify({ options: [{ id: "yes", points: 1 }, { id: "no", points: 0 }] }) },
    { name: "safe", label: "Ohutu", type: "CHECKBOX" },
    { name: "duration", label: "Aeg", type: "TIME" },
    { name: "range", label: "Vahemik", type: "TIME_RANGE" },
  ]
  assert.deepEqual({ ...failureFieldValues({ egg: "no", safe: false, duration: "1:23", range_start: "23:59:00", range_end: "0:01:00" }, selected) }, { egg: 0, safe: 0, duration: 83, range: 120 })
  assert.deepEqual({ ...failureFieldValues({ egg: "forged", range_start: "1:00" }, selected) }, {})
})

test("manual overrides work both ways and AUTO re-evaluates stored FAILED labels", () => {
  assert.equal(resolveFailure(element, { cards: 2 }, "AUTO").exceptionLabel, "Kriteerium täitmata")
  assert.equal(resolveFailure(element, { cards: 2 }, "FORCE_SUCCESS").exceptionLabel, null)
  assert.equal(resolveFailure(element, { cards: 10 }, "FORCE_FAILED").exceptionLabel, "Kriteerium täitmata")
  assert.equal(resolveFailure(element, { cards: 3 }, "AUTO", "Kriteerium täitmata").exceptionLabel, null)
  assert.throws(() => resolveFailure(element, {}, "AUTO"), /Automaatseks kontrolliks puudub/)
  assert.equal(resolveFailure(element, {}, "FORCE_FAILED").exceptionPenalty, 10)
  assert.equal(resolveFailure(element, {}, "FORCE_SUCCESS").exceptionLabel, null)
  assert.equal(resolveFailure(element, {}, "AUTO", "Ei läbinud").exceptionPenalty, 40)
  assert.equal(resolveFailure({ ...element, config: {} }, {}, "AUTO").exceptionLabel, null)
  assert.equal(parseFailureMode(undefined, "Kriteerium täitmata", element.exceptions), "FORCE_FAILED")
  assert.throws(() => parseFailureMode("UNKNOWN", null, element.exceptions), /Vigane/)
})

test("configuration validation rejects removed, ambiguous, nonnumeric fields and invalid operators or thresholds", () => {
  assert.equal(validateFailureRule(threshold, fields), null)
  assert.match(validateFailureRule(threshold, [])!, /Paranda tingimust või eemalda/)
  assert.match(validateFailureRule(threshold, [...fields, fields[0]])!, /pole arvuline/)
  assert.match(validateFailureRule(threshold, [{ ...fields[0], type: "TEXT" }])!, /pole arvuline/)
  assert.match(validateFailureRule(config([{ field: "cards", operator: "<", value: NaN }]), fields)!, /piirväärtus/)
  assert.match(validateFailureRule({ failureRule: { match: "ALL", conditions: [] } }, fields)!, /Vigane/)
})
