import assert from "node:assert/strict"
import test from "node:test"
import type { FieldDefinition } from "@prisma/client"
import { recomputeSeriesKpScores, type SeriesScoringInput } from "../src/lib/seriesScoring"
import { computeSeriesRanking } from "../src/lib/seriesRanking"
import { emptyFreezeSnapshot, parseFreezeSnapshot } from "../src/lib/leaderboardFreeze"
import { parseSeriesFreezeSnapshot } from "../src/lib/seriesFreeze"

const field = { id: "f", elementId: "e", sectionId: null, name: "points", label: "Punktid", type: "NUMBER", order: 0, isResultField: true, rankingPriority: 1, formula: null, meta: null, validation: null } as FieldDefinition
const ranked = { type: "FIXED_RANKING", params: JSON.stringify({ pointsFromTeamCount: true, higherIsBetter: true }), customFormula: null }
function input(id: string, values: number[], mode: "PLUS" | "PENALTY" = "PLUS"): SeriesScoringInput {
  const elements = [1, 2].map((n) => ({
    id: `${id}-kp${n}`, code: `KP${n}`, name: `KP${n}`, type: "CHECKPOINT", order: n, isCancelled: false,
    maxValue: 30, exceptions: [{ label: "Ei läbinud", kind: "NOT_PASSED" }],
    calcMethod: ranked, fields: [field], sections: [], miscEntries: [],
  }))
  const teams = values.map((_, i) => ({ id: `${id}-${i}`, name: `${id}-${i}`, code: `${id}-${i}`, class: "K", isHorsDeCompetition: false, hcFromElementOrder: null, dnfFromElementOrder: null, dnsFlag: false }))
  const results = teams.flatMap((team, i) => elements.map((element, j) => ({
    elementId: element.id, teamId: team.id, values: JSON.stringify({ points: values[i] }),
    exceptionLabel: j === 1 ? "Ei läbinud" : null, exceptionPenalty: j === 1 ? -40 : null,
  })))
  return {
    data: { id, name: id, scoringMode: mode, elements, teams, results, scores: results.map((result) => ({ ...result, points: 999 })), manualPenalties: [{ teamId: teams[0].id, points: 2 }] },
    source: { elements, results, config: { scoringMode: mode, defaultKPMaxValue: 30, defaultPKMaxValue: 30 } },
  }
}

const kpPoints = (inputs: SeriesScoringInput[]) => recomputeSeriesKpScores(inputs).flatMap((competition) => competition.scores.filter((score) => score.elementId.endsWith("kp1")).map((score) => [score.teamId, score.points]))

test("KP punktid tulevad kõigi OV-de toorandmetest, seejärel N parimat ja karistused", () => {
  const a = input("a", [20, 10])
  const b = input("b", [40, 30])
  // OV-s parim a-0 saab ühises võrdluses kolmanda koha punktid.
  assert.deepEqual(kpPoints([a, b]), [["a-0", 2], ["a-1", 1], ["b-0", 4], ["b-1", 3]])
  const data = recomputeSeriesKpScores([a, b])
  const ranking = computeSeriesRanking(data)
  assert.equal(ranking.countedKpCount, 1)
  assert.deepEqual(ranking.rows.map((row) => [row.team.id, row.total]), [["b-1", 3], ["b-0", 2], ["a-1", 1], ["a-0", 0]])
  assert.equal(ranking.rows.find((row) => row.team.id === "a-0")!.kpScores.find((kp) => kp.code === "KP2")!.counted, false)
  assert.equal(a.data.scores[0].points, 999) // OV salvestatud punktid säilivad.
  // Teise OV toorandmete muutus muudab esimese OV võistkonna üleriiklikke punkte.
  assert.deepEqual(kpPoints([a, input("b", [5, 1])]).slice(0, 2), [["a-0", 4], ["a-1", 3]])
})

test("karistuspunktides kasutatakse ühiseid kohti ja karistused liidetakse", () => {
  const ranking = computeSeriesRanking(recomputeSeriesKpScores([input("a", [20, 10], "PENALTY"), input("b", [40, 30], "PENALTY")]))
  assert.deepEqual(ranking.rows.map((row) => [row.team.id, row.total]), [["b-1", 2], ["b-0", 3], ["a-1", 4], ["a-0", 5]])
})

test("tühistatud KP ja arvestusest väljas võistkonnad ei mõjuta ühist skaalat", () => {
  const a = input("a", [20, 10])
  const b = input("b", [40, 30])
  b.data.teams[0].dnsFlag = true
  b.data.teams[1].isHorsDeCompetition = true
  assert.deepEqual(kpPoints([a, b]), [["a-0", 2], ["a-1", 1]])
  b.data.teams.forEach((team) => { team.dnsFlag = false; team.isHorsDeCompetition = false })
  b.source!.elements[0].isCancelled = true
  // Registreerunute skaala arvestab ka selle KP tulemuseta võistkondi.
  assert.deepEqual(kpPoints([a, b]), [["a-0", 4], ["a-1", 3]])
})

test("kombineeritud KP osad arvutatakse ühises võrdluses ja KP lisapunkt säilib", () => {
  const a = input("a", [20, 10])
  const b = input("b", [40, 30])
  for (const item of [a, b]) item.source!.elements[0].sections = [
    { calcMethod: ranked, fields: [field], maxValue: 10 },
    { calcMethod: ranked, fields: [field], maxValue: 20 },
  ]
  a.source!.elements[0].miscEntries.push({ teamId: "a-0", points: -1 })
  assert.deepEqual(kpPoints([a, b]), [["a-0", 3], ["a-1", 2], ["b-0", 8], ["b-1", 6]])
})

test("klassipõhine skaala koondab sama klassi võistkonnad üle OV-de", () => {
  const a = input("a", [20, 10])
  const b = input("b", [40, 30])
  for (const item of [a, b]) {
    item.data.teams[1].class = "N"
    item.source!.elements[0].calcMethod = { ...ranked, params: JSON.stringify({ pointsFromTeamCount: true, higherIsBetter: true, teamCountScope: "CLASS" }) }
  }
  assert.deepEqual(kpPoints([a, b]), [["a-0", 1], ["a-1", 1], ["b-0", 2], ["b-1", 2]])
})

test("OV külmutus säilitab toorandmed ja üleriiklik külmutus ümberarvutatud punktid", () => {
  const a = input("a", [20, 10])
  const b = input("b", [40, 30])
  const takenAt = new Date("2026-10-16T12:00:00Z")
  const frozen = parseFreezeSnapshot(JSON.parse(JSON.stringify({ ...emptyFreezeSnapshot(takenAt), seriesScoring: a.source })), takenAt)
  assert.ok(frozen.seriesScoring)
  a.source!.results[0].values = JSON.stringify({ points: 1000 })
  const frozenData = recomputeSeriesKpScores([{ data: a.data, source: frozen.seriesScoring }, b])
  assert.equal(frozenData[0].scores[0].points, 2)
  const snapshot = parseSeriesFreezeSnapshot(JSON.parse(JSON.stringify({ version: 1, takenAt: takenAt.toISOString(), competitions: frozenData })), takenAt)
  assert.deepEqual(computeSeriesRanking(snapshot.competitions).rows, computeSeriesRanking(frozenData).rows)
  // Vana või vigase allikaga külmutus ei loe jooksvaid toorandmeid.
  assert.equal(parseFreezeSnapshot({ ...emptyFreezeSnapshot(takenAt), seriesScoring: { config: {} } }, takenAt).seriesScoring, undefined)
  assert.equal(recomputeSeriesKpScores([{ data: a.data }])[0].scores[0].points, 999)
})
