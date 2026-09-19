import assert from "node:assert/strict"
import test from "node:test"
import { defaultTieBreakConfig, parseTieBreakConfig, rankLeaderboard, tieBreakSchema, type TieBreakConfig, type TieBreakKind, type TieBreakRow } from "../src/lib/tieBreak"

const elements = ["x", "y", "z"].map(id => ({ id, code: id.toUpperCase(), name: id, type: "CHECKPOINT", isCancelled: false }))
const row = (id: string, values: number[], cls = "A", manualTotal = 0, total?: number): TieBreakRow => ({
  team: { id, code: id, name: id, class: cls }, byElement: Object.fromEntries(values.map((v, i) => [elements[i].id, v])), manualTotal,
  total: total ?? values.reduce((sum, value) => sum + value, 0) - manualTotal,
})
const config = (...kinds: TieBreakKind[]): TieBreakConfig => ({ enabled: true, elementIds: null, rules: kinds.map(kind => ({ kind, enabled: true, elementId: "x" })) })
const rows = [row("A", [10, 10, 0]), row("B", [7, 7, 6]), row("C", [6, 6, 5]), row("D", [5, 5, 4]), row("E", [4, 4, 3])]

test("disabled tie breaking and unresolved ties share places, without alphabetical sporting advantage", () => {
  const ranked = rankLeaderboard(rows, elements, "PLUS", defaultTieBreakConfig())
  assert.deepEqual(ranked.map(r => r.rank), [1, 1, 3, 4, 5])
  assert.match(ranked[0].tieBreakReason!, /Jagatud koht/)
  assert.equal(ranked[2].tieBreakReason, null)
})

test("best places compares counts of first, then second places, while worst place rewards consistency", () => {
  assert.equal(rankLeaderboard(rows, elements, "PLUS", config("BEST_PLACES"))[0].team.id, "A")
  assert.match(rankLeaderboard(rows, elements, "PLUS", config("BEST_PLACES"))[0].tieBreakReason!, /1. kohti: 2 vs 1/)
  assert.equal(rankLeaderboard(rows, elements, "PLUS", config("BEST_WORST"))[0].team.id, "B")
})

test("rule order determines the winner and disabled rules do not participate", () => {
  assert.equal(rankLeaderboard(rows, elements, "PLUS", config("BEST_WORST", "BEST_PLACES"))[0].team.id, "B")
  assert.equal(rankLeaderboard(rows, elements, "PLUS", config("BEST_PLACES", "BEST_WORST"))[0].team.id, "A")
  const settings = config("BEST_PLACES", "BEST_WORST"); settings.rules[0].enabled = false
  assert.equal(rankLeaderboard(rows, elements, "PLUS", settings)[0].team.id, "B")
})

test("preferred element supports both scoring directions and includes the element in the explanation", () => {
  const entries = [row("A", [10, 5]), row("B", [5, 10])]
  assert.equal(rankLeaderboard(entries, elements, "PLUS", config("PREFERRED_ELEMENT"))[0].team.id, "A")
  const penalty = rankLeaderboard(entries, elements, "PENALTY", config("PREFERRED_ELEMENT"))
  assert.equal(penalty[0].team.id, "B")
  assert.match(penalty[0].tieBreakReason!, /X x: 5 vs 10/)
})

test("fewer additional penalties cannot override the total and only breaks actual ties", () => {
  const entries = [row("A", [20], "A", 5), row("B", [15]), row("C", [30], "A", 10)]
  const ranked = rankLeaderboard(entries, elements, "PLUS", config("FEWER_PENALTIES"))
  assert.deepEqual(ranked.map(r => r.team.id), ["C", "B", "A"])
})

