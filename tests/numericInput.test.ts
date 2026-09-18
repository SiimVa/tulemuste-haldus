import assert from "node:assert/strict"
import test from "node:test"
import { normalizeNumericInput } from "../src/lib/numericInput"

test("arvuväljale ei jää sisestamisel ega kleepimisel üleliigseid algusnulle", () => {
  for (const [input, expected] of [["01", "1"], ["00012", "12"], ["00", "0"], ["-005", "-5"], ["000.50", "0.50"], ["00,50", "0,50"]]) {
    assert.equal(normalizeNumericInput(input), expected)
  }
})

test("arvuvälja tühjus, kümnendmurrud ja pooleliolev sisestus säilivad", () => {
  for (const value of ["", "0", "10", "100", "0.01", "0,01", "-0.05", "0.", "-", "1e03"]) {
    assert.equal(normalizeNumericInput(value), value)
  }
})
