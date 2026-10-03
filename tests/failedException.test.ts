import assert from "node:assert/strict"
import test from "node:test"
import type { CalcMethod, FieldDefinition } from "@prisma/client"
import { calculateScores, type ScoreInput } from "../src/lib/calculators"
import { computeAllScores, type ComputeElement, type ComputeResult } from "../src/lib/scoreCompute"
import { inferExceptionKind } from "../src/lib/exceptionKinds"

const field = {
  id: "f1", name: "punktid", label: "Punktid", type: "NUMBER",
  isResultField: true, rankingPriority: 1, formula: null, order: 1, meta: null,
} as unknown as FieldDefinition

const method = (type: string, params: Record<string, unknown> = {}) =>
  ({ id: "c1", type, params: JSON.stringify(params), customFormula: null }) as unknown as CalcMethod

const exceptions = [
  { label: "Ei läbinud", penalty: 40, kind: "NOT_PASSED" },
  { label: "Kriteerium täitmata", penalty: 0, kind: "FAILED" },
  { label: "Muu", penalty: 5, kind: "OTHER" },
]
const element = (type: string, params: Record<string, unknown> = {}, maxValue = 30) => ({
  id: "e1", calcMethod: method(type, params), fields: [field], exceptions, maxValue,
})

type Entry = { id: string; pts?: number; exception?: string; hc?: boolean; cls?: string }
const results = (entries: Entry[]): ScoreInput[] => entries.map((entry) => ({
  teamId: entry.id,
  values: entry.exception ? "{}" : JSON.stringify({ punktid: entry.pts }),
  exceptionLabel: entry.exception ?? null,
  exceptionPenalty: entry.exception ? exceptions.find((item) => item.label === entry.exception)?.penalty ?? 0 : null,
  team: { id: entry.id, isHorsDeCompetition: entry.hc ?? false, class: entry.cls ?? null },
}))
// Ümberarvutus salvestab punktid kolme komakohaga.
const pointsOf = (scored: { teamId: string; penaltyPoints: number }[]) => Object.fromEntries(scored.map((item) => [item.teamId, Math.round(item.penaltyPoints * 1000) / 1000]))
const plus = { scoringMode: "PLUS" as const, defaultKPMaxValue: 30, defaultPKMaxValue: 30 }
const penalty = { scoringMode: "PENALTY" as const, defaultKPMaxValue: 30, defaultPKMaxValue: 30 }

// 7 õnnestunut (suurem on parem) ja 3 ebaõnnestunut.
const tenTeams: Entry[] = [
  ...[70, 60, 50, 40, 30, 20, 10].map((pts, index) => ({ id: `s${index + 1}`, pts })),
  { id: "f1", exception: "Kriteerium täitmata" }, { id: "f2", exception: "Kriteerium täitmata" }, { id: "f3", exception: "Kriteerium täitmata" },
]

test("pingerida valemiga: ebaõnnestunud saavad halvima tulemuse ja teiste miinimum tõuseb", () => {
  const scored = pointsOf(calculateScores(element("RELATIVE_RANKING", { higherIsBetter: true }), results(tenTeams), plus))
  assert.deepEqual([scored.s1, scored.s2, scored.s3, scored.s4, scored.s5, scored.s6, scored.s7], [30, 26.667, 23.333, 20, 16.667, 13.333, 10])
  assert.deepEqual([scored.f1, scored.f2, scored.f3], [0, 0, 0])

  const penaltyScores = pointsOf(calculateScores(element("RELATIVE_RANKING", { higherIsBetter: true }), results(tenTeams), penalty))
  assert.deepEqual([penaltyScores.s1, penaltyScores.s4, penaltyScores.s7, penaltyScores.f1], [0, 10, 20, 30])

  // Võrdluseks tavaline erand: jääb pingereast välja kindla karistusega.
  const other = pointsOf(calculateScores(element("RELATIVE_RANKING", { higherIsBetter: true }),
    results([...tenTeams.slice(0, 7), { id: "x", exception: "Muu" }]), plus))
  assert.deepEqual([other.s1, other.s7, other.x], [30, 0, -5])
})

test("ebaõnnestumine tuvastatakse liigist või nimest", () => {
  assert.equal(inferExceptionKind("Ebaõnnestus"), "FAILED")
  assert.equal(inferExceptionKind("ebaõnnestunud sooritus"), "FAILED")
  const inferred = { ...element("RELATIVE_RANKING", { higherIsBetter: true }), exceptions: [{ label: "Ebaõnnestunud", penalty: 0 }] }
  const scored = pointsOf(calculateScores(inferred, [
    ...results([{ id: "a", pts: 10 }, { id: "b", pts: 5 }]),
    { teamId: "c", values: "{}", exceptionLabel: "Ebaõnnestunud", exceptionPenalty: null, team: { id: "c" } },
  ], plus))
  assert.deepEqual([scored.a, scored.b, scored.c], [30, 15, 0])
})

