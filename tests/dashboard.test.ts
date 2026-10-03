import assert from "node:assert/strict"
import test from "node:test"
import {
  DASHBOARD_WIDGET_IDS,
  applyDashboardPreset,
  dashboardConfigInputSchema,
  defaultDashboardConfig,
  normalizeDashboardConfig,
  parseDashboardConfig,
  pruneDashboardElementIds,
  remapDashboardElementIds,
  visibleWidgetIds,
} from "../src/lib/dashboard/config"
import { exceptionKind, inferExceptionKind, resultExceptionKind } from "../src/lib/exceptionKinds"
import { computeTeamProgress, resolveRoute, sortTeamProgress } from "../src/lib/dashboard/routes"
import { elementProgressRows, elementTableRows, entryRate, freshnessRows, inputCells, judgeActivity, summaryStats, withdrawals } from "../src/lib/dashboard/progress"
import { buildStandings, closeContests, elementWinners, interimStandings, topTeams } from "../src/lib/dashboard/standings"
import { classComparison, clockToSeconds, difficultyRows, discriminationRows, penaltySummary, spearman, timeSpentRows, timeToSeconds } from "../src/lib/dashboard/analysis"
import { defaultTieBreakConfig } from "../src/lib/tieBreak"
import type { DashElement, DashResult, DashTeam } from "../src/lib/dashboard/types"

const MIN = 60_000
const now = new Date("2026-05-16T12:00:00Z")
const ago = (minutes: number) => new Date(now.getTime() - minutes * MIN)

function team(id: string, extra: Partial<DashTeam> = {}): DashTeam {
  return { id, code: id.toUpperCase(), name: `Võistkond ${id}`, class: "KT", isHorsDeCompetition: false, hcFromElementOrder: null, dnfFromElementOrder: null, dnfReason: null, dqFromElementOrder: null, dnsFlag: false, ...extra }
}
function element(id: string, order: number, extra: Partial<DashElement> = {}): DashElement {
  return {
    id, code: `KP${order + 1}`, name: `Punkt ${order + 1}`, type: "CHECKPOINT", order, isCancelled: false, maxValue: 30,
    inputFields: [{ name: "aeg", label: "Aeg", type: "TIME", meta: null, rankingPriority: 1 }],
    exceptions: [{ label: "Ei läbinud", kind: null }, { label: "Läbis aga ei sooritanud", kind: "PASSED_NOT_DONE" }],
    ...extra,
  }
}
function result(elementId: string, teamId: string, minutesAgo: number, extra: Partial<DashResult> = {}): DashResult {
  const at = ago(minutesAgo)
  return { elementId, teamId, values: { aeg: "10:00" }, exceptionLabel: null, enteredAt: at, updatedAt: at, enteredByUserId: null, enteredByTokenId: null, ...extra }
}

test("dashboard config keeps known widgets, forces internal-only widgets private and clamps thresholds", () => {
  const config = normalizeDashboardConfig({
    widgets: [{ id: "teamTracker", internal: true, public: true }, { id: "teamTracker", internal: false, public: false }, { id: "unknown", internal: true, public: true }, { id: "map", internal: false, public: true }],
    thresholds: { freshnessWarnMinutes: 50, freshnessAlertMinutes: 10, safetyMinutes: 1, topCount: 99, closeGap: 1.234, screenRotateSeconds: "x" },
    routes: { NK: { mode: "REVERSE", elementIds: ["a"] }, KT: { mode: "CUSTOM", elementIds: [] }, Bad: { mode: "SIDEWAYS" } },
    mapColorMode: "NOPE",
  })
  assert.deepEqual(config.widgets.slice(0, 2), [{ id: "teamTracker", internal: true, public: false }, { id: "map", internal: false, public: true }])
  assert.equal(config.widgets.length, DASHBOARD_WIDGET_IDS.length)
  assert.deepEqual(config.thresholds, { freshnessWarnMinutes: 50, freshnessAlertMinutes: 50, safetyMinutes: 5, topCount: 20, closeGap: 1.23, screenRotateSeconds: 20 })
  assert.deepEqual(config.routes, { NK: { mode: "REVERSE", elementIds: [] } })
  assert.equal(config.mapColorMode, "RESULT")
  assert.deepEqual(parseDashboardConfig("not json"), defaultDashboardConfig())
  assert.deepEqual(visibleWidgetIds(defaultDashboardConfig(), "public"), ["summary", "elementProgress"])
})

