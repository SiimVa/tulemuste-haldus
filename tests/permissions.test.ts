import assert from "node:assert/strict"
import test from "node:test"
import {
  canCreateCompetition,
  canEnterCompetitionResults,
  canManageCompetition,
  canManageCompetitionMembers,
  canManageTeamRegistration,
  canViewCompetition,
  type CompetitionAccessContext,
} from "../src/lib/permissions"

function access(
  overrides: Partial<CompetitionAccessContext> = {}
): CompetitionAccessContext {
  return {
    systemRole: "USER",
    isOwner: false,
    roles: [],
    representedTeamIds: [],
    ...overrides,
  }
}

test("admin ja omanik saavad võistlust ning liikmeid hallata", () => {
  for (const subject of [
    access({ systemRole: "ADMIN" }),
    access({ isOwner: true, roles: ["OWNER"] }),
  ]) {
    assert.equal(canViewCompetition(subject), true)
    assert.equal(canManageCompetition(subject), true)
    assert.equal(canManageCompetitionMembers(subject), true)
  }
})

test("ainult süsteemiadministraator saab uue võistluse luua", () => {
  assert.equal(canCreateCompetition("ADMIN"), true)
  assert.equal(canCreateCompetition("USER"), false)
  assert.equal(canCreateCompetition("ORGANIZER"), false)
  assert.equal(canCreateCompetition(undefined), false)
})

test("korraldaja haldab võistlust, kuid ei jaga omaniku õigusi", () => {
  const organizer = access({ roles: ["ORGANIZER"] })

  assert.equal(canViewCompetition(organizer), true)
  assert.equal(canManageCompetition(organizer), true)
  assert.equal(canManageCompetitionMembers(organizer), false)
})

test("kohtunik saab sisestada tulemusi ilma võistlust haldamata", () => {
  const judge = access({ roles: ["JUDGE"] })

  assert.equal(canViewCompetition(judge), true)
  assert.equal(canManageCompetition(judge), false)
  assert.equal(canEnterCompetitionResults(judge), true)
})

test("esindaja haldab ainult talle määratud võistkondi", () => {
  const representative = access({
    roles: ["REPRESENTATIVE"],
    representedTeamIds: ["team-a", "team-b"],
  })

  assert.equal(canViewCompetition(representative), true)
  assert.equal(canManageCompetition(representative), false)
  assert.equal(canManageTeamRegistration(representative, "team-a"), true)
  assert.equal(canManageTeamRegistration(representative, "team-b"), true)
  assert.equal(canManageTeamRegistration(representative, "team-c"), false)
})

test("mitmikrollid liidavad õigused", () => {
  const organizerAndRepresentative = access({
    roles: ["ORGANIZER", "REPRESENTATIVE"],
    representedTeamIds: ["team-a"],
  })

  assert.equal(canManageCompetition(organizerAndRepresentative), true)
  assert.equal(
    canManageTeamRegistration(organizerAndRepresentative, "team-c"),
    true
  )
})
