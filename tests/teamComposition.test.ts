import assert from "node:assert/strict"
import test from "node:test"
import {
  normalizeTeamMemberRoles,
  validateTeamComposition,
  validateTeamMemberAssignments,
} from "../src/lib/teamComposition"

const settings = {
  representativeRequired: true,
  captainRequired: true,
  memberRoles: [
    { name: "Meedik", required: true },
    { name: "Radist", required: false },
  ],
}

test("liikmerollid normaliseeritakse ja duplikaadid keelatakse", () => {
  assert.deepEqual(
    normalizeTeamMemberRoles([{ name: " Meedik ", required: true }]),
    [{ name: "Meedik", required: true }]
  )
  assert.throws(() =>
    normalizeTeamMemberRoles([
      { name: "Meedik", required: true },
      { name: "meedik", required: false },
    ])
  )
})

test("mandaadi koosseis kontrollib esindajat, kaptenit ja kohustuslikke rolle", () => {
  assert.equal(validateTeamComposition([], settings, false), "Võistkonnale tuleb määrata esindaja")
  assert.equal(
    validateTeamComposition(
      [{ role: "COMPETITOR", isCaptain: true }],
      settings,
      true
    ),
    "Võistkonnale tuleb määrata roll „Meedik”"
  )
  assert.equal(
    validateTeamComposition(
      [
        {
          role: "COMPETITOR",
          isCaptain: true,
          assignmentRole: "Meedik",
        },
      ],
      settings,
      true
    ),
    null
  )
})

test("mustandis keelatakse mitu kaptenit ja tundmatu roll", () => {
  assert.equal(
    validateTeamMemberAssignments(
      [
        { role: "COMPETITOR", isCaptain: true },
        { role: "COMPETITOR", isCaptain: true },
      ],
      settings
    ),
    "Kapteniks saab märkida ainult ühe võistkonnaliikme"
  )
  assert.equal(
    validateTeamMemberAssignments(
      [{ role: "COMPETITOR", assignmentRole: "Autojuht" }],
      settings
    ),
    "Liikmeroll „Autojuht” ei ole sellel võistlusel lubatud"
  )
})
