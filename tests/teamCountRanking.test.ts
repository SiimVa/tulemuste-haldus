import assert from "node:assert/strict"
import test from "node:test"
import type { CalcMethod, FieldDefinition } from "@prisma/client"
import { calculateScores, type ScoreInput } from "../src/lib/calculators"
import {
  normalizeClassGroups,
  parseClassGroups,
  scopeKeyFor,
} from "../src/lib/classGroups"
import { parseFixedPointValues, parseFixedRankingParams, registeredCountPoints } from "../src/lib/fixedRanking"

const field = {
  id: "f1", name: "punktid", label: "Punktid", type: "NUMBER",
  isResultField: true, rankingPriority: 1, formula: null, order: 1, meta: null,
} as unknown as FieldDefinition

const calcMethod = (params: Record<string, unknown>) =>
  ({ id: "c1", type: "FIXED_RANKING", params: JSON.stringify(params), customFormula: null }) as unknown as CalcMethod

const element = (params: Record<string, unknown>) => ({
  id: "e1", calcMethod: calcMethod(params), fields: [field], exceptions: [], maxValue: 30,
})

// Suurem punktisumma = parem sooritus
const results = (teams: { id: string; pts: number; cls?: string }[]): ScoreInput[] =>
  teams.map((t) => ({
    teamId: t.id,
    values: JSON.stringify({ punktid: t.pts }),
    exceptionLabel: null,
    exceptionPenalty: null,
    team: { id: t.id, class: t.cls ?? null },
  }))

const pointsOf = (scored: { teamId: string; penaltyPoints: number }[]) =>
  Object.fromEntries(scored.map((s) => [s.teamId, s.penaltyPoints]))

test("plusspunktides saab parim registreerunute arvu ja halvim ühe", () => {
  const scored = calculateScores(
    element({ pointsFromTeamCount: true, teamCountScope: "ALL", higherIsBetter: true }),
    results([{ id: "a", pts: 50 }, { id: "b", pts: 30 }, { id: "c", pts: 10 }]),
    {
      scoringMode: "PLUS", defaultKPMaxValue: 30, defaultPKMaxValue: 30,
      registeredCounts: new Map([["ALL", 18]]),
    }
  )
  const p = pointsOf(scored)
  assert.equal(p.a, 18) // 18 registreeritut → parim saab 18
  assert.equal(p.b, 17)
  assert.equal(p.c, 16)
})

test("karistuspunktides saab parim ühe ja järjekord kasvab", () => {
  const scored = calculateScores(
    element({ pointsFromTeamCount: true, teamCountScope: "ALL", higherIsBetter: true }),
    results([{ id: "a", pts: 50 }, { id: "b", pts: 30 }, { id: "c", pts: 10 }]),
    {
      scoringMode: "PENALTY", defaultKPMaxValue: 30, defaultPKMaxValue: 30,
      registeredCounts: new Map([["ALL", 18]]),
    }
  )
  const p = pointsOf(scored)
  assert.equal(p.a, 1)
  assert.equal(p.b, 2)
  assert.equal(p.c, 3)
})

test("klassipõhine skoop järjestab iga klassi eraldi oma N-iga", () => {
  const scored = calculateScores(
    element({ pointsFromTeamCount: true, teamCountScope: "CLASS", higherIsBetter: true }),
    results([
      { id: "t1", pts: 50, cls: "T" }, { id: "t2", pts: 20, cls: "T" },
      { id: "n1", pts: 40, cls: "N" }, { id: "n2", pts: 35, cls: "N" },
    ]),
    {
      scoringMode: "PLUS", defaultKPMaxValue: 30, defaultPKMaxValue: 30,
      registeredCounts: new Map([["CLASS:T", 10], ["CLASS:N", 4]]),
    }
  )
  const p = pointsOf(scored)
  assert.equal(p.t1, 10) // T-klassis 10 tiimi → parim saab 10
  assert.equal(p.t2, 9)
  assert.equal(p.n1, 4) // N-klassis 4 tiimi → parim saab 4
  assert.equal(p.n2, 3)
})

