import assert from "node:assert/strict"
import test from "node:test"
import {
  isAutomaticRegistrationCode,
  teamDisplayName,
} from "../src/lib/teamDisplay"

test("automaatne registreerimistähis peidetakse kasutajavaates", () => {
  assert.equal(isAutomaticRegistrationCode("REG-001"), true)
  assert.equal(
    teamDisplayName({ code: "REG-001", name: "Võistkond 1" }),
    "Võistkond 1"
  )
})

test("korraldaja määratud tähis jääb kasutajavaates nähtavaks", () => {
  assert.equal(isAutomaticRegistrationCode("VK 11"), false)
  assert.equal(
    teamDisplayName({ code: "VK 11", name: "Kontor" }),
    "VK 11 · Kontor"
  )
})
