import assert from "node:assert/strict"
import test from "node:test"
import { computeSeriesRanking, isPassedKpResult, roundHalfUp, type SeriesCompetitionData, type SeriesTeam } from "../src/lib/seriesRanking"
import { checkSeriesRules, type RuleCompetition, type RuleElement } from "../src/lib/seriesRules"

const exceptions = [
  { label: "Ei läbinud", kind: "NOT_PASSED" },
  { label: "Läbis aga ei sooritanud", kind: "PASSED_NOT_DONE" },
  { label: "Ebaõnnestus", kind: "FAILED" },
  { label: "Muu", kind: "OTHER" },
]
const kp = (prefix: string, index: number, extra: Partial<SeriesCompetitionData["elements"][number]> = {}) =>
  ({ id: `${prefix}-k${index}`, code: `KP${index}`, name: `KP ${index}`, type: "CHECKPOINT", order: index, isCancelled: false, exceptions, ...extra })
const element = (id: string, type: string, order: number) => ({ id, code: id.toUpperCase(), name: id, type, order, isCancelled: false, exceptions: [] })
const team = (id: string, cls: string | null, extra: Partial<SeriesTeam> = {}): SeriesTeam =>
  ({ id, code: id.toUpperCase(), name: `Võistkond ${id}`, class: cls, isHorsDeCompetition: false, hcFromElementOrder: null, dnfFromElementOrder: null, dnsFlag: false, ...extra })
// [elemendi id, punktid, erand]
type Entry = [string, number, string | null]
const entries = (teamId: string, list: Entry[]) => ({
  results: list.map(([elementId, , exceptionLabel]) => ({ elementId, teamId, exceptionLabel })),
  scores: list.map(([elementId, points]) => ({ elementId, teamId, points })),
})
function competition(id: string, name: string, elements: SeriesCompetitionData["elements"], teams: SeriesTeam[], perTeam: ReturnType<typeof entries>[], extraScores: SeriesCompetitionData["scores"] = [], manualPenalties: SeriesCompetitionData["manualPenalties"] = [], scoringMode: "PLUS" | "PENALTY" = "PLUS"): SeriesCompetitionData {
  return {
    id, name, scoringMode, elements, teams,
    results: perTeam.flatMap((item) => item.results),
    scores: [...perTeam.flatMap((item) => item.scores), ...extraScores],
    manualPenalties,
  }
}

test("läbitud KP ja matemaatiline ümardamine", () => {
  assert.equal(isPassedKpResult(null, exceptions), true)
  assert.equal(isPassedKpResult("Ebaõnnestus", exceptions), true)
  assert.equal(isPassedKpResult("Läbis aga ei sooritanud", exceptions), true)
  assert.equal(isPassedKpResult("Ei läbinud", exceptions), false)
  assert.equal(isPassedKpResult("Muu", exceptions), false)
  assert.deepEqual([roundHalfUp(11.5), roundHalfUp(11.49), roundHalfUp(3.5), roundHalfUp(12)], [12, 11, 4, 12])
})