test("dashboard input schema rejects duplicates and empty custom routes; presets and copy remapping", () => {
  const base = defaultDashboardConfig()
  assert.equal(dashboardConfigInputSchema.safeParse(base).success, true)
  assert.equal(dashboardConfigInputSchema.safeParse({ ...base, widgets: [base.widgets[0], base.widgets[0]] }).success, false)
  assert.equal(dashboardConfigInputSchema.safeParse({ ...base, routes: { KT: { mode: "CUSTOM", elementIds: [] } } }).success, false)
  const screen = applyDashboardPreset(base, "PUBLIC_SCREEN")
  assert.deepEqual(visibleWidgetIds(screen, "public"), ["summary", "topTeams", "closeContests", "elementWinners", "map", "entryRate", "elementProgress"])
  // Avalik ekraan muudab ainult avalikku vaadet.
  assert.equal(screen.widgets.find((widget) => widget.id === "teamTracker")?.internal, true)
  const live = applyDashboardPreset(screen, "LIVE")
  assert.equal(live.widgets.find((widget) => widget.id === "difficulty")?.internal, false)
  assert.deepEqual(visibleWidgetIds(live, "public").sort(), visibleWidgetIds(screen, "public").sort())
  assert.equal(visibleWidgetIds(screen, "public", "ACTIVE").includes("map"), false)
  assert.equal(visibleWidgetIds(screen, "public", "FINISHED").includes("map"), true)
  assert.equal(visibleWidgetIds({ ...screen, mapPublicWhileActive: true }, "public", "ACTIVE").includes("map"), true)
  assert.equal(visibleWidgetIds(screen, "internal", "ACTIVE").includes("map"), true)
  const withRoutes = { ...base, routes: { KT: { mode: "CUSTOM" as const, elementIds: ["a", "b"] }, NK: { mode: "CUSTOM" as const, elementIds: ["z"] } }, finishElementId: "b" }
  assert.deepEqual(remapDashboardElementIds(withRoutes, new Map([["a", "A"], ["b", "B"]])).routes, { KT: { mode: "CUSTOM", elementIds: ["A", "B"] } })
  assert.equal(remapDashboardElementIds(withRoutes, new Map([["a", "A"]])).finishElementId, null)
  assert.deepEqual(pruneDashboardElementIds(withRoutes, new Set(["b"])).routes, { KT: { mode: "CUSTOM", elementIds: ["b"] } })
})

test("exception kinds come from the stored kind or the label, including renamed exceptions", () => {
  assert.equal(inferExceptionKind("Ei läbinud KP-d"), "NOT_PASSED")
  assert.equal(inferExceptionKind("  LÄBIS, AGA EI SOORITANUD "), "PASSED_NOT_DONE")
  assert.equal(inferExceptionKind("Ei leidnud"), "OTHER")
  assert.equal(exceptionKind({ label: "Ei läbinud", kind: "OTHER" }), "OTHER")
  assert.equal(resultExceptionKind("Ei läbinud", [{ label: "Puudus", kind: "NOT_PASSED" }]), "NOT_PASSED")
  assert.equal(resultExceptionKind("Puudus", [{ label: "Puudus", kind: "NOT_PASSED" }]), "NOT_PASSED")
  assert.equal(resultExceptionKind(null, []), null)
})

