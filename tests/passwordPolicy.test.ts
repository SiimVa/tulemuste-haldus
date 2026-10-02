import assert from "node:assert/strict"
import test from "node:test"
import { MIN_PASSWORD_LENGTH, passwordPolicyError } from "../src/lib/passwordPolicy"

test("password policy requires a long string that the sign-in form accepts", () => {
  assert.equal(passwordPolicyError("x".repeat(MIN_PASSWORD_LENGTH)), null)
  assert.equal(passwordPolicyError("x".repeat(1024)), null)
  for (const value of [undefined, null, 123456789012345, "", "x".repeat(MIN_PASSWORD_LENGTH - 1), "x".repeat(1025)]) {
    assert.notEqual(passwordPolicyError(value), null, String(value))
  }
})
