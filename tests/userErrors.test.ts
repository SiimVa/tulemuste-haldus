import assert from "node:assert/strict"
import test from "node:test"
import { userErrorMessage } from "../src/lib/userErrors"

class KnownError extends Error {}
class InternalError extends Error {}

test("only app-written error messages reach the user", () => {
  assert.equal(userErrorMessage(new Error("Registreerimine ei ole avatud"), "Viga"), "Registreerimine ei ole avatud")
  assert.equal(userErrorMessage(new KnownError("Vali klass"), "Viga", [KnownError]), "Vali klass")
  assert.equal(userErrorMessage(new InternalError("Invalid `prisma.team.create()` invocation"), "Viga", [KnownError]), "Viga")
  assert.equal(userErrorMessage(new TypeError("Cannot read properties of undefined"), "Viga"), "Viga")
  assert.equal(userErrorMessage("secret", "Viga"), "Viga")
})