test("team progress follows class routes, ignores 'not passed' sightings and raises safety alerts", () => {
  const elements = [element("e1", 0), element("e2", 1), element("e3", 2), element("vt", 3, { type: "COUNTER_ACTION", code: "VT", exceptions: [] })]
  const teams = [
    team("a"), team("b"), team("c", { class: "NK" }), team("d"), team("e", { dnsFlag: true }), team("f", { dnfFromElementOrder: 1 }), team("g"),
  ]
  const results = [
    result("e1", "a", 90), result("e3", "a", 80),
    result("e1", "b", 20), result("e2", "b", 10, { exceptionLabel: "Ei läbinud" }),
    result("e3", "c", 70), result("e2", "c", 65),
    result("vt", "d", 200),
    result("e1", "f", 30),
    result("e1", "g", 50), result("e2", "g", 40), result("e3", "g", 30),
  ]
  const progress = computeTeamProgress({
    teams, elements, results, config: { routes: { NK: { mode: "REVERSE", elementIds: [] } }, finishElementId: null }, safetyMinutes: 60, status: "ACTIVE", now,
  })
  const byId = new Map(progress.map((row) => [row.team.id, row]))
  // a: jättis KP2 vahele või see on sisestamata; viimati nähtud 80 min tagasi
  assert.equal(byId.get("a")!.status, "FINISHED")
  assert.deepEqual(byId.get("a")!.missing.map((item) => item.code), ["KP2"])
  assert.equal(byId.get("a")!.alert, null)
  // b: „Ei läbinud” ei ole sighting, järgmine on KP3
  assert.equal(byId.get("b")!.lastSeen?.code, "KP1")
  assert.equal(byId.get("b")!.nextElement?.code, "KP3")
  assert.equal(byId.get("b")!.status, "ON_ROUTE")
  // c: NK liigub vastupidi, KP3 → KP2 → KP1
  assert.equal(byId.get("c")!.nextElement?.code, "KP1")
  assert.equal(byId.get("c")!.alert, "OVERDUE")
  assert.equal(byId.get("c")!.minutesSinceSeen, 65)
  // d: vastutegevus on samuti nägemine
  assert.equal(byId.get("d")!.alert, "OVERDUE")
  assert.equal(byId.get("e")!.status, "DNS")
  assert.equal(byId.get("f")!.status, "DNF")
  assert.equal(byId.get("f")!.routeLength, 1)
  assert.equal(byId.get("g")!.status, "FINISHED")
  assert.deepEqual(sortTeamProgress(progress).slice(0, 2).map((row) => row.team.id), ["d", "c"])

  const notSeen = computeTeamProgress({ teams: [team("x"), team("y")], elements, results: [result("e1", "y", 61)], config: { routes: {}, finishElementId: null }, safetyMinutes: 60, status: "ACTIVE", now })
  assert.equal(notSeen[0].status, "NOT_SEEN")
  assert.equal(notSeen[0].alert, "NOT_SEEN")
  const finished = computeTeamProgress({ teams: [team("x")], elements, results: [], config: { routes: {}, finishElementId: null }, safetyMinutes: 60, status: "FINISHED", now })
  assert.equal(finished[0].alert, null)
  assert.deepEqual(finished[0].missing.map((item) => item.code), ["KP1", "KP2", "KP3"])
})

test("free routes only finish at the finish element and custom routes fall back to element order", () => {
  const elements = [element("e1", 0), element("e2", 1), element("fin", 2, { code: "F" })]
  const free = computeTeamProgress({
    teams: [team("a")], elements, results: [result("e2", "a", 5), result("e1", "a", 4, { exceptionLabel: "Ei läbinud" })],
    config: { routes: { "": { mode: "FREE", elementIds: [] } }, finishElementId: "fin" }, safetyMinutes: 60, status: "ACTIVE", now,
  })[0]
  assert.equal(free.status, "ON_ROUTE")
  assert.equal(free.nextElement, null)
  assert.deepEqual(free.missing, [])
  assert.deepEqual(resolveRoute({ mode: "CUSTOM", elementIds: ["missing"] }, elements).elements.map((item) => item.id), ["e1", "e2", "fin"])
  assert.deepEqual(resolveRoute({ mode: "CUSTOM", elementIds: ["fin", "e1"] }, elements).elements.map((item) => item.id), ["fin", "e1"])
})

