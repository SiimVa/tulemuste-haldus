import assert from "node:assert/strict"
import test from "node:test"
import { seriesAnalysisData } from "../src/lib/seriesAnalysis"
import { computeSeriesRanking, type SeriesCompetitionData } from "../src/lib/seriesRanking"
import { parseSeriesFreezeSnapshot } from "../src/lib/seriesFreeze"

function fixture(): SeriesCompetitionData[] {
  return ["a", "b"].map((id, index) => ({
    id, name: id, scoringMode: "PLUS",
    elements: [1, 2].map((n) => ({ id: `${id}${n}`, code: String(n), name: `KP ${n}`, type: "CHECKPOINT", order: n, isCancelled: false, exceptions: [{ label: "Ei läbinud", kind: "NOT_PASSED" }], fields: [{ name: "time", label: "Aeg", type: "TIME", isResultField: true, rankingPriority: 1, formula: null, order: 0, meta: '{"higherIsBetter":false}' }] })),
    teams: [{ id, name: id, code: id, class: "K", isHorsDeCompetition: false, hcFromElementOrder: null, dnfFromElementOrder: null, dnsFlag: false }],
    results: [1, 2].map((n) => ({ teamId: id, elementId: `${id}${n}`, exceptionLabel: n === 2 ? "Ei läbinud" : null, values: JSON.stringify({ time: index ? "2:00" : "1:00" }) })),
    scores: [{ teamId: id, elementId: `${id}1`, points: index ? 20 : 30 }, { teamId: id, elementId: `${id}2`, points: -5 }],
    manualPenalties: [{ teamId: id, points: 2 }],
  }))
}

test("shared analysis uses national totals and KP ranks, flags N best and displays raw time", () => {
  const data = fixture()
  const ranking = computeSeriesRanking(data)
  assert.equal(ranking.countedKpCount, 1)
  const view = seriesAnalysisData(data, ranking)
  assert.deepEqual(view.teams.map((team) => [team.id, team.totalScore, team.overallRank]), [["a", 28, 1], ["b", 18, 2]])
  const a = view.teamElementStats.find((stat) => stat.teamId === "a" && stat.elementId === "1")!
  assert.deepEqual([a.rank, a.classRank, a.percentile, a.counted, a.rawResultValue], [1, 1, 100, true, "1:00"])
  assert.equal(view.teamElementStats.find((stat) => stat.teamId === "a" && stat.elementId === "2")!.counted, false)
  assert.equal(view.elementStats[0].avgRawValue, 90)
  assert.equal(view.elementStats[0].bestRawValue, 60)
})

test("series freeze preserves analysis inputs; old snapshots still have score-only analysis", () => {
  const data = fixture()
  const freeze = parseSeriesFreezeSnapshot(JSON.parse(JSON.stringify({ version: 1, takenAt: new Date().toISOString(), competitions: data })), new Date())
  const view = seriesAnalysisData(freeze.competitions, computeSeriesRanking(freeze.competitions))
  assert.equal(view.teamElementStats[0].rawResultValue, "1:00")
  const old = fixture()
  for (const competition of old) {
    for (const element of competition.elements) delete element.fields
    for (const result of competition.results) delete result.values
  }
  assert.equal(seriesAnalysisData(old, computeSeriesRanking(old)).teamElementStats[0].rawResultValue, 30)
})

test("shared analysis percentiles treat a tied first place as 100% and hide non-performance raw inputs", () => {
  const data = fixture()
  data[1].scores[0].points = 30
  const view = seriesAnalysisData(data, computeSeriesRanking(data))
  assert.deepEqual(view.teamElementStats.filter((stat) => stat.elementId === "1").map((stat) => [stat.rank, stat.percentile]), [[1, 100], [1, 100]])
  const exception = view.teamElementStats.find((stat) => stat.teamId === "a" && stat.elementId === "2")!
  assert.equal(exception.rawResultValue, null)
  assert.deepEqual(exception.fieldDisplay, {})
  assert.deepEqual(exception.rawValues, {})
})

test("raw statistics honor lower-is-better numeric methods even without field metadata", () => {
  const data = fixture()
  for (const [index, competition] of data.entries()) {
    const element = competition.elements[0]
    element.rawHigherIsBetter = false
    element.fields![0].type = "NUMBER"
    element.fields![0].meta = null
    competition.results[0].values = JSON.stringify({ time: index + 1 })
  }
  const stat = seriesAnalysisData(data, computeSeriesRanking(data)).elementStats[0]
  assert.equal(stat.bestRawValue, 1)
  assert.equal(stat.worstRawValue, 2)
})
