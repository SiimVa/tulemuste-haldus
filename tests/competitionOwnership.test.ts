import assert from "node:assert/strict"
import test from "node:test"
import { parseCompetitionOwnerRequest } from "../src/lib/competitionOwnership"

test("peakorraldajaks saab määrata kasutaja", () => {
  assert.deepEqual(parseCompetitionOwnerRequest({ userId: " user-1 " }), {
    ok: true,
    userId: "user-1",
  })
})

test("peakorraldaja võib jääda määramata", () => {
  assert.deepEqual(parseCompetitionOwnerRequest({ userId: null }), {
    ok: true,
    userId: null,
  })
})

test("puuduv või tühi peakorraldaja valik lükatakse tagasi", () => {
  assert.equal(parseCompetitionOwnerRequest({}).ok, false)
  assert.equal(parseCompetitionOwnerRequest({ userId: " " }).ok, false)
})