test("element table counts exception kinds and data cells; summary averages visited checkpoints", () => {
  const range = element("r", 0, {
    inputFields: [
      { name: "aeg", label: "Aeg", type: "TIME_RANGE", meta: null, rankingPriority: 1 },
      { name: "hinnang", label: "Hinnang", type: "ESTIMATION", meta: JSON.stringify({ estimation: { targets: [{ id: "t1", label: "A", correct: 1 }, { id: "t2", label: "B", correct: 2 }], bands: [] } }), rankingPriority: null },
      { name: "ok", label: "Ok", type: "CHECKBOX", meta: null, rankingPriority: null },
    ],
  })
  assert.deepEqual(inputCells(range, { aeg_start: "10:00", aeg_end: "", hinnang: JSON.stringify({ t1: "5" }) }), { total: 5, filled: 3 })
  const elements = [range, element("e2", 1)]
  const teams = [team("a"), team("b"), team("c"), team("d", { dnfFromElementOrder: 1 })]
  const results = [
    result("r", "a", 5, { values: { aeg_start: "10:00", aeg_end: "10:05", hinnang: JSON.stringify({ t1: "1", t2: "2" }) } }),
    result("r", "b", 5, { exceptionLabel: "Läbis aga ei sooritanud" }),
    result("r", "c", 5, { exceptionLabel: "Ei läbinud" }),
    result("e2", "a", 4), result("e2", "d", 4),
  ]
  const [row, second] = elementTableRows(elements, teams, results)
  assert.deepEqual({ expected: row.expected, entered: row.entered, performed: row.performed, passedNotDone: row.passedNotDone, notPassed: row.notPassed, visited: row.visited, dataPct: row.dataPct }, { expected: 4, entered: 3, performed: 1, passedNotDone: 1, notPassed: 1, visited: 2, dataPct: 100 })
  assert.equal(second.expected, 3)
  assert.equal(second.entered, 1)

  const withMisc = [...elements, element("kat", 9, { type: "ABANDONMENT", code: "KAT" })]
  const progress = elementProgressRows(withMisc, teams, results, [])
  const teamProgress = computeTeamProgress({ teams, elements, results, config: { routes: {}, finishElementId: null }, safetyMinutes: 60, status: "ACTIVE", now })
  const summary = summaryStats(teams, withMisc, progress, teamProgress)
  assert.equal(summary.resultsEntered, 4)
  assert.equal(summary.resultsExpected, 7)
  // a: 2/2, b: 1/2, c: 0/2, d: 0/1 (katkestas enne KP2)
  assert.equal(summary.averageVisited, 0.75)
  assert.equal(summary.visitPct, 37.5)
  assert.equal(summary.statusCounts.FINISHED, 1)
})

test("freshness levels, entry rate buckets and forecast", () => {
  const elements = [element("e1", 0), element("e2", 1), element("e3", 2), element("e4", 3), element("e5", 4)]
  const teams = [team("a"), team("b")]
  const results = [
    result("e1", "a", 50),
    result("e2", "a", 25),
    result("e3", "a", 10, { updatedAt: ago(5) }),
    result("e5", "a", 120), result("e5", "b", 115),
  ]
  const progress = elementProgressRows(elements, teams, results, [])
  const rows = freshnessRows(elements, progress, results, { freshnessWarnMinutes: 20, freshnessAlertMinutes: 45 }, "ACTIVE", now)
  assert.deepEqual(rows.map((row) => row.level), ["ALERT", "WARN", "OK", "NONE", "DONE"])
  assert.equal(rows[2].minutesAgo, 5)
  assert.deepEqual(rows.map((row) => row.recentCount), [0, 1, 1, 0, 0])
  assert.equal(freshnessRows(elements, progress, results, { freshnessWarnMinutes: 20, freshnessAlertMinutes: 45 }, "FINISHED", now)[0].level, "OK")

  const rate = entryRate(results, 3, "ACTIVE", now)!
  assert.equal(rate.bucketMinutes, 5)
  assert.equal(rate.total, 5)
  assert.equal(rate.buckets.reduce((sum, bucket) => sum + bucket.count, 0), 5)
  assert.equal(rate.lastHour, 3)
  assert.equal(rate.etaMinutes, 60)
  assert.equal(entryRate([], 3, "ACTIVE", now), null)
})

