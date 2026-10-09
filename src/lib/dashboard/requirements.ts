import type { DashboardWidgetId } from "./config"

const STANDINGS_WIDGETS: DashboardWidgetId[] = [
  "topTeams", "interimStandings", "closeContests", "elementWinners",
  "difficulty", "discrimination", "classComparison",
]

// A widget may need result presence, activity times or entered values. Keep
// these separate so the public summary never reads thousands of JSON values
// or computed scores it does not display.
export function dashboardDataRequirements(widgets: readonly DashboardWidgetId[], audience: "internal" | "public") {
  const show = (id: DashboardWidgetId) => widgets.includes(id)
  const map = show("map")
  // Map tooltips show difficulty and freshness in every colour mode.
  const freshness = show("freshness") || map
  const standings = STANDINGS_WIDGETS.some(show) || map
  const teamProgress = show("summary") || show("teamTracker") || show("missingResults") || (map && audience === "internal")
  const elementProgress = show("summary") || show("entryRate") || show("elementProgress") || freshness
  const resultValues = show("elementTable") || show("timeSpent") || show("penalties")
  const resultExceptions = teamProgress || show("elementTable") || show("difficulty") || show("timeSpent") || map
  const resultEnteredAt = teamProgress || freshness || show("entryRate") || show("judges")
  const resultUpdatedAt = freshness || show("judges")
  const resultAuthors = show("judges")
  return {
    map,
    freshness,
    standings,
    teamProgress,
    elementProgress,
    results: elementProgress || teamProgress || resultValues || show("difficulty") || show("judges") || map,
    resultValues,
    resultExceptions,
    resultEnteredAt,
    resultUpdatedAt,
    resultAuthors,
    fields: resultValues,
    exceptions: resultExceptions,
    miscEntries: elementProgress || show("withdrawals"),
    miscDetails: show("withdrawals"),
    scores: standings || show("penalties"),
    penalties: standings || show("penalties"),
  }
}

export type DashboardDataRequirements = ReturnType<typeof dashboardDataRequirements>

export function dashboardResultSelect(needs: DashboardDataRequirements) {
  return {
    elementId: true,
    teamId: true,
    values: needs.resultValues,
    exceptionLabel: needs.resultExceptions,
    enteredAt: needs.resultEnteredAt,
    updatedAt: needs.resultUpdatedAt,
    enteredByUserId: needs.resultAuthors,
    enteredByTokenId: needs.resultAuthors,
  } as const
}
