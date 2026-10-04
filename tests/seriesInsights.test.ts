import assert from "node:assert/strict"
import test from "node:test"
import { computeSeriesRanking, type SeriesCompetitionData, type SeriesTeam } from "../src/lib/seriesRanking"
import { classComparison, closeContests, competitionComparison, kpComparison, seriesKpCodes, teamAnalysis, topTeams } from "../src/lib/seriesInsights"
import { normalizeSeriesDashboardConfig, parseSeriesDashboardConfig, seriesDashboardConfigSchema, visibleSeriesWidgets } from "../src/lib/seriesDashboard"
import { parseSeriesFreezeSnapshot } from "../src/lib/seriesFreeze"

const exceptions = [{ label: "Ei läbinud", kind: "NOT_PASSED" }]
const team = (id: string, cls: string): SeriesTeam => ({ id, code: id.toUpperCase(), name: `Võistkond ${id}`, class: cls, isHorsDeCompetition: false, hcFromElementOrder: null, dnfFromElementOrder: null, dnsFlag: false })
// [võistkond, element, punktid, erand]
type Entry = [string, string, number, string | null]
function competition(id: string, name: string, kpMax: [number, number], teams: SeriesTeam[], entries: Entry[], extra: Partial<SeriesCompetitionData> = {}): SeriesCompetitionData {
  return {
    id, name, scoringMode: "PLUS", teams,
    elements: [
      { id: `${id}-kp1`, code: "KP1", name: "Esimene", type: "CHECKPOINT", order: 0, isCancelled: false, exceptions, maxValue: kpMax[0] },
      { id: `${id}-kp2`, code: "KP2", name: "Teine", type: "CHECKPOINT", order: 1, isCancelled: false, exceptions, maxValue: kpMax[1] },
      { id: `${id}-hl`, code: "HL", name: "Hilinemine", type: "LATENESS", order: 2, isCancelled: false, exceptions: [] },
    ],
    results: entries.filter(([, element]) => element !== "hl").map(([teamId, element, , exceptionLabel]) => ({ elementId: `${id}-${element}`, teamId, exceptionLabel })),
    scores: entries.map(([teamId, element, points]) => ({ elementId: `${id}-${element}`, teamId, points })),
    manualPenalties: [],
    ...extra,
  }
}

// Kirde: b1 50, b2 20 (keskmine 2). Lõuna: a1 50 − 5 − 2 = 43, a2 0, a3 50 (keskmine 5/3 → 2). N = 2.
const north = competition("north", "Kirde OV", [30, 25], [team("b1", "KT"), team("b2", "NK")], [
  ["b1", "kp1", 25, null], ["b1", "kp2", 25, null], ["b2", "kp1", 15, null], ["b2", "kp2", 5, null],
])
const south = competition("south", "Lõuna OV", [30, 30], [team("a1", "KT"), team("a2", "NK"), team("a3", "KT")], [
  ["a1", "kp1", 30, null], ["a1", "kp2", 20, null], ["a1", "hl", -5, null],
  ["a2", "kp1", 10, null], ["a2", "kp2", -10, "Ei läbinud"],
  ["a3", "kp1", 20, null], ["a3", "kp2", 30, null],
], { manualPenalties: [{ teamId: "a1", points: 2, description: "Prügi" }] })
const data = [north, south]
const ranking = computeSeriesRanking(data)

test("pingerea alus ülevaate jaoks", () => {
  assert.equal(ranking.countedKpCount, 2)
  assert.deepEqual(ranking.rows.map((row) => [row.team.id, row.total, row.rank, row.classRank]), [
    ["b1", 50, 1, 1], ["a3", 50, 1, 1], ["a1", 43, 3, 3], ["b2", 20, 4, 1], ["a2", 0, 5, 2],
  ])
  assert.deepEqual(seriesKpCodes(ranking), ["KP1", "KP2"])
})

test("osavõistluste ja klasside võrdlus", () => {
  assert.deepEqual(competitionComparison(ranking).map((row) => [row.name, row.teamCount, row.roundedAverage, row.averageTotal, row.bestTotal, row.best?.name, row.isMinimum]), [
    ["Kirde OV", 2, 2, 35, 50, "Võistkond b1", true],
    ["Lõuna OV", 3, 2, 31, 50, "Võistkond a3", true],
  ])
  const classes = classComparison(ranking)
  assert.deepEqual(classes.competitions.map((item) => item.name), ["Kirde OV", "Lõuna OV"])
  assert.deepEqual(classes.rows.map((row) => [row.className, row.teamCount, row.averageTotal, row.bestTotal, row.byCompetition]), [
    ["KT", 3, 47.67, 50, [50, 46.5]],
    ["NK", 2, 10, 20, [20, 0]],
  ])
})