test("judge activity groups entries by token and user and lists silent checkpoints", () => {
  const elements = [element("e1", 0), element("e2", 1), element("e3", 2)]
  const results = [
    result("e1", "a", 30, { enteredByTokenId: "t1" }), result("e1", "b", 10, { enteredByTokenId: "t1" }),
    result("e2", "a", 50, { enteredByUserId: "u1" }),
  ]
  const activity = judgeActivity(elements, results, {
    tokens: [{ id: "t1", name: "KP1 kohtunik", type: "JUDGE", elementId: "e1", lastUsedAt: ago(9) }, { id: "t2", name: "KP3 kohtunik", type: "JUDGE", elementId: "e3", lastUsedAt: null }, { id: "t3", name: "Võistkond", type: "TEAM", elementId: null, lastUsedAt: null }],
    users: [{ id: "u1", name: "Mari" }, { id: "u2", name: "Jüri" }],
    assignments: [{ userId: "u2", elementId: "e3" }],
  }, now)
  assert.deepEqual(activity.judges.map((judge) => [judge.name, judge.entries, judge.minutesAgo]), [["KP1 kohtunik", 2, 10], ["Mari", 1, 50], ["Jüri", 0, null], ["KP3 kohtunik", 0, null]])
  assert.deepEqual(activity.silentElements.map((item) => item.code), ["KP3"])
})

test("withdrawals list statuses and member abandonments", () => {
  const elements = [element("e1", 0), element("ab", 5, { type: "ABANDONMENT", code: "KAT", name: "Katkestamine" })]
  const teams = [team("a", { dnfFromElementOrder: 0, dnfReason: "Vigastus" }), team("b", { dnsFlag: true }), team("c", { dqFromElementOrder: 0 }), team("d", { isHorsDeCompetition: true }), team("e")]
  const result = withdrawals(teams, elements, [{ elementId: "ab", teamId: "e", points: 10, description: "Mari Maasikas", reason: "Väsimus", abandonElementId: "e1", abandonTime: "12:30", createdAt: ago(5) }])
  assert.deepEqual(result.counts, { inComp: 2, horsConcours: 1, dnf: 1, dns: 1, dq: 1 })
  assert.equal(result.dnf[0].from?.code, "KP1")
  assert.equal(result.members[0].element?.code, "KP1")
  assert.equal(result.members[0].description, "Mari Maasikas")
})

const tieBreak = defaultTieBreakConfig()
const rankElements = [
  { id: "e1", code: "KP1", name: "Punkt 1", type: "CHECKPOINT", order: 0, isCancelled: false },
  { id: "e2", code: "KP2", name: "Punkt 2", type: "CHECKPOINT", order: 1, isCancelled: false },
]

test("standings rank teams like the leaderboard and feed top teams, close contests and winners", () => {
  const teams = [team("a"), team("b"), team("c", { class: "NK" }), team("d", { class: "NK" }), team("x", { isHorsDeCompetition: true })]
  const scores = [
    { elementId: "e1", teamId: "a", points: 5 }, { elementId: "e2", teamId: "a", points: 5 },
    { elementId: "e1", teamId: "b", points: 4 }, { elementId: "e2", teamId: "b", points: 7 },
    { elementId: "e1", teamId: "c", points: 9 }, { elementId: "e2", teamId: "c", points: 1 },
    { elementId: "e1", teamId: "d", points: 2 }, { elementId: "e2", teamId: "d", points: 20 },
    { elementId: "e1", teamId: "x", points: 0 },
  ]
  const standings = buildStandings({ teams, scores, penalties: [{ teamId: "b", points: 1 }], elements: rankElements, scoringMode: "PENALTY", tieBreak })
  assert.deepEqual(standings.map((row) => [row.team.id, row.total, row.rank, row.classRank]), [["a", 10, 1, 1], ["c", 10, 1, 1], ["b", 12, 3, 2], ["d", 22, 4, 2]])
  const top = topTeams(standings, 2, ["KT", "NK"])
  assert.deepEqual(top.overall.map((row) => row.team.id), ["a", "c"])
  assert.deepEqual(top.classes.map((cls) => [cls.name, cls.teams.map((row) => [row.team.id, row.gapPrevious])]), [["KT", [["a", null], ["b", 2]]], ["NK", [["c", null], ["d", 12]]]])
  const contests = closeContests(standings, 2, ["KT", "NK"])
  assert.deepEqual(contests.map((item) => [item.scope, item.upper.team.id, item.lower.team.id, item.gap]), [[null, "a", "c", 0], [null, "c", "b", 2], ["KT", "a", "b", 2]])
  const winners = elementWinners(standings, rankElements, "PENALTY", ["KT", "NK"])
  assert.deepEqual(winners.map((item) => [item.element.code, item.best, item.overall.map((teamRef) => teamRef.id)]), [["KP1", 2, ["d"]], ["KP2", 1, ["c"]]])
  assert.deepEqual(winners[0].classes.map((item) => [item.name, item.teams.map((teamRef) => teamRef.id)]), [["KT", ["b"]], ["NK", ["d"]]])

  const plus = buildStandings({ teams: teams.slice(0, 2), scores, penalties: [{ teamId: "a", points: 3 }], elements: rankElements, scoringMode: "PLUS", tieBreak })
  assert.deepEqual(plus.map((row) => [row.team.id, row.total]), [["b", 11], ["a", 7]])
})