test("üleriiklik pingerida: N on väikseim ümardatud keskmine, arvesse lähevad N parimat KP-d ja kõik karistused", () => {
  const south = competition("south", "Lõuna OV", [
    kp("s", 1), kp("s", 2), kp("s", 3), kp("s", 4), kp("s", 5, { isCancelled: true }),
    element("hl", "LATENESS", 6), element("mu", "OTHER", 7), element("kt", "ABANDONMENT", 8), element("pk", "PENALTY_BOX", 9),
  ], [
    team("a1", "KT"), team("a2", "NK"),
    team("hc", "KT", { isHorsDeCompetition: true }), team("dnf", "KT", { dnfFromElementOrder: 2 }), team("dns", "KT", { dnsFlag: true }), team("empty", "KT"),
  ], [
    // a1: läbis 3 (ebaõnnestumine loeb), „Ei läbinud” ei loe.
    entries("a1", [["s-k1", 30, null], ["s-k2", 20, null], ["s-k3", 0, "Ebaõnnestus"], ["s-k4", -10, "Ei läbinud"], ["s-k5", 99, null]]),
    // a2: läbis 3 („Läbis aga ei sooritanud” loeb, muu erand ei loe).
    entries("a2", [["s-k1", 25, null], ["s-k2", -5, "Läbis aga ei sooritanud"], ["s-k3", -3, "Muu"], ["s-k4", 28, null]]),
    entries("hc", [["s-k1", 30, null], ["s-k2", 30, null], ["s-k3", 30, null], ["s-k4", 30, null]]),
    entries("dnf", [["s-k1", 30, null]]),
  ], [
    { elementId: "hl", teamId: "a1", points: -5 }, { elementId: "pk", teamId: "a1", points: 15 },
    { elementId: "mu", teamId: "a2", points: -4 }, { elementId: "kt", teamId: "a2", points: -10 },
  ], [{ teamId: "a1", points: 2 }])
  const north = competition("north", "Kirde OV", [kp("n", 1), kp("n", 2), kp("n", 3), kp("n", 4)], [team("b1", "KT"), team("b2", "KT")], [
    entries("b1", [["n-k1", 10, null], ["n-k2", 20, null], ["n-k3", 30, null], ["n-k4", 5, null]]),
    entries("b2", [["n-k1", 30, null], ["n-k2", 30, null], ["n-k3", 0, null], ["n-k4", -10, "Ei läbinud"]]),
  ])

  const ranking = computeSeriesRanking([south, north])
  // Lõuna: (3 + 3) / 2 = 3; Kirde: (4 + 3) / 2 = 3,5 → 4. N = 3.
  assert.deepEqual(ranking.competitions.map((item) => [item.name, item.teamCount, item.startedTeamCount, item.passedTotal, item.average, item.roundedAverage, item.kpCount]), [
    ["Lõuna OV", 3, 2, 6, 3, 3, 4],
    ["Kirde OV", 2, 2, 7, 3.5, 4, 4],
  ])
  assert.equal(ranking.countedKpCount, 3)
  assert.deepEqual(ranking.classes, ["KT", "NK"])
  assert.deepEqual(ranking.rows.map((row) => [row.team.id, row.passedCount, row.kpTotal, row.penaltyTotal, row.total, row.rank, row.classRank]), [
    ["b1", 4, 60, 0, 60, 1, 1],
    ["b2", 3, 60, 0, 60, 1, 1],
    // a1: 30 + 20 + 0; karistus: hilinemine −5, käsitsi −2. Postkast ja tühistatud KP ei loe.
    ["a1", 3, 50, -7, 43, 3, 3],
    // a2: 28 + 25 − 3; karistus: muu −4, katkestamine −10.
    ["a2", 3, 50, -14, 36, 4, 1],
  ])
  const a1 = ranking.rows.find((row) => row.team.id === "a1")!
  assert.deepEqual(a1.kpScores.map((score) => [score.code, score.points, score.counted]), [["KP1", 30, true], ["KP2", 20, true], ["KP3", 0, true], ["KP4", -10, false]])
})

test("karistuspunktide süsteemis on parimad väikseimad ja käsitsi karistus liidetakse", () => {
  const ranking = computeSeriesRanking([competition("p", "Karistus", [kp("p", 1), kp("p", 2), kp("p", 3)], [team("x", null), team("y", null)], [
    entries("x", [["p-k1", 0, null], ["p-k2", 10, null], ["p-k3", 30, "Ei läbinud"]]),
    entries("y", [["p-k1", 5, null], ["p-k2", 5, null], ["p-k3", 5, null]]),
  ], [], [{ teamId: "x", points: 5 }], "PENALTY")])
  // Keskmine (2 + 3) / 2 = 2,5 → 3, seega arvestatakse kõik kolm KP-d.
  assert.equal(ranking.countedKpCount, 3)
  assert.deepEqual(ranking.rows.map((row) => [row.team.id, row.total, row.rank, row.classRank]), [["y", 15, 1, null], ["x", 45, 2, null]])
})

test("erineva hindamissüsteemiga osavõistlusi ei järjestata", () => {
  const plus = competition("a", "A", [kp("a", 1)], [team("t", null)], [entries("t", [["a-k1", 10, null]])])
  const penalty = competition("b", "B", [kp("b", 1)], [team("u", null)], [entries("u", [["b-k1", 10, null]])], [], [], "PENALTY")
  const ranking = computeSeriesRanking([plus, penalty])
  assert.equal(ranking.mixedScoringModes, true)
  assert.deepEqual(ranking.rows, [])
  assert.equal(ranking.countedKpCount, 1)
})

