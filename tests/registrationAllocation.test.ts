import assert from "node:assert/strict"
import test from "node:test"
import {
  type AllocationCandidate,
  type AllocationRuleDefinition,
  allocateRegistrationPlaces,
} from "../src/lib/registrationAllocation"

function candidate(
  id: string,
  order: number,
  county: string,
  type: string,
  classId: string | null = null
): AllocationCandidate {
  return {
    id,
    submittedAt: order,
    createdAt: order,
    classId,
    fieldValues: { county, teamType: type },
  }
}

const countyGuarantee: AllocationRuleDefinition = {
  label: "Iga maakonna 2 kiiremat",
  type: "GROUP_GUARANTEE",
  source: "FORM_FIELD",
  fieldId: "county",
  values: [],
  quota: 2,
  order: 0,
}

test("piiranguta võistlus kinnitab kõik registreerimisjärjekorras", () => {
  const result = allocateRegistrationPlaces({
    candidates: [
      candidate("b", 2, "Harjumaa", "Noored Kotkad"),
      candidate("a", 1, "Raplamaa", "Lapsevanemad"),
    ],
    capacity: null,
    rules: [],
    classBalanceMode: "OFF",
  })
  assert.deepEqual(result.confirmedIds, ["a", "b"])
  assert.deepEqual(result.waitlistedIds, [])
})

test("grupigarantii annab igale maakonnale kohad enne üldjärjekorda", () => {
  const result = allocateRegistrationPlaces({
    candidates: [
      candidate("h1", 1, "Harjumaa", "Lapsevanemad"),
      candidate("h2", 2, "Harjumaa", "Lapsevanemad"),
      candidate("h3", 3, "Harjumaa", "Lapsevanemad"),
      candidate("r1", 4, "Raplamaa", "Noored Kotkad"),
      candidate("r2", 5, "Raplamaa", "Noored Kotkad"),
    ],
    capacity: 4,
    rules: [countyGuarantee],
    classBalanceMode: "OFF",
  })
  assert.deepEqual(result.confirmedIds, ["h1", "r1", "h2", "r2"])
  assert.deepEqual(result.waitlistedIds, ["h3"])
})

test("vastuolulised garantiid jagatakse gruppide vahel voorudena", () => {
  const result = allocateRegistrationPlaces({
    candidates: [
      candidate("h1", 1, "Harjumaa", "Noored Kotkad"),
      candidate("h2", 2, "Harjumaa", "Noored Kotkad"),
      candidate("r1", 3, "Raplamaa", "Noored Kotkad"),
      candidate("r2", 4, "Raplamaa", "Noored Kotkad"),
      candidate("t1", 5, "Tartumaa", "Noored Kotkad"),
    ],
    capacity: 3,
    rules: [countyGuarantee],
    classBalanceMode: "OFF",
  })
  assert.deepEqual(result.confirmedIds, ["h1", "r1", "t1"])
})

test("prioriteedietapid rakenduvad pärast garantiisid määratud järjekorras", () => {
  const youthPriority: AllocationRuleDefinition = {
    label: "Noorte Kotkaste ja Kodutütarde võistkonnad",
    type: "PRIORITY",
    source: "FORM_FIELD",
    fieldId: "teamType",
    values: ["Noored Kotkad", "Kodutütred"],
    quota: null,
    order: 1,
  }
  const result = allocateRegistrationPlaces({
    candidates: [
      candidate("parent", 1, "Harjumaa", "Lapsevanemad"),
      candidate("youth", 2, "Harjumaa", "Noored Kotkad"),
      candidate("county", 3, "Raplamaa", "Lapsevanemad"),
      candidate("youth2", 4, "Raplamaa", "Kodutütred"),
    ],
    capacity: 3,
    rules: [countyGuarantee, youthPriority],
    classBalanceMode: "OFF",
  })
  assert.deepEqual(result.confirmedIds, ["parent", "county", "youth"])
  assert.deepEqual(result.waitlistedIds, ["youth2"])
})

test("klassitasakaal eelistab sama etapi sees väiksema kohtade arvuga klassi", () => {
  const candidates = [
    candidate("a1", 1, "Harjumaa", "Noored Kotkad", "A"),
    candidate("a2", 2, "Harjumaa", "Noored Kotkad", "A"),
    candidate("b1", 3, "Harjumaa", "Noored Kotkad", "B"),
    candidate("b2", 4, "Harjumaa", "Noored Kotkad", "B"),
  ]
  const result = allocateRegistrationPlaces({
    candidates,
    capacity: 3,
    rules: [],
    classBalanceMode: "BALANCED",
  })
  assert.deepEqual(result.confirmedIds, ["a1", "b1", "a2"])
})