test("interim standings compare common checkpoints and the average per checkpoint", () => {
  const teams = [team("a"), team("b"), team("c")]
  const scores = [
    { elementId: "e1", teamId: "a", points: 10 }, { elementId: "e1", teamId: "b", points: 5 }, { elementId: "e1", teamId: "c", points: 8 },
    { elementId: "e2", teamId: "a", points: 1 },
  ]
  const standings = buildStandings({ teams, scores, penalties: [], elements: rankElements, scoringMode: "PENALTY", tieBreak })
  const interim = interimStandings(standings, rankElements, "PENALTY")
  assert.deepEqual(interim.commonElements.map((item) => item.code), ["KP1"])
  const byId = new Map(interim.rows.map((row) => [row.team.id, row]))
  assert.deepEqual([byId.get("a")!.commonTotal, byId.get("a")!.commonRank, byId.get("a")!.average, byId.get("a")!.averageRank], [10, 3, 5.5, 2])
  assert.deepEqual([byId.get("b")!.commonRank, byId.get("b")!.averageRank, byId.get("b")!.scoredCount], [1, 1, 1])
})

test("analysis: difficulty, discrimination, class comparison, time spent and penalties", () => {
  const elements = [element("e1", 0, { maxValue: 20 }), element("e2", 1, { maxValue: null })]
  const teams = [team("a"), team("b"), team("c", { class: "NK" }), team("d", { class: "NK" })]
  const scores = [
    { elementId: "e1", teamId: "a", points: 0 }, { elementId: "e1", teamId: "b", points: 10 }, { elementId: "e1", teamId: "c", points: 20 }, { elementId: "e1", teamId: "d", points: 10 },
    { elementId: "e2", teamId: "a", points: 5 }, { elementId: "e2", teamId: "b", points: 5 }, { elementId: "e2", teamId: "c", points: 5 }, { elementId: "e2", teamId: "d", points: 5 },
  ]
  const standings = buildStandings({ teams, scores, penalties: [], elements: rankElements, scoringMode: "PENALTY", tieBreak })
  const results = [result("e1", "a", 1), result("e1", "b", 1), result("e1", "c", 1, { exceptionLabel: "Ei läbinud" }), result("e1", "d", 1)]
  const difficulty = difficultyRows(elements, standings, results, "PENALTY", { kpMax: 30, pkMax: 15 })
  assert.deepEqual(difficulty.map((row) => [row.code, row.averageLoss, row.lossPct, row.notDonePct]), [["KP1", 10, 50, 25], ["KP2", 0, 0, null]])

  const discrimination = discriminationRows(elements, standings)
  assert.equal(discrimination[0].code, "KP1")
  assert.equal(discrimination[0].stdDev, 7.07)
  assert.equal(discrimination[1].stdDev, 0)
  assert.equal(spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1)
  assert.equal(spearman([1, 2, 3, 4], [4, 3, 2, 1]), -1)

  const comparison = classComparison(elements, standings, ["KT", "NK", "TÜHI"], "PENALTY")
  assert.deepEqual(comparison.classes, ["KT", "NK"])
  assert.deepEqual(comparison.rows[0].averages, [5, 15])
  assert.equal(comparison.rows[0].bestClass, "KT")
  assert.equal(comparison.rows[1].bestClass, null)

  assert.equal(timeToSeconds("1:02:03"), 3723)
  assert.equal(timeToSeconds("abc"), null)
  assert.equal(clockToSeconds("23:50"), 85_800)
  assert.equal(clockToSeconds("12:30:15"), 45_015)
  assert.equal(clockToSeconds("25:00"), null)
  const timed = element("t", 0, { inputFields: [{ name: "aeg", label: "Aeg KP-s", type: "TIME_RANGE", meta: null, rankingPriority: 1 }] })
  const times = timeSpentRows([timed], [
    result("t", "a", 1, { values: { aeg_start: "23:50", aeg_end: "0:10" } }),
    result("t", "b", 1, { values: { aeg_start: "23:55", aeg_end: "0:00" } }),
    result("t", "c", 1, { values: { aeg_start: "0:00", aeg_end: "0:30" } }),
    result("t", "d", 1, { exceptionLabel: "Ei läbinud", values: {} }),
  ], teams)
  assert.equal(times[0].n, 3)
  assert.equal(times[0].fastest.team.id, "b")
  assert.equal(times[0].slowest.team.id, "c")
  assert.equal(times[0].medianSeconds, 1200)
  assert.equal(times[0].peakConcurrent, 2)

  const penaltyElements = [element("vt", 0, { type: "COUNTER_ACTION", code: "VT", inputFields: [{ name: "elud", label: "Kaotatud elud", type: "NUMBER", meta: null, rankingPriority: 1 }] })]
  const summary = penaltySummary(penaltyElements, [{ elementId: "vt", teamId: "a", points: 10 }, { elementId: "vt", teamId: "b", points: 0 }], [result("vt", "a", 1, { values: { elud: "2" } }), result("vt", "b", 1, { values: { elud: "0" } })], [
    { teamId: "a", points: 5, description: "Prügi", enteredAt: now }, { teamId: "b", points: 5, description: "prügi ", enteredAt: now }, { teamId: "b", points: 2, description: "", enteredAt: now },
  ])
  assert.deepEqual(summary.elements[0].fields, [{ label: "Kaotatud elud", total: 2, teams: 1 }])
  assert.equal(summary.elements[0].teamsAffected, 1)
  assert.deepEqual(summary.manual.byDescription.map((item) => [item.description, item.count, item.points]), [["Prügi", 2, 10], ["Kirjelduseta", 1, 2]])
})

