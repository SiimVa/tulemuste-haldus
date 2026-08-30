import assert from "node:assert/strict"
import test from "node:test"
import {
  getRoleInvitationState,
  maskInvitationEmail,
  mergeCompetitionRoleInvitation,
  parseStoredRoleInvitation,
  roleInvitationExpiresAt,
  serializeRoleInvitationValues,
} from "../src/lib/competitionRoleInvitations"

test("rollikutse väärtused säilivad serialiseerimisel", () => {
  const stored = serializeRoleInvitationValues({
    roles: ["JUDGE", "REPRESENTATIVE"],
    elementIds: ["element-1"],
    teamIds: ["team-1"],
  })
  assert.deepEqual(parseStoredRoleInvitation(stored), {
    roles: ["JUDGE", "REPRESENTATIVE"],
    elementIds: ["element-1"],
    teamIds: ["team-1"],
  })
})

test("vigane või tühi rollikutse lükatakse tagasi", () => {
  assert.equal(
    parseStoredRoleInvitation({
      roles: "katki",
      elementIds: "[]",
      teamIds: "[]",
    }),
    null
  )
  assert.equal(
    parseStoredRoleInvitation({
      roles: "[]",
      elementIds: "[]",
      teamIds: "[]",
    }),
    null
  )
})

test("rollikutse kehtib seitse päeva", () => {
  const now = new Date("2026-08-29T10:00:00.000Z")
  assert.equal(
    roleInvitationExpiresAt(now).toISOString(),
    "2026-09-05T10:00:00.000Z"
  )
})

test("rollikutse olek arvestab vastuvõtmist, tühistamist ja aegumist", () => {
  const now = new Date("2026-08-29T10:00:00.000Z")
  assert.equal(
    getRoleInvitationState({ expiresAt: "2026-08-30T10:00:00.000Z" }, now),
    "PENDING"
  )
  assert.equal(
    getRoleInvitationState(
      { expiresAt: "2026-08-29T09:59:59.000Z" },
      now
    ),
    "EXPIRED"
  )
  assert.equal(
    getRoleInvitationState(
      {
        expiresAt: "2026-08-30T10:00:00.000Z",
        revokedAt: "2026-08-29T09:00:00.000Z",
      },
      now
    ),
    "REVOKED"
  )
  assert.equal(
    getRoleInvitationState(
      {
        expiresAt: "2026-08-28T10:00:00.000Z",
        acceptedAt: "2026-08-27T10:00:00.000Z",
      },
      now
    ),
    "ACCEPTED"
  )
})

test("avalik kutsevaade varjab osa e-posti aadressist", () => {
  assert.equal(maskInvitationEmail("mari.mets@example.com"), "ma*******@example.com")
  assert.equal(maskInvitationEmail("a@example.com"), "a***@example.com")
})

test("kutse lisab õigused ega eemalda kasutaja olemasolevaid rolle", () => {
  assert.deepEqual(
    mergeCompetitionRoleInvitation(
      {
        roles: ["ORGANIZER", "JUDGE", "COMPETITOR"],
        elementIds: ["element-1"],
        teamIds: [],
      },
      {
        roles: ["REPRESENTATIVE"],
        elementIds: [],
        teamIds: ["team-1"],
      }
    ),
    {
      roles: ["ORGANIZER", "JUDGE", "REPRESENTATIVE"],
      elementIds: ["element-1"],
      teamIds: ["team-1"],
    }
  )
})
