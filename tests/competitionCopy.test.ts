import assert from "node:assert/strict"
import test from "node:test"
import {
  copiedCompetitionName,
  copiedElementName,
  nextElementCopyCode,
  remapCompetitionAllocationValues,
} from "../src/lib/competitionCopy"

test("võistluse koopia saab eristatava vaikenime", () => {
  assert.equal(copiedCompetitionName("Sügismatk"), "Sügismatk – koopia")
})

test("sama võistluse elemendi nimi eristatakse, teises säilitatakse", () => {
  assert.equal(copiedElementName("Kontrollpunkt", true), "Kontrollpunkt – koopia")
  assert.equal(copiedElementName("Kontrollpunkt", false), "Kontrollpunkt")
})

test("elemendi tähis säilib või saab järgmise vaba järjekorranumbri", () => {
  assert.equal(nextElementCopyCode("KP1", ["KP2"]), "KP1")
  assert.equal(
    nextElementCopyCode("KP1", ["KP1", "KP1-2", "KP1-3"]),
    "KP1-4"
  )
})

test("klassipõhise jaotusreegli väärtused seotakse uute klassidega", () => {
  const classIds = new Map([
    ["vana-1", "uus-1"],
    ["vana-2", "uus-2"],
  ])
  assert.equal(
    remapCompetitionAllocationValues(
      "CLASS",
      JSON.stringify(["vana-1", "vana-2", "puuduv"]),
      classIds
    ),
    JSON.stringify(["uus-1", "uus-2"])
  )
  assert.equal(
    remapCompetitionAllocationValues("FORM_FIELD", '["Harju"]', classIds),
    '["Harju"]'
  )
})
