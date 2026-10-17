import { notFound, redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { isAnalysisAccessMode } from "@/lib/analysisAccess"
import { parseSeriesDashboardConfig } from "@/lib/seriesDashboard"
import { AnalysisAccessSettings } from "@/components/competition/AnalysisAccessSettings"
import { LeaderboardFreezeSettings } from "@/components/competition/LeaderboardFreezeSettings"
import { SeriesDashboardSettings } from "@/components/series/SeriesDashboardSettings"
import { SeriesPublishSettings } from "@/components/series/SeriesPublishSettings"

export const dynamic = "force-dynamic"

// Avaliku vaate seaded: avaldamine, külmutamine, analüüsi ligipääs ja vidinad.
export default async function SeriesPublicSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) redirect("/login")
  if (session.user.role !== "ADMIN") redirect("/dashboard")
  const { id } = await params
  const series = await prisma.competitionSeries.findUnique({
    where: { id },
    select: { id: true, isPublished: true, leaderboardAccessMode: true, leaderboardTokenHash: true, analysisAccessMode: true, analysisTokenHash: true, dashboardConfig: true, freezeAt: true },
  })
  if (!series) notFound()
  const mode = isAnalysisAccessMode(series.analysisAccessMode) ? series.analysisAccessMode : "PUBLIC"
  return (
    <div className="max-w-3xl space-y-6">
      <SeriesPublishSettings seriesId={series.id} initialPublished={series.isPublished} analysisPublic={mode === "PUBLIC"} leaderboardPublic={series.leaderboardAccessMode === "PUBLIC"} />
      <LeaderboardFreezeSettings
        competitionId={series.id}
        url={`/api/series/${series.id}/freeze`}
        initial={{ freezeAt: series.freezeAt?.toISOString() ?? null, frozen: series.freezeAt !== null && series.freezeAt <= new Date() }}
        description="Külmutamise hetkest näitavad üleriikliku arvestuse avalik pingerida, ülevaade ja ekraan seda seisu ning analüüs on suletud. Administraator näeb jooksvat seisu edasi. Osavõistluste külmutused kehtivad sõltumata sellest. Autasustamisel avalikusta tulemused."
      />
      <AnalysisAccessSettings
        competitionId={series.id}
        initialMode={isAnalysisAccessMode(series.leaderboardAccessMode) ? series.leaderboardAccessMode : "PUBLIC"}
        initialHasLink={Boolean(series.leaderboardTokenHash)}
        resource="leaderboard"
        accessUrl={`/api/series/${series.id}/leaderboard-access`}
        rotateUrl={`/api/series/${series.id}/leaderboard-link/rotate`}
        linkPath="/ranking/series/"
        title="Pingerea ja ülevaate ligipääs"
        linkLabel="Pingerida"
        managersText="Administraator näeb pingerida töölaual edasi."
      />
      <AnalysisAccessSettings
        competitionId={series.id}
        initialMode={mode}
        initialHasLink={Boolean(series.analysisTokenHash)}
        accessUrl={`/api/series/${series.id}/analysis-access`}
        rotateUrl={`/api/series/${series.id}/analysis-link/rotate`}
        linkPath="/analysis/series/"
        title="Analüüsi ligipääs"
        linkLabel="Analüüs"
        managersText="Administraator näeb analüüsi arvestuse lehel edasi."
      />
      <SeriesDashboardSettings seriesId={series.id} initialConfig={parseSeriesDashboardConfig(series.dashboardConfig)} />
    </div>
  )
}