test("manual ordering comes after earlier rules and has an explicit public explanation", () => {
  const settings = config("MANUAL")
  settings.rules[0] = { kind: "MANUAL", enabled: true, teamOrder: ["B", "A"], reason: "Lisaküsimuse vastus" }
  assert.equal(rankLeaderboard(rows, elements, "PLUS", settings)[0].team.id, "B")
  assert.match(rankLeaderboard(rows, elements, "PLUS", settings)[0].tieBreakReason!, /Lisaküsimuse vastus/)
  settings.rules.unshift({ kind: "BEST_PLACES", enabled: true })
  assert.equal(rankLeaderboard(rows, elements, "PLUS", settings)[0].team.id, "A")
})

test("missing scores skip a criterion for the entire equal-total group without order-dependent comparisons", () => {
  const entries = [row("A", [10, 10, 0]), row("B", [7, 7, 6]), row("C", [], "A", 0, 20)]
  const ranked = rankLeaderboard(entries, elements, "PLUS", config("BEST_PLACES"))
  assert.deepEqual(ranked.map(r => r.rank), [1, 1, 1])
  assert.deepEqual(rankLeaderboard([...entries].reverse(), elements, "PLUS", config("BEST_PLACES")).map(r => r.team.id), ranked.map(r => r.team.id))
})

test("cancelled and non-checkpoint elements do not count by default; explicit selection works", () => {
  const entries = [row("A", [10, 5]), row("B", [5, 10])]
  const els = [{ ...elements[0], type: "OTHER" }, elements[1]]
  assert.equal(rankLeaderboard(entries, els, "PLUS", config("BEST_PLACES"))[0].team.id, "B")
  const settings = config("BEST_PLACES"); settings.elementIds = ["x"]
  assert.equal(rankLeaderboard(entries, els, "PLUS", settings)[0].team.id, "A")
  assert.deepEqual(rankLeaderboard(entries, [{ ...els[0], isCancelled: true }, els[1]], "PLUS", settings).map(r => r.rank), [1, 1])
})

test("class and overall places are calculated independently", () => {
  const entries = [row("A", [20, 0], "X"), row("B", [10, 10], "X"), row("C", [15, 5], "Y"), row("D", [8, 4], "Y")]
  const settings = config("BEST_WORST", "PREFERRED_ELEMENT"); settings.elementIds = ["x", "y"]
  const ranked = rankLeaderboard(entries, elements, "PLUS", settings)
  const a = ranked.find(r => r.team.id === "A")!, b = ranked.find(r => r.team.id === "B")!
  assert.ok(b.rank < a.rank)
  assert.equal(a.classRank, 1); assert.equal(b.classRank, 2)
  assert.match(a.classTieBreakReason!, /Eelistatud ülesanne/)
})

test("equal element points share places, empty input works, precision is consistent", () => {
  const entries = [row("A", [10, 5, 0]), row("B", [10, 5, 0])]
  assert.deepEqual(rankLeaderboard(entries, elements, "PLUS", config("BEST_PLACES", "BEST_WORST")).map(r => r.rank), [1, 1])
  assert.deepEqual(rankLeaderboard([], elements, "PLUS", config("BEST_PLACES")), [])
  assert.deepEqual(rankLeaderboard([row("A", [0.1 + 0.2]), row("B", [0.3])], elements, "PLUS", config("PREFERRED_ELEMENT")).map(r => r.rank), [1, 1])
})

test("configuration rejects invalid and repeated rules, missing preferred element and unexplained manual decisions", () => {
  assert.equal(tieBreakSchema.safeParse(config("BEST_PLACES", "BEST_PLACES")).success, false)
  assert.equal(tieBreakSchema.safeParse({ ...config("PREFERRED_ELEMENT"), rules: [{ kind: "PREFERRED_ELEMENT", enabled: true }] }).success, false)
  assert.equal(tieBreakSchema.safeParse(config("MANUAL")).success, false)
  assert.deepEqual(parseTieBreakConfig("bad json"), defaultTieBreakConfig())
  assert.deepEqual(parseTieBreakConfig("{}"), defaultTieBreakConfig())
})