test("klassigrupp koondab mitu klassi ühte pingeritta", () => {
  const groups = [{ name: "Noored", classes: ["N", "S"] }]
  const scored = calculateScores(
    element({ pointsFromTeamCount: true, teamCountScope: "GROUP", higherIsBetter: true }),
    results([
      { id: "n1", pts: 50, cls: "N" }, { id: "s1", pts: 40, cls: "S" },
      { id: "t1", pts: 45, cls: "T" },
    ]),
    {
      scoringMode: "PLUS", defaultKPMaxValue: 30, defaultPKMaxValue: 30,
      classGroups: groups,
      registeredCounts: new Map([["GROUP:Noored", 6], ["GROUP:~T", 3]]),
    }
  )
  const p = pointsOf(scored)
  assert.equal(p.n1, 6) // grupis 6 tiimi, N on grupi parim
  assert.equal(p.s1, 5)
  assert.equal(p.t1, 3) // T pole grupis → oma klass, 3 tiimi
})

test("kui registreerunute arvu pole antud, taandub kohalolijate arvule", () => {
  const scored = calculateScores(
    element({ pointsFromTeamCount: true, teamCountScope: "ALL", higherIsBetter: true }),
    results([{ id: "a", pts: 50 }, { id: "b", pts: 30 }]),
    { scoringMode: "PLUS", defaultKPMaxValue: 30, defaultPKMaxValue: 30 }
  )
  const p = pointsOf(scored)
  assert.equal(p.a, 2)
  assert.equal(p.b, 1)
})

test("kohalolijaid rohkem kui registreerunuid — punktid ei lähe alla ühe", () => {
  const scored = calculateScores(
    element({ pointsFromTeamCount: true, teamCountScope: "ALL", higherIsBetter: true }),
    results([{ id: "a", pts: 50 }, { id: "b", pts: 30 }, { id: "c", pts: 10 }]),
    {
      scoringMode: "PLUS", defaultKPMaxValue: 30, defaultPKMaxValue: 30,
      registeredCounts: new Map([["ALL", 2]]),
    }
  )
  const p = pointsOf(scored)
  assert.equal(p.a, 2)
  assert.equal(p.b, 1)
  assert.equal(p.c, 1) // kärbitud, mitte 0 ega negatiivne
})

test("käsitsi määratud kohapunktid töötavad edasi muutmata", () => {
  const scored = calculateScores(
    element({ fixedPoints: [20, 15, 10], minPoints: 0, higherIsBetter: true }),
    results([{ id: "a", pts: 50 }, { id: "b", pts: 30 }, { id: "c", pts: 10 }]),
    { scoringMode: "PLUS", defaultKPMaxValue: 30, defaultPKMaxValue: 30 }
  )
  const p = pointsOf(scored)
  assert.equal(p.a, 20)
  assert.equal(p.b, 15)
  assert.equal(p.c, 10)
})

test("klassigruppide parsimine viskab vigased kirjed ära", () => {
  assert.deepEqual(parseClassGroups('[{"name":"Noored","classes":["N","S"]}]'), [
    { name: "Noored", classes: ["N", "S"] },
  ])
  assert.deepEqual(parseClassGroups('[{"name":"","classes":["N"]}]'), [])
  assert.deepEqual(parseClassGroups('[{"name":"X","classes":[]}]'), [])
  assert.deepEqual(parseClassGroups("mitte-json"), [])
  assert.deepEqual(parseClassGroups(null), [])
})

test("klass saab kuuluda ainult ühte gruppi", () => {
  const out = normalizeClassGroups([
    { name: "A", classes: ["N", "S"] },
    { name: "B", classes: ["S", "T"] },
  ])
  assert.deepEqual(out, [
    { name: "A", classes: ["N", "S"] },
    { name: "B", classes: ["T"] },
  ])
})

test("skoobivõti eristab üld-, klassi- ja grupipingeridu", () => {
  const groups = [{ name: "Noored", classes: ["N", "S"] }]
  assert.equal(scopeKeyFor("ALL", "T", groups), "ALL")
  assert.equal(scopeKeyFor("CLASS", "T", groups), "CLASS:T")
  assert.equal(scopeKeyFor("GROUP", "N", groups), "GROUP:Noored")
  assert.equal(scopeKeyFor("GROUP", "T", groups), "GROUP:~T")
  assert.equal(scopeKeyFor("CLASS", null, groups), "CLASS:–")
})

