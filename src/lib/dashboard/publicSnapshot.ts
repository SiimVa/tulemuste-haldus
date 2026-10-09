import { dashboardWidget, defaultDashboardConfig, type DashboardWidgetId } from "./config"
import type { DashboardData } from "./viewTypes"

const PUBLIC_DATA_KEYS = [
  "summary", "elementProgress", "topTeams", "interimStandings", "closeContests", "elementWinners",
  "elementTable", "difficulty", "discrimination", "classComparison", "timeSpent", "map",
] as const satisfies readonly (keyof DashboardData & DashboardWidgetId)[]

type PublicDataKey = typeof PUBLIC_DATA_KEYS[number]
type PublicDashboardData = Pick<DashboardData, "audience" | "config" | "widgets" | "classes" | PublicDataKey> & {
  competition: Omit<DashboardData["competition"], "analysisAccessMode">
}

export type PublicDashboardSnapshot = PublicDashboardData & {
  generatedAt: string
  freeze: { freezeAt: string; frozen: boolean } | null
  entryRate?: (Omit<NonNullable<DashboardData["entryRate"]>, "buckets"> & { buckets: { start: string; count: number }[] }) | null
  analysisAvailable: boolean
}

// Explicitly allow only public widget outputs. Never serialize the internal
// dashboard configuration, raw results, judge identities or safety details.
export function publicDashboardSnapshot(data: DashboardData): PublicDashboardSnapshot {
  if (data.audience !== "public") throw new Error("Only public dashboard data can be published")
  const widgets = data.widgets.filter((id) => dashboardWidget(id).publicAllowed)
  const config = defaultDashboardConfig()
  config.widgets = widgets.map((id) => ({ id, internal: false, public: true }))
  config.thresholds.topCount = data.config.thresholds.topCount
  config.thresholds.closeGap = data.config.thresholds.closeGap
  config.thresholds.screenRotateSeconds = data.config.thresholds.screenRotateSeconds
  config.mapColorMode = data.config.mapColorMode

  const snapshot: PublicDashboardSnapshot = {
    competition: {
      id: data.competition.id, name: data.competition.name, status: data.competition.status,
      location: data.competition.location, scoringMode: data.competition.scoringMode,
    },
    audience: "public",
    generatedAt: data.generatedAt.toISOString(),
    freeze: data.freeze ? { freezeAt: data.freeze.freezeAt.toISOString(), frozen: data.freeze.frozen } : null,
    config,
    widgets,
    classes: data.classes,
    analysisAvailable: data.competition.analysisAccessMode === "PUBLIC" && !data.freeze,
  }
  for (const key of PUBLIC_DATA_KEYS) {
    if (widgets.includes(key) && data[key] !== undefined) Object.assign(snapshot, { [key]: data[key] })
  }
  if (snapshot.summary) snapshot.summary = { ...snapshot.summary, alertCount: 0 }
  if (snapshot.map) snapshot.map = { ...snapshot.map, points: snapshot.map.points.map((point) => ({ ...point, teamsHere: 0 })) }
  if (widgets.includes("entryRate") && data.entryRate !== undefined) {
    snapshot.entryRate = data.entryRate ? {
      ...data.entryRate,
      buckets: data.entryRate.buckets.map((bucket) => ({ start: bucket.start.toISOString(), count: bucket.count })),
    } : null
  }
  return snapshot
}

// Dates cross the JSON endpoint as ISO strings and are revived only in known
// public fields, rather than attempting to convert arbitrary text values.
export function dashboardDataFromSnapshot(snapshot: PublicDashboardSnapshot): DashboardData {
  return {
    ...snapshot,
    competition: { ...snapshot.competition, analysisAccessMode: snapshot.analysisAvailable ? "PUBLIC" : "PRIVATE" },
    generatedAt: new Date(snapshot.generatedAt),
    freeze: snapshot.freeze ? { freezeAt: new Date(snapshot.freeze.freezeAt), frozen: snapshot.freeze.frozen } : null,
    entryRate: snapshot.entryRate ? {
      ...snapshot.entryRate,
      buckets: snapshot.entryRate.buckets.map((bucket) => ({ start: new Date(bucket.start), count: bucket.count })),
    } : snapshot.entryRate,
  }
}
