import assert from "node:assert/strict"
import test from "node:test"
import {
  mayChangeOrganizerRole,
  parseCompetitionRoleManagementRequest,
} from "../src/lib/competitionRoleManagement"

test("rollihalduse päring normaliseerib e-posti ja eemaldab kordused", () => {
  const result = parseCompetitionRoleManagementRequest({
    email: "  KASUTAJA@EXAMPLE.COM ",
    roles: ["JUDGE", "JUDGE", "REPRESENTATIVE"],
    elementIds: ["element-1", "element-1"],
    teamIds: ["team-1", "team-1", "team-2"],
  })

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.deepEqual(result.value, {
    email: "kasutaja@example.com",
    roles: ["JUDGE", "REPRESENTATIVE"],
    elementIds: ["element-1"],
    teamIds: ["team-1", "team-2"],
  })
})

test("omaniku ja võistleja rolle ei saa rollihalduse kaudu määrata", () => {
  for (const role of ["OWNER", "COMPETITOR", "VIEWER"]) {
    const result = parseCompetitionRoleManagementRequest({
      email: "kasutaja@example.com",
      roles: [role],
    })
    assert.equal(result.ok, false)
  }
})

test("kohtunik vajab elementi ja esindaja võistkonda", () => {
  const judge = parseCompetitionRoleManagementRequest({
    email: "kohtunik@example.com",
    roles: ["JUDGE"],
    elementIds: [],
  })
  const representative = parseCompetitionRoleManagementRequest({
    email: "esindaja@example.com",
    roles: ["REPRESENTATIVE"],
    teamIds: [],
  })

  assert.equal(judge.ok, false)
  assert.equal(representative.ok, false)
})

test("tühi rolliloend eemaldab muudetavad rollid", () => {
  const result = parseCompetitionRoleManagementRequest({
    email: "kasutaja@example.com",
    roles: [],
    elementIds: ["ignoreeri"],
    teamIds: ["ignoreeri"],
  })

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.deepEqual(result.value.roles, [])
  assert.deepEqual(result.value.elementIds, [])
  assert.deepEqual(result.value.teamIds, [])
})

test("korraldaja rolli saab lisada või eemaldada ainult omanik või admin", () => {
  assert.equal(mayChangeOrganizerRole([], ["ORGANIZER"], false), false)
  assert.equal(
    mayChangeOrganizerRole(["ORGANIZER"], [], false),
    false
  )
  assert.equal(
    mayChangeOrganizerRole(["ORGANIZER"], ["ORGANIZER", "JUDGE"], false),
    true
  )
  assert.equal(mayChangeOrganizerRole([], ["ORGANIZER"], true), true)
})
