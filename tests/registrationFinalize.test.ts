import assert from "node:assert/strict"
import test from "node:test"
import { analyzeFinalize, finalizeIssueKeys, finalizeIssueText } from "../src/lib/registrationFinalize"

test("kinnitamise kontroll leiab kõik e-posti kordused korraga ja jätab e-posti esimesele", () => {
  const analysis = analyzeFinalize(
    [
      { id: "a", teamName: "Kotkad", members: [
        { name: "Mari", email: "Ema@Example.com", isCaptain: true },
        { name: "Jüri", email: " ema@example.com " },
        { name: "Kati", email: "kati@example.com" },
        { name: "Siim" },
      ] },
      { id: "b", teamName: "Pääsukesed", members: [
        { name: "Liis", email: "kati@example.com" },
        { name: "Ants", email: "vana@example.com" },
        { name: "Tõnu", email: "konto@example.com" },
      ] },
      { id: "c", teamName: "Korras", members: [{ name: "Peeter", email: "peeter@example.com" }] },
    ],
    [
      { email: "vana@example.com", userEmail: null, teamName: "Olemasolev" },
      { email: null, userEmail: "KONTO@example.com", teamName: "Kontoga" },
    ]
  )
  assert.deepEqual(analysis.issues.map((application) => [application.teamName, application.issues.map((issue) => issue.type)]), [
    ["Kotkad", ["DUPLICATE_IN_TEAM"]],
    ["Pääsukesed", ["IN_OTHER_APPLICATION", "IN_EXISTING_TEAM", "IN_EXISTING_TEAM"]],
  ])
  assert.deepEqual(analysis.members.get("a"), [
    { name: "Mari", email: "Ema@Example.com", isCaptain: true },
    { name: "Jüri", email: undefined },
    { name: "Kati", email: "kati@example.com" },
    { name: "Siim", email: undefined },
  ])
  assert.deepEqual(analysis.members.get("b")?.map((member) => member.email), [undefined, undefined, undefined])
  assert.deepEqual(analysis.members.get("c"), [{ name: "Peeter", email: "peeter@example.com" }])
  assert.equal(
    finalizeIssueText(analysis.issues[0].issues[0]),
    "E-post ema@example.com on mitmel liikmel: Mari, Jüri. Kinnitamisel jääb see liikmele Mari."
  )
  assert.equal(
    finalizeIssueText(analysis.issues[1].issues[0]),
    "Liis: e-post kati@example.com on ka võistkonna „Kotkad” avalduses, mis esitati varem. Kinnitamisel jääb see sinna."
  )
  assert.equal(
    finalizeIssueText(analysis.issues[1].issues[2]),
    "Tõnu: e-post konto@example.com on juba võistkonna „Kontoga” liikmel. Kinnitamisel jääb see sinna."
  )
  // Võtmed on stabiilsed: sama sisend annab samad võtmed (kinnitus põhineb neil).
  const again = analyzeFinalize([{ id: "a", teamName: "Kotkad", members: [{ name: "Mari", email: "ema@example.com" }, { name: "Jüri", email: "ema@example.com" }] }], [])
  assert.deepEqual(finalizeIssueKeys(again.issues), ["a:DUPLICATE_IN_TEAM:ema@example.com"])
  assert.deepEqual(analyzeFinalize([], []).issues, [])
})