test("parimad ja tihedad heitlused", () => {
  const top = topTeams(ranking, 2)
  assert.deepEqual(top.map((group) => [group.className, group.entries.map((entry) => [entry.team.id, entry.rank, entry.gapToPrevious, entry.gapToFirst])]), [
    [null, [["b1", 1, null, 0], ["a3", 1, 0, 0]]],
    ["KT", [["b1", 1, null, 0], ["a3", 1, 0, 0]]],
    ["NK", [["b2", 1, null, 0], ["a2", 2, 20, 20]]],
  ])
  assert.deepEqual(closeContests(ranking, 7).map((contest) => [contest.className, contest.upper.team.id, contest.lower.team.id, contest.gap]), [
    [null, "b1", "a3", 0], [null, "a3", "a1", 7], ["KT", "b1", "a3", 0], ["KT", "a3", "a1", 7],
  ])
})

test("KP-d osavõistlustes: raskeim protsendina maksimumist", () => {
  const comparison = kpComparison(data, ranking)
  assert.deepEqual(comparison.rows.map((row) => [row.code, row.cells.map((cell) => [cell.averagePoints, cell.averagePercent, cell.passedPercent]), row.spread, row.hardestCompetitionId]), [
    // Võrdne keskmine: raskeimat ei märgita.
    ["KP1", [[20, 66.67, 100], [20, 66.67, 100]], 0, null],
    // Kirde 15/25 = 60%, Lõuna 13,33/30 = 44,44% → Lõuna on raskem, kuigi punktide vahe on väike.
    ["KP2", [[15, 60, 100], [13.33, 44.44, 66.67]], 1.67, "south"],
  ])
})

test("võistkonna analüüs", () => {
  const analysis = teamAnalysis(data, ranking, "a1")!
  assert.equal(analysis.row.total, 43)
  assert.deepEqual([analysis.teamCount, analysis.classTeamCount, analysis.beatenPercent], [5, 3, 50])
  assert.deepEqual(analysis.gap, { classFirst: 7, classPrevious: 7, overallFirst: 7, overallPrevious: 7 })
  assert.deepEqual(analysis.kps.map((kp) => [kp.code, kp.points, kp.counted, kp.passed, kp.competitionAverage]), [["KP1", 30, true, true, 20], ["KP2", 20, true, true, 13.33]])
  assert.deepEqual(analysis.penalties, [{ label: "HL · Hilinemine", points: -5 }, { label: "Prügi", points: -2 }])
  const skipped = teamAnalysis(data, ranking, "a2")!
  assert.deepEqual(skipped.kps.map((kp) => [kp.code, kp.passed, kp.exceptionLabel]), [["KP1", true, null], ["KP2", false, "Ei läbinud"]])
  assert.equal(teamAnalysis(data, ranking, "olematu"), null)
})

test("ülevaate seaded: vaikimisi, tundmatud vidinad, lävendid ja nähtavus", () => {
  const defaults = parseSeriesDashboardConfig(null)
  assert.deepEqual(visibleSeriesWidgets(defaults, "public"), ["summary", "topTeams", "competitions"])
  assert.equal(visibleSeriesWidgets(defaults, "internal").length, 6)
  const config = normalizeSeriesDashboardConfig({
    widgets: [{ id: "kpComparison", internal: true, public: true }, { id: "tundmatu", public: true }, { id: "summary", internal: false, public: true }, { id: "summary", public: false }],
    thresholds: { topCount: 99, closeGap: -1, screenRotateSeconds: "abc" },
  })
  assert.deepEqual(config.widgets.slice(0, 2), [{ id: "kpComparison", internal: true, public: true }, { id: "summary", internal: false, public: true }])
  assert.equal(config.widgets.length, 6)
  assert.deepEqual(config.thresholds, { topCount: 20, closeGap: 0, screenRotateSeconds: 20 })
  assert.deepEqual(visibleSeriesWidgets(config, "internal").slice(0, 2), ["kpComparison", "topTeams"])
  assert.equal(parseSeriesDashboardConfig("{vigane").widgets.length, 6)
  assert.equal(seriesDashboardConfigSchema.safeParse({ widgets: [{ id: "summary", internal: true, public: true }, { id: "summary", internal: true, public: false }], thresholds: { topCount: 5, closeGap: 3, screenRotateSeconds: 20 } }).success, false)
  assert.equal(seriesDashboardConfigSchema.safeParse({ widgets: [{ id: "summary", internal: true, public: true }], thresholds: { topCount: 5, closeGap: 3, screenRotateSeconds: 20 } }).success, true)
})

test("külmutuse snapshot loetakse tagasi samana, vigane annab tühja seisu", () => {
  const takenAt = new Date("2026-10-17T12:00:00Z")
  const roundTrip = parseSeriesFreezeSnapshot(JSON.parse(JSON.stringify({ version: 1, takenAt: takenAt.toISOString(), competitions: data })), takenAt)
  assert.deepEqual(computeSeriesRanking(roundTrip.competitions).rows.map((row) => [row.team.id, row.total]), ranking.rows.map((row) => [row.team.id, row.total]))
  assert.deepEqual(parseSeriesFreezeSnapshot({ version: 2 }, takenAt), { version: 1, takenAt: takenAt.toISOString(), competitions: [] })
  assert.deepEqual(parseSeriesFreezeSnapshot(null, takenAt).competitions, [])
})
