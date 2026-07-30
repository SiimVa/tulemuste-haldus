import assert from "node:assert/strict"
import test from "node:test"
import {
  RegistrationClassError,
  resolveRegistrationClass,
} from "../src/lib/registrationClasses"

test("klassideta võistlus ei nõua klassi", () => {
  assert.equal(resolveRegistrationClass([], null), null)
  assert.equal(resolveRegistrationClass([], "vana-klass"), null)
})

test("ainus klass määratakse automaatselt", () => {
  assert.equal(resolveRegistrationClass(["pohiklass"], null), "pohiklass")
  assert.equal(resolveRegistrationClass(["pohiklass"], "vale"), "pohiklass")
})

test("mitme klassi korral on kehtiv valik kohustuslik", () => {
  assert.equal(
    resolveRegistrationClass(["poisid", "tudrukud"], "tudrukud"),
    "tudrukud"
  )
  assert.throws(
    () => resolveRegistrationClass(["poisid", "tudrukud"], null),
    RegistrationClassError
  )
  assert.throws(
    () => resolveRegistrationClass(["poisid", "tudrukud"], "sega"),
    RegistrationClassError
  )
})