test("fikseeritud punktitabel ja registreerunute arv: ebaõnnestunud saavad viimase koha punktid", () => {
  const partial = pointsOf(calculateScores(element("FIXED_RANKING", { higherIsBetter: true, fixedPoints: [20, 18, 16], minPoints: 0 }),
    results([...tenTeams.slice(0, 5), tenTeams[7], tenTeams[8]]), plus))
  assert.deepEqual([partial.s1, partial.s2, partial.s3, partial.s4, partial.s5, partial.f1, partial.f2], [20, 18, 16, 12, 8, 0, 0])

  const manual = pointsOf(calculateScores(element("FIXED_RANKING", { higherIsBetter: true, fixedPoints: [20, 18, 16, 14], fixedRankingMode: "MANUAL_ALL" }),
    results([...tenTeams.slice(0, 3), tenTeams[7], tenTeams[8]]), plus))
  assert.deepEqual([manual.s1, manual.s3, manual.f1], [20, 16, 14])

  const counted = pointsOf(calculateScores(element("FIXED_RANKING", { pointsFromTeamCount: true, teamCountScope: "ALL", higherIsBetter: true }),
    results([...tenTeams.slice(0, 3), tenTeams[7]]), { ...plus, registeredCounts: new Map([["ALL", 10]]) }))
  assert.deepEqual([counted.s1, counted.s2, counted.s3, counted.f1], [10, 9, 8, 1])

  const formula = pointsOf(calculateScores(element("FIXED_RANKING", { higherIsBetter: true, minPoints: 0 }),
    results([tenTeams[0], tenTeams[1], tenTeams[7]]), plus))
  assert.deepEqual([formula.s1, formula.s2, formula.f1], [30, 15, 0])
})

test("väärtusepõhine ja pingereata hindamine", () => {
  const value = pointsOf(calculateScores(element("VALUE_BASED", { higherIsBetter: true }), results([{ id: "a", pts: 10 }, { id: "b", pts: 0 }, { id: "f", exception: "Kriteerium täitmata" }]), penalty))
  assert.deepEqual([value.a, value.b, value.f], [0, 30, 30])

  // Ilma pingereata: ebaõnnestunu saab erandi karistuse nagu teised erandid.
  const absoluteElement = { ...element("ABSOLUTE_POINTS"), exceptions: [{ label: "Ebaõnnestus", penalty: 12, kind: "FAILED" }] }
  const absolute = pointsOf(calculateScores(absoluteElement, [
    ...results([{ id: "a", pts: 20 }]),
    { teamId: "f", values: "{}", exceptionLabel: "Ebaõnnestus", exceptionPenalty: 12, team: { id: "f" } },
  ], plus))
  assert.deepEqual([absolute.a, absolute.f], [20, -12])
  const worst = pointsOf(calculateScores(absoluteElement, [
    ...results([{ id: "a", pts: 20 }]),
    { teamId: "f", values: "{}", exceptionLabel: "Ebaõnnestus", exceptionPenalty: 12, team: { id: "f" } },
  ], penalty, { failedWithoutRanking: "WORST" }))
  assert.equal(worst.f, 30)
})

test("arvestusvälised ja ainult ebaõnnestunud võistkonnad", () => {
  const scored = pointsOf(calculateScores(element("RELATIVE_RANKING", { higherIsBetter: true }), results([
    { id: "a", pts: 70 }, { id: "b", pts: 50 }, { id: "f1", exception: "Kriteerium täitmata" },
    { id: "h", pts: 60, hc: true }, { id: "hf", exception: "Kriteerium täitmata", hc: true },
  ]), plus))
  // Arvestuses 3 kohta (a, b, f1); arvestusväline arvutatakse kõigi 5 hulgas.
  assert.deepEqual([scored.a, scored.b, scored.f1], [30, 15, 0])
  assert.deepEqual([scored.h, scored.hf], [22.5, 0])

  const onlyFailed = pointsOf(calculateScores(element("RELATIVE_RANKING", { higherIsBetter: true }), results([tenTeams[7], tenTeams[8]]), penalty))
  assert.deepEqual([onlyFailed.f1, onlyFailed.f2], [30, 30])
})

test("kombineeritud element: ebaõnnestunu on igas osas viimane, teised erandid kindla karistusega", () => {
  const sectionField = (name: string) => ({ ...field, id: name, name, label: name }) as unknown as FieldDefinition
  const element: ComputeElement = {
    id: "combo", type: "CHECKPOINT", order: 0, isCancelled: false, maxValue: null, fields: [], calcMethod: null, miscEntries: [],
    exceptions: [{ label: "Ebaõnnestus", kind: "FAILED" }, { label: "Muu", kind: "OTHER" }],
    sections: [
      { calcMethod: method("RELATIVE_RANKING", { higherIsBetter: true }), fields: [sectionField("osa1")], maxValue: 10 },
      { calcMethod: method("RELATIVE_RANKING", { higherIsBetter: true }), fields: [sectionField("osa2")], maxValue: 10 },
    ],
  }
  const team = (id: string) => ({ id, isHorsDeCompetition: false, hcFromElementOrder: null, dnfFromElementOrder: null })
  const row = (teamId: string, values: Record<string, number>, exceptionLabel: string | null = null, exceptionPenalty: number | null = null): ComputeResult =>
    ({ elementId: "combo", teamId, values: JSON.stringify(values), exceptionLabel, exceptionPenalty, team: team(teamId) })
  const scores = computeAllScores([element], [
    row("a", { osa1: 10, osa2: 1 }), row("b", { osa1: 5, osa2: 8 }),
    row("f", {}, "Ebaõnnestus", 0), row("x", {}, "Muu", 25),
  ], { scoringMode: "PENALTY", defaultKPMaxValue: 30, defaultPKMaxValue: 15 }).get("combo")!
  assert.deepEqual([scores.get("a"), scores.get("b"), scores.get("f"), scores.get("x")], [5, 5, 20, 25])
})