test("iga skoop hoiab oma arvu — grupita klass ei liida CLASS-skoobi arvu üle", () => {
  const groups = [{ name: "Noored", classes: ["N", "S"] }]
  const keys = new Set<string>()
  for (const scope of ["ALL", "CLASS", "GROUP"] as const) {
    for (const cls of ["T", "N", "S"]) keys.add(scopeKeyFor(scope, cls, groups))
  }
  // ALL(1) + CLASS:T/N/S(3) + GROUP:Noored + GROUP:~T(2) = 6 eraldi võtit
  assert.equal(keys.size, 6)
  assert.equal(scopeKeyFor("CLASS", "T", groups) === scopeKeyFor("GROUP", "T", groups), false)
})

test("registreeritud võistkondade režiim kasutab plusspunktides algpunkti ja sammu", () => {
  const scored = calculateScores(
    element({
      fixedRankingMode: "REGISTERED_COUNT",
      teamCountScope: "ALL",
      teamCountBase: 2,
      teamCountStep: 1.5,
      higherIsBetter: true,
    }),
    results([{ id: "a", pts: 50 }, { id: "b", pts: 30 }, { id: "c", pts: 10 }]),
    {
      scoringMode: "PLUS", defaultKPMaxValue: 30, defaultPKMaxValue: 30,
      registeredCounts: new Map([["ALL", 5]]),
    }
  )
  assert.deepEqual(pointsOf(scored), { a: 8, b: 6.5, c: 5 })
})

test("registreeritud võistkondade režiim pöörab karistuspunktides skaala suuna", () => {
  const scored = calculateScores(
    element({
      fixedRankingMode: "REGISTERED_COUNT",
      teamCountScope: "ALL",
      teamCountBase: 0,
      teamCountStep: 2,
      higherIsBetter: true,
    }),
    results([{ id: "a", pts: 50 }, { id: "b", pts: 30 }, { id: "c", pts: 10 }]),
    {
      scoringMode: "PENALTY", defaultKPMaxValue: 30, defaultPKMaxValue: 30,
      registeredCounts: new Map([["ALL", 5]]),
    }
  )
  assert.deepEqual(pointsOf(scored), { a: 0, b: 2, c: 4 })
})

test("kõik kohad käsitsi režiim ei interpoleeri", () => {
  const scored = calculateScores(
    element({ fixedRankingMode: "MANUAL_ALL", fixedPoints: [20, 16], minPoints: 0, higherIsBetter: true }),
    results([{ id: "a", pts: 50 }, { id: "b", pts: 30 }, { id: "c", pts: 10 }]),
    { scoringMode: "PLUS", defaultKPMaxValue: 30, defaultPKMaxValue: 30 }
  )
  assert.deepEqual(pointsOf(scored), { a: 20, b: 16, c: 16 })
})

test("mõned kohad režiim interpoleerib viimase määratud ja halvima koha vahel", () => {
  const scored = calculateScores(
    element({ fixedRankingMode: "PARTIAL", fixedPoints: [20, 16], minPoints: 0, higherIsBetter: true }),
    results([
      { id: "a", pts: 50 }, { id: "b", pts: 40 }, { id: "c", pts: 30 },
      { id: "d", pts: 20 }, { id: "e", pts: 10 },
    ]),
    { scoringMode: "PLUS", defaultKPMaxValue: 30, defaultPKMaxValue: 30 }
  )
  assert.deepEqual(pointsOf(scored), { a: 20, b: 16, c: 10.667, d: 5.333, e: 0 })
})

test("PR40 automaatne seadistus jääb tahaühilduvalt tööle", () => {
  assert.deepEqual(parseFixedRankingParams({ pointsFromTeamCount: true, teamCountScope: "CLASS" }), {
    higherIsBetter: false,
    fixedRankingMode: "REGISTERED_COUNT",
    fixedPoints: [],
    minPoints: 0,
    teamCountScope: "CLASS",
    teamCountBase: 1,
    teamCountStep: 1,
  })
})

test("registreeritud arvu punktivalem piirab rangi ja töötab mõlemas süsteemis", () => {
  assert.equal(registeredCountPoints(1, 4, "PLUS", 1, 1), 4)
  assert.equal(registeredCountPoints(4, 4, "PLUS", 1, 1), 1)
  assert.equal(registeredCountPoints(1, 4, "PENALTY", 1, 1), 1)
  assert.equal(registeredCountPoints(9, 4, "PENALTY", 1, 1), 4)
})

test("tühi punktiväli ei muutu salvestamisel nulliks", () => {
  assert.deepEqual(parseFixedPointValues(["20", "", "  ", "16", -1, "vigane"]), [20, 16])
})
