import assert from "node:assert/strict"
import test from "node:test"
import { defaultDashboardConfig, visibleWidgetIds, type MapColorMode } from "../src/lib/dashboard/config"
import { dashboardDataRequirements, dashboardResultSelect } from "../src/lib/dashboard/requirements"
import { publicDashboardSnapshot, dashboardDataFromSnapshot } from "../src/lib/dashboard/publicSnapshot"
import { computeTeamProgress } from "../src/lib/dashboard/routes"
import { elementProgressRows, elementTableRows, summaryStats } from "../src/lib/dashboard/progress"
import type { DashboardData } from "../src/lib/dashboard/viewTypes"
import type { DashElement, DashResult, DashTeam } from "../src/lib/dashboard/types"

const now = new Date("2026-10-09T09:00:00Z")
const config = defaultDashboardConfig()
const teams: DashTeam[] = [
  { id: "a", code: "A", name: "Alpha", class: "KT", isHorsDeCompetition: false, hcFromElementOrder: null, dnfFromElementOrder: null, dnfReason: null, dqFromElementOrder: null, dnsFlag: false },
  { id: "b", code: "B", name: "Beta", class: "KT", isHorsDeCompetition: false, hcFromElementOrder: null, dnfFromElementOrder: 1, dnfReason: "Vigastus", dqFromElementOrder: null, dnsFlag: false },
]
const elements: DashElement[] = [0, 1].map((order) => ({
  id: `e${order}`, code: `KP${order + 1}`, name: `Punkt ${order + 1}`, type: "CHECKPOINT", order, isCancelled: false, maxValue: 30,
  inputFields: [{ name: "aeg", label: "Aeg", type: "TIME", meta: null, rankingPriority: 1 }],
  exceptions: [{ label: "Puudus", kind: "NOT_PASSED" }],
}))
const results: DashResult[] = [
  { elementId: "e0", teamId: "a", values: { aeg: "12:00" }, exceptionLabel: null, enteredAt: new Date("2026-10-09T08:00:00Z"), updatedAt: now, enteredByUserId: "private-user", enteredByTokenId: null },
  { elementId: "e1", teamId: "a", values: { aeg: "10:00" }, exceptionLabel: "Puudus", enteredAt: new Date("2026-10-09T08:30:00Z"), updatedAt: now, enteredByUserId: "private-user", enteredByTokenId: null },
  { elementId: "e0", teamId: "b", values: { aeg: "15:00" }, exceptionLabel: null, enteredAt: new Date("2026-10-09T08:20:00Z"), updatedAt: now, enteredByUserId: null, enteredByTokenId: "private-token" },
]

test("public summary keeps route and exception semantics using only the columns it reads", () => {
  const needs = dashboardDataRequirements(visibleWidgetIds(config, "public", "ACTIVE"), "public")
  const select = dashboardResultSelect(needs)
  assert.equal(select.values, false)
  assert.equal(select.updatedAt, false)
  assert.equal(select.enteredByUserId, false)
  assert.equal(select.enteredByTokenId, false)
  assert.equal(needs.fields, false)
  assert.equal(needs.scores, false)
  assert.equal(needs.penalties, false)
  const reduced = results.map(({ elementId, teamId, enteredAt, exceptionLabel }) => ({ elementId, teamId, enteredAt, exceptionLabel }))
  const progress = elementProgressRows(elements, teams, reduced, [])
  const fullTeamProgress = computeTeamProgress({ teams, elements, results, config, safetyMinutes: 60, status: "ACTIVE", now })
  const minimalTeamProgress = computeTeamProgress({ teams, elements, results: reduced, config, safetyMinutes: 60, status: "ACTIVE", now })
  assert.deepEqual(minimalTeamProgress, fullTeamProgress)
  assert.deepEqual(summaryStats(teams, elements, progress, minimalTeamProgress), summaryStats(teams, elements, elementProgressRows(elements, teams, results, []), fullTeamProgress))
  assert.equal(minimalTeamProgress[0].status, "ON_ROUTE", "a not-passed exception must not finish the team")
  assert.equal(minimalTeamProgress[1].status, "DNF")
  assert.equal(progress[1].total, 1, "withdrawn teams are excluded after their withdrawal point")
})

test("standings-only widgets skip raw results, while input completeness still reads values and fields", () => {
  const standings = dashboardDataRequirements(["topTeams", "closeContests", "classComparison"], "public")
  assert.equal(standings.results, false)
  assert.equal(standings.scores, true)
  assert.equal(standings.penalties, true)
  assert.equal(standings.teamProgress, false)
  const table = dashboardDataRequirements(["elementTable"], "public")
  assert.equal(table.resultValues, true)
  assert.equal(table.fields, true)
  assert.equal(table.resultExceptions, true)
  assert.equal(table.resultEnteredAt, false)
  const rows = elementTableRows(elements, teams, results)
  assert.equal(rows[0].dataPct, 100)
  assert.equal(rows[1].notPassed, 1)
  assert.equal(rows[1].visited, 0)
})

