import test from "node:test"
import assert from "node:assert/strict"
import { evaluateFormula, FormulaError } from "../src/lib/formula"

test("arvutab lubatud aritmeetika ja väljade väärtused", () => {
  assert.equal(evaluateFormula("aeg + eksimused * 10", { aeg: 65, eksimused: 2 }), 85)
  assert.equal(evaluateFormula("max(0, round((tulemus - 1.5) * 2))", { tulemus: 3.2 }), 3)
  assert.equal(evaluateFormula("2 ^ 3 + abs(-4)", {}), 12)
})

test("keelab globaalsed objektid ja suvalised funktsioonid", () => {
  assert.throws(() => evaluateFormula("process.env.SECRET", {}), FormulaError)
  assert.throws(() => evaluateFormula("fetch(1)", {}), FormulaError)
  assert.throws(() => evaluateFormula("constructor(1)", {}), FormulaError)
})

test("lükkab tagasi vigased või mittelõplikud tulemused", () => {
  assert.throws(() => evaluateFormula("1 / 0", {}), FormulaError)
  assert.throws(() => evaluateFormula("puuduv + 1", {}), FormulaError)
  assert.throws(() => evaluateFormula("1; 2", {}), FormulaError)
})
