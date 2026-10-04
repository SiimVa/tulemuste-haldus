import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { LeaderboardClassFilter } from "@/components/leaderboard/LeaderboardClassFilter"
import { LeaderboardHighlighter } from "@/components/public/LeaderboardHighlighter"
import { SeriesLeaderboard } from "@/components/series/SeriesLeaderboard"
import { SeriesPublicHeader } from "@/components/series/SeriesPublicHeader"
import { SeriesFreezeNotice } from "@/components/series/SeriesWidgets"
import { leaderboardClassFilter } from "@/lib/leaderboard"
import { loadPublicSeries } from "@/lib/seriesAccess.server"
import { seriesGaps, seriesKpCodes } from "@/lib/seriesInsights"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const series = await prisma.competitionSeries.findUnique({ where: { id }, select: { name: true, isPublished: true } })
  return { title: series?.isPublished ? `${series.name} – Üleriiklik pingerida` : "Üleriiklik pingerida" }
}

export default async function PublicSeriesLeaderboardPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ class?: string | string[] }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const loaded = await loadPublicSeries(id)
  if (!loaded) notFound()
  const { view, preview } = loaded
  const { ranking } = view
  const matchesClass = leaderboardClassFilter(query.class, ranking.classes)
  const rows = ranking.rows.filter((row) => matchesClass(row.team))
  const unit = ranking.scoringMode === "PENALTY" ? "karistuspunktid" : "punktid"

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <SeriesPublicHeader view={view} preview={preview} current="leaderboard" />
        <div className="mb-4 space-y-3">
          <SeriesFreezeNotice view={view} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-gray-600">
              Tulemus = {ranking.countedKpCount ?? "kõigi"} parima KP {unit} + karistused. Hallid KP-d ei lähe arvesse.
            </p>
            <LeaderboardHighlighter competitionId={`series-${view.series.id}`} teams={ranking.rows.map((row) => ({ id: row.team.id, code: row.team.code, name: row.team.name }))} />
          </div>
        </div>
        {ranking.mixedScoringModes ? <p className="py-6 text-center text-sm text-gray-500">Pingerida ei arvutata.</p> : (
          <>
            <LeaderboardClassFilter classes={ranking.classes} />
            <SeriesLeaderboard rows={rows} gaps={seriesGaps(ranking)} kpCodes={seriesKpCodes(ranking)} showClasses={ranking.classes.length > 0} unit={unit} />
          </>
        )}
      </div>
    </div>
  )
}
