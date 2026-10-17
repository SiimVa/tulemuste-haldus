import { LeaderboardClassFilter } from "@/components/leaderboard/LeaderboardClassFilter"
import { LeaderboardHighlighter } from "@/components/public/LeaderboardHighlighter"
import { SeriesLeaderboard } from "./SeriesLeaderboard"
import { SeriesPublicHeader } from "./SeriesPublicHeader"
import { SeriesDashboardView, SeriesDashboardScreen, SeriesFreezeNotice } from "./SeriesWidgets"
import { leaderboardClassFilter } from "@/lib/leaderboard"
import { seriesGaps, seriesKpCodes } from "@/lib/seriesInsights"
import { visibleSeriesWidgets } from "@/lib/seriesDashboard"
import type { SeriesView } from "@/lib/seriesRanking.server"

export function SeriesPublicView({ loaded, current = "leaderboard", query = {}, leaderboardBasePath }: {
  loaded: { view: SeriesView; preview: boolean }
  current?: "leaderboard" | "overview" | "screen"
  query?: { class?: string | string[] }
  leaderboardBasePath?: string
}) {
  const { view, preview } = loaded
  if (current === "screen") return <>
    <SeriesFreezeNotice view={view} />
    <SeriesDashboardScreen view={view} widgets={visibleSeriesWidgets(view.config, "public")} />
  </>
  if (current === "overview") return <div className="min-h-screen bg-gray-50"><div className="mx-auto max-w-6xl space-y-5 px-4 py-8">
    <SeriesPublicHeader view={view} preview={preview} current="overview" leaderboardBasePath={leaderboardBasePath} />
    <SeriesFreezeNotice view={view} />
    <SeriesDashboardView view={view} widgets={visibleSeriesWidgets(view.config, "public")} />
  </div></div>
  const { ranking } = view
  const matchesClass = leaderboardClassFilter(query.class, ranking.classes)
  const rows = ranking.rows.filter((row) => matchesClass(row.team))
  const unit = ranking.scoringMode === "PENALTY" ? "karistuspunktid" : "punktid"

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <SeriesPublicHeader view={view} preview={preview} current="leaderboard" leaderboardBasePath={leaderboardBasePath} />
        <div className="mb-4 space-y-3">
          <SeriesFreezeNotice view={view} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-gray-600">
              Tulemus = {ranking.countedKpCount ?? "kõigi"} parima KP {unit} + karistused. Hallid KP-d ei lähe arvesse.
              {" "}KP punktid arvutatakse sama tähisega KP-de ühistest toorandmetest.
            </p>
            <LeaderboardHighlighter competitionId={`series-${view.series.id}`} teams={ranking.rows.map((row) => ({ id: row.team.id, code: row.team.code, name: row.team.name }))} />
          </div>
        </div>
        {ranking.mixedScoringModes ? <p className="py-6 text-center text-sm text-gray-500">Pingerida ei arvutata.</p> : (
          <>
            <LeaderboardClassFilter classes={ranking.classes} />
            <SeriesLeaderboard analysisBasePath={preview || view.series.analysisAccessMode === "PUBLIC" ? `/public/series/${view.series.id}/analysis` : undefined} rows={rows} gaps={seriesGaps(ranking)} kpCodes={seriesKpCodes(ranking)} showClasses={ranking.classes.length > 0} unit={unit} />
          </>
        )}
      </div>
    </div>
  )
}
