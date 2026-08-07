import assert from "node:assert/strict"
import test from "node:test"
import {
  getPersonalDataPurgeDueAt,
  isPersonalDataPurgeDue,
  isPersonalDataRetentionDays,
  scrubMemberListPersonalData,
} from "../src/lib/personalDataRetention"

test("isikuandmete säilitustähtaeg võib olla 1–90 päeva", () => {
  assert.equal(isPersonalDataRetentionDays(1), true)
  assert.equal(isPersonalDataRetentionDays(90), true)
  assert.equal(isPersonalDataRetentionDays(0), false)
  assert.equal(isPersonalDataRetentionDays(91), false)
  assert.equal(isPersonalDataRetentionDays(30.5), false)
})

test("kustutamise kuupäev arvutatakse võistluse lõpust", () => {
  const dueAt = getPersonalDataPurgeDueAt("2026-08-01T12:00:00.000Z", 30)
  assert.equal(dueAt?.toISOString(), "2026-08-31T12:00:00.000Z")
  assert.equal(
    isPersonalDataPurgeDue(
      "2026-08-01T12:00:00.000Z",
      30,
      new Date("2026-08-31T12:00:00.000Z")
    ),
    true
  )
})

test("liikmete kontakt- ja sünniandmed eemaldatakse, nimi ning roll säilivad", () => {
  const scrubbed = scrubMemberListPersonalData(
    JSON.stringify([
      {
        name: "Mari Mets",
        email: "mari@example.com",
        phone: "+372 5555",
        birthDate: "2010-05-02",
        isCaptain: true,
        assignmentRole: "Meedik",
      },
    ])
  )
  assert.deepEqual(JSON.parse(scrubbed ?? "null"), [
    {
      name: "Mari Mets",
      isCaptain: true,
      assignmentRole: "Meedik",
    },
  ])
  assert.equal(scrubMemberListPersonalData("vigane-json"), null)
})