test("map keeps tooltip difficulty and freshness in every colour mode without public team tracking", () => {
  for (const mode of ["RESULT", "FRESHNESS", "VISITS"] satisfies MapColorMode[]) {
    const publicConfig = { ...config, mapColorMode: mode, mapPublicWhileActive: true, widgets: config.widgets.map((widget) => ({ ...widget, public: widget.id === "map" })) }
    const needs = dashboardDataRequirements(visibleWidgetIds(publicConfig, "public", "ACTIVE"), "public")
    assert.equal(needs.scores, true, `${mode} map tooltips need score difficulty`)
    assert.equal(needs.freshness, true, `${mode} map tooltips need last activity`)
    assert.equal(needs.resultUpdatedAt, true)
    assert.equal(needs.resultExceptions, true, "not-passed entries must not count as visits")
    assert.equal(needs.teamProgress, false, "public maps must not track individual teams")
    assert.equal(needs.resultValues, false)
  }
  assert.equal(dashboardDataRequirements(["map"], "internal").teamProgress, true)
})

function publicData(): DashboardData {
  return {
    competition: { id: "c", name: "Võistlus", status: "ACTIVE", location: null, scoringMode: "PENALTY", analysisAccessMode: "PUBLIC" },
    audience: "public", generatedAt: now, freeze: null,
    config: { ...config, routes: { KT: { mode: "CUSTOM", elementIds: ["private-route"] } }, finishElementId: "private-finish", thresholds: { ...config.thresholds, safetyMinutes: 999 } },
    widgets: ["summary", "entryRate", "map", "judges"], classes: ["KT"],
    summary: summaryStats(teams, elements, elementProgressRows(elements, teams, results, []), computeTeamProgress({ teams, elements, results, config, safetyMinutes: 60, status: "ACTIVE", now })),
    entryRate: { bucketMinutes: 5, buckets: [{ start: now, count: 3 }], total: 3, lastHour: 3, remaining: 1, etaMinutes: 20 },
    judges: { judges: [{ key: "private-user", name: "Kohtunik", kind: "USER", elements: [], entries: 3, lastEntryAt: now, minutesAgo: 0, lastOpenedAt: null }], silentElements: [] },
    teamTracker: [{ team: { id: "a", code: "A", name: "Alpha", class: "KT" }, status: "ON_ROUTE", lastSeen: { id: "private-route", code: "P", name: "P", at: now }, minutesSinceSeen: 0, nextElement: null, visitedCount: 1, routeLength: 2, alert: "OVERDUE", missing: [] }],
    map: { mode: "IMAGE", imageUrl: "/map", aspect: 1, scaleBar: null, colorMode: "RESULT", points: [{ id: "e0", code: "KP1", name: "Punkt", mapX: 0.5, mapY: 0.5, visits: 2, score: 0.8, freshness: "OK", minutesAgo: 0, teamsHere: 2 }], markers: [], unplacedCount: 0, maxVisits: 2 },
  }
}

test("public JSON uses a whitelist even when private widget data or settings are accidentally present", () => {
  const data = publicData()
  const snapshot = publicDashboardSnapshot(data)
  assert.deepEqual(snapshot.widgets, ["summary", "entryRate", "map"])
  assert.equal("judges" in snapshot, false)
  assert.equal("teamTracker" in snapshot, false)
  assert.equal("analysisAccessMode" in snapshot.competition, false)
  assert.deepEqual(snapshot.config.routes, {})
  assert.equal(snapshot.config.finishElementId, null)
  assert.equal(snapshot.config.thresholds.safetyMinutes, defaultDashboardConfig().thresholds.safetyMinutes)
  assert.equal(snapshot.config.widgets.every((widget) => !widget.internal && widget.public), true)
  assert.equal(snapshot.summary?.alertCount, 0)
  assert.equal(snapshot.map?.points[0].teamsHere, 0)
  assert.equal(snapshot.map?.points[0].score, 0.8, "public map tooltip difficulty is retained")
  assert.equal(JSON.stringify(snapshot).includes("private-"), false)
  assert.equal(data.map?.points[0].teamsHere, 2, "serialization must not mutate the source snapshot")
})

test("known public date fields survive JSON polling and freeze suppresses the analysis link", () => {
  const data = publicData()
  data.freeze = { freezeAt: new Date("2026-10-09T08:45:00Z"), frozen: true }
  const snapshot = publicDashboardSnapshot(data)
  assert.equal(snapshot.analysisAvailable, false)
  assert.equal(snapshot.freeze?.freezeAt, "2026-10-09T08:45:00.000Z")
  const revived = dashboardDataFromSnapshot(JSON.parse(JSON.stringify(snapshot)))
  assert.equal(revived.generatedAt.getTime(), now.getTime())
  assert.equal(revived.freeze?.freezeAt.getTime(), data.freeze.freezeAt.getTime())
  assert.equal(revived.entryRate?.buckets[0].start.getTime(), now.getTime())
  assert.equal(revived.competition.name, data.competition.name)
  assert.throws(() => publicDashboardSnapshot({ ...data, audience: "internal" }), /Only public/)
})
