import assert from "node:assert/strict"
import test from "node:test"
import { buildPublicLeaderboard, type PublicLeaderboardInput, type PublicLeaderboardTeam } from "../src/lib/publicLeaderboard"
import { emptyFreezeSnapshot } from "../src/lib/leaderboardFreeze"

const team = (id: string, overrides: Partial<PublicLeaderboardTeam> = {}): PublicLeaderboardTeam => ({
  id, code: id, name: `Team ${id}`, class: "A", isHorsDeCompetition: false, hcFromElementOrder: null,
  dnfFromElementOrder: null, dnfReason: null, dqFromElementOrder: null, dnsFlag: false, ...overrides,
})
const fixture = (): PublicLeaderboardInput => ({
  competition: { id: "comp", name: "Test", scoringMode: "PENALTY", analysisAccessMode: "PUBLIC", tieBreakConfig: "{}", registrationClasses: [{ name: "Unused" }] },
  teams: [team("2"), team("10"), team("1", { class: "B" })],
  elements: [{ id: "e1", code: "KP1", name: "First", type: "CHECKPOINT", isCancelled: false }, { id: "e2", code: "KP2", name: "Second", type: "CHECKPOINT", isCancelled: false }],
  scores: [{ teamId: "2", elementId: "e1", penaltyPoints: 8 }, { teamId: "10", elementId: "e1", penaltyPoints: 4 }, { teamId: "1", elementId: "e1", penaltyPoints: 4 }, { teamId: "1", elementId: "e2", penaltyPoints: 0 }],
  penalties: [{ teamId: "10", points: 1 }, { teamId: "10", points: 2 }], miscEntries: [], freeze: null,
})

test("public snapshot preserves shared ranks, class ranks, whole-board gaps, manual penalties and missing versus zero scores", () => {
  const snapshot = buildPublicLeaderboard(fixture())
  assert.deepEqual(snapshot.ranked.map(row => [row.team.id, row.total, row.rank, row.classRank]), [["1", 4, 1, 1], ["10", 7, 2, 1], ["2", 8, 3, 2]])
  assert.deepEqual(snapshot.ranked[0].points, [4, 0])
  assert.deepEqual(snapshot.ranked[1].points, [4, null])
  assert.equal(snapshot.ranked[1].manualTotal, 3)
  assert.deepEqual(snapshot.ranked[2].gap, { classFirst: 1, classPrevious: 1, overallFirst: 4, overallPrevious: 1 })
  assert.deepEqual(snapshot.classes, ["A", "B", "Unused"])
  const tied = fixture()
  tied.penalties = []
  assert.deepEqual(buildPublicLeaderboard(tied).ranked.map(row => row.rank), [1, 1, 3])
})

test("PLUS mode subtracts manual penalties and preserves tie-break criteria and explanations", () => {
  const input = fixture()
  input.competition.scoringMode = "PLUS"
  input.competition.tieBreakConfig = JSON.stringify({ enabled: true, elementIds: null, rules: [{ kind: "FEWER_PENALTIES", enabled: true }] })
  input.scores.push({ teamId: "10", elementId: "e2", penaltyPoints: 7 })
  const snapshot = buildPublicLeaderboard(input)
  assert.deepEqual(snapshot.ranked.map(row => [row.team.id, row.total, row.rank]), [["2", 8, 1], ["10", 8, 2], ["1", 4, 3]])
  assert.match(snapshot.ranked[0].tieBreakReason ?? "", /Vähem lisakaristusi/)
  assert.equal(snapshot.competition.scoringMode, "PLUS")
})

test("arvestusvälised and abandoned teams are excluded from ranks without losing status or misc explanations", () => {
  const input = fixture()
  input.teams[0].hcFromElementOrder = 1
  input.teams[1].dnfFromElementOrder = 0
  input.teams[1].dnfReason = "Missing member"
  input.teams[2].dqFromElementOrder = 2
  input.teams[2].dnsFlag = true
  input.miscEntries = [{ teamId: "1", elementId: "e2", description: "Üks liige", points: 5, element: { type: "ABANDONMENT" } }]
  const snapshot = buildPublicLeaderboard(input)
  assert.equal(snapshot.ranked.length, 1)
  assert.equal(snapshot.ranked[0].team.dnsFlag, true)
  assert.equal(snapshot.ranked[0].team.dqFromElementOrder, 2)
  assert.equal(snapshot.ranked[0].memberAbandoned, true)
  assert.deepEqual(snapshot.ranked[0].misc.e2, [{ description: "Üks liige", points: 5 }])
  assert.equal(snapshot.horsCompetition[0].rank, null)
  assert.equal(snapshot.abandoned[0].team.dnfReason, "Missing member")
  assert.equal(snapshot.abandoned[0].classRank, null)
})

test("freeze uses snapshot scores, penalties, misc entries and statuses while names remain live", () => {
  const input = fixture()
  const freezeAt = new Date("2026-10-01T12:00:00Z")
  const frozen = emptyFreezeSnapshot(freezeAt)
  frozen.scores = [{ teamId: "2", elementId: "e1", points: 1 }, { teamId: "1", elementId: "e1", points: 20 }]
  frozen.penalties = [{ teamId: "2", points: 2, description: "Frozen penalty", enteredAt: freezeAt.toISOString() }]
  frozen.teams = input.teams.map(item => ({ ...item }))
  frozen.teams[0].dnsFlag = true
  frozen.elements = [{ id: "e1", isCancelled: true }]
  frozen.miscEntries = [{ teamId: "2", elementId: "e2", description: "Frozen", points: 4, elementType: "ABANDONMENT" }]
  input.freeze = { freezeAt, snapshot: frozen }
  input.teams[0].name = "Renamed team"
  input.teams[0].dnfFromElementOrder = 0
  const snapshot = buildPublicLeaderboard(input)
  const row = snapshot.ranked.find(row => row.team.id === "2")!
  assert.equal(row.total, 3)
  assert.equal(row.team.name, "Renamed team")
  assert.equal(row.team.dnfFromElementOrder, null)
  assert.equal(row.team.dnsFlag, true)
  assert.deepEqual(row.points, [1, null])
  assert.equal(row.misc.e2[0].description, "Frozen")
  assert.equal(row.memberAbandoned, true)
  assert.equal(snapshot.elements[0].isCancelled, true)
  assert.equal(snapshot.freezeAt, freezeAt.toISOString())
  assert.equal(snapshot.competition.analysisAvailable, false)
})

test("invalid frozen data cannot fall back to live scores; private fields never enter the public DTO", () => {
  const input = fixture()
  Object.assign(input.competition, { registrationTokenHash: "secret-hash", organizerId: "private-user", analysisTokenHash: "private-analysis" })
  Object.assign(input.teams[0], { pendingRepresentativeEmail: "private@example.com", registrationReviewNote: "private-review", members: [{ birthDate: "2000-01-01" }] })
  Object.assign(input.elements[0], { config: "private-config", accessTokens: [{ token: "private-token" }] })
  input.competition.analysisAccessMode = "PRIVATE"
  input.freeze = { freezeAt: new Date("2026-10-01"), snapshot: emptyFreezeSnapshot(new Date("2026-10-01")) }
  const snapshot = buildPublicLeaderboard(input)
  assert.ok(snapshot.ranked.every(row => row.total === 0 && row.points.every(value => value === null)))
  assert.equal(snapshot.competition.analysisAvailable, false)
  assert.doesNotMatch(JSON.stringify(snapshot), /private-|private@|secret-hash|birthDate|registrationTokenHash|accessTokens/)
})