test("KP tabel loeb ebaõnnestumised eraldi ja need käisid KP-s", () => {
  const elements = [element("e1", 0)]
  const teams = [team("a"), team("b"), team("c")]
  const [row] = elementTableRows(elements, teams, [
    result("e1", "a", 3),
    result("e1", "b", 2, { exceptionLabel: "Ebaõnnestus" }),
    result("e1", "c", 1, { exceptionLabel: "Ei läbinud" }),
  ])
  assert.deepEqual([row.performed, row.failed, row.notPassed, row.visited], [1, 1, 1, 2])
})

test("ajakulu KP-s arvestab ebaõnnestunute aega, teiste erandite väärtusi mitte", () => {
  const timed = element("t", 0, { exceptions: [{ label: "Ebaõnnestus", kind: "FAILED" }, { label: "Muu", kind: "OTHER" }] })
  const [row] = timeSpentRows([timed], [
    result("t", "a", 1, { values: { aeg: "10:00" } }),
    result("t", "b", 1, { exceptionLabel: "Ebaõnnestus", values: { aeg: "20:00" } }),
    result("t", "c", 1, { exceptionLabel: "Muu", values: { aeg: "30:00" } }),
  ], [team("a"), team("b"), team("c")])
  assert.equal(row.n, 2)
  assert.equal(row.slowest.team.id, "b")
})