const ruleElement = (code: string, extra: Partial<RuleElement> = {}): RuleElement => ({
  id: code, code, name: `Element ${code}`, type: "CHECKPOINT", order: Number(code.replace(/\D/g, "")) || 0, isCancelled: false,
  maxValue: null, directPointsEntry: false, config: "{}",
  calcMethod: { type: "RELATIVE_RANKING", params: JSON.stringify({ higherIsBetter: true }), customFormula: null },
  exceptions: [{ label: "Ei läbinud", kind: "NOT_PASSED", penalty: 40, order: 0 }],
  fields: [{ name: "punktid", label: "Punktid", type: "NUMBER", order: 0, isResultField: true, rankingPriority: 1, formula: null, meta: JSON.stringify({ higherIsBetter: true }) }],
  sections: [],
  ...extra,
})
const ruleCompetition = (id: string, elements: RuleElement[], extra: Partial<RuleCompetition> = {}): RuleCompetition =>
  ({ id, name: id, scoringMode: "PLUS", defaultKPMaxValue: 30, defaultPKMaxValue: 15, elements, ...extra })

test("reeglite kontroll: samad reeglid ei anna erinevusi, vaikeväärtused loetakse samaks", () => {
  const check = checkSeriesRules([
    ruleCompetition("A", [ruleElement("KP1"), ruleElement("KP2")]),
    ruleCompetition("B", [
      ruleElement("KP1", { name: "Teine nimi", maxValue: 30 }),
      ruleElement("KP2", { calcMethod: { type: "RELATIVE_RANKING", params: JSON.stringify({ minPoints: 0, higherIsBetter: true }), customFormula: null } }),
    ]),
  ])
  assert.deepEqual(check.differences, [])
  assert.deepEqual(check.missing, [])
  assert.equal(check.comparedCodes, 2)
  assert.equal(check.scoringModes.length, 1)
})

test("reeglite kontroll leiab erinevused, puuduvad elemendid ja arvestusest välja jäävad elemendid", () => {
  const check = checkSeriesRules([
    ruleCompetition("A", [
      ruleElement("KP1"), ruleElement("KP2"), ruleElement("KP3"),
      ruleElement("PK1", { type: "PENALTY_BOX" }),
      ruleElement("HL", { type: "LATENESS", order: 10, calcMethod: null, exceptions: [], fields: [], config: JSON.stringify({ mode: "PER_INTERVAL", intervalMinutes: 5, penaltyPerInterval: 1 }) }),
    ]),
    ruleCompetition("B", [
      ruleElement("KP1", { maxValue: 25 }),
      ruleElement("KP2", {
        exceptions: [{ label: "Ei läbinud", kind: "NOT_PASSED", penalty: 30, order: 0 }],
        fields: [{ name: "punktid", label: "Punktid", type: "NUMBER", order: 0, isResultField: true, rankingPriority: 1, formula: null, meta: JSON.stringify({ higherIsBetter: false }) }],
      }),
      ruleElement("HL", { type: "LATENESS", order: 10, calcMethod: null, exceptions: [], fields: [], config: JSON.stringify({ intervalMinutes: 10, mode: "PER_INTERVAL", penaltyPerInterval: 1 }) }),
    ], { scoringMode: "PENALTY" }),
  ])
  assert.equal(check.scoringModes.length, 2)
  assert.deepEqual(check.differences.map((difference) => [difference.code, difference.property, difference.variants.map((variant) => [variant.competitionIds, variant.value])]), [
    ["KP1", "Maksimum", [[["A"], "30 p"], [["B"], "25 p"]]],
    ["KP2", "Erandid", [[["A"], "Ei läbinud 40 p"], [["B"], "Ei läbinud 30 p"]]],
    // Välja suund pole kirjelduses näha: variandid eristatakse tähega.
    ["KP2", "Väljad", [[["A"], "Punktid (Arv, esmane) · variant A"], [["B"], "Punktid (Arv, esmane) · variant B"]]],
    // Võtmete järjekord ei loe: erinevus on ainult intervallis.
    ["HL", "Seaded", [[["A"], "intervall (min): 5, režiim: intervalliga, karistus intervalli kohta: 1"], [["B"], "intervall (min): 10, režiim: intervalliga, karistus intervalli kohta: 1"]]],
  ])
  assert.deepEqual(check.missing, [{ code: "KP3", name: "Element KP3", missingIn: ["B"] }])
  assert.deepEqual(check.ignored.map((item) => [item.competitionId, item.code]), [["A", "PK1"]])
})
