import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { SeriesAnalysis } from "@/components/series/SeriesAnalysis"
import { SeriesPublicHeader } from "@/components/series/SeriesPublicHeader"
import { SeriesFreezeNotice } from "@/components/series/SeriesWidgets"
import { isAdminViewer, loadPublicSeries } from "@/lib/seriesAccess.server"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const series = await prisma.competitionSeries.findUnique({ where: { id }, select: { name: true, isPublished: true } })
  return { title: series?.isPublished ? `${series.name} – Analüüs` : "Analüüs" }
}

// Avalik analüüs: ainult režiimis „Avalik”. Administraator näeb alati.
export default async function PublicSeriesAnalysisPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ team?: string; vaade?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const loaded = await loadPublicSeries(id)
  if (!loaded) notFound()
  const { view, preview } = loaded
  const admin = preview || (await isAdminViewer())
  if (view.series.analysisAccessMode !== "PUBLIC" && !admin) notFound()
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-8">
        <SeriesPublicHeader view={view} preview={preview} current="analysis" />
        <SeriesFreezeNotice view={view} />
        {view.publicFreeze && !admin
          ? <p role="status" className="rounded-xl border bg-white px-4 py-3 text-sm text-gray-600">Analüüs avaneb pärast tulemuste avalikustamist.</p>
          : <SeriesAnalysis view={view} basePath={`/public/series/${id}/analysis`} mode={query.vaade === "kp" ? "kp" : "team"} teamId={query.team ?? null} />}
      </div>
    </div>
  )
}
