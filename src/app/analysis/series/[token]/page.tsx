import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { isAnalysisLinkToken } from "@/lib/analysisAccess"
import { hashAnalysisLinkToken } from "@/lib/analysisAccess.server"
import { loadSeriesView } from "@/lib/seriesRanking.server"
import { SeriesAnalysis } from "@/components/series/SeriesAnalysis"
import { SeriesPublicHeader } from "@/components/series/SeriesPublicHeader"
import { SeriesFreezeNotice } from "@/components/series/SeriesWidgets"

export const dynamic = "force-dynamic"

async function seriesForToken(token: string) {
  if (!isAnalysisLinkToken(token)) return null
  return prisma.competitionSeries.findFirst({
    where: { analysisTokenHash: hashAnalysisLinkToken(token), analysisAccessMode: "LINK_ONLY", isPublished: true },
    select: { id: true, name: true },
  })
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const series = await seriesForToken(token)
  return { title: series ? `${series.name} – Analüüs` : "Analüüs" }
}

// Lingiga analüüs: avaldatud arvestus režiimis „Ainult lingiga”.
export default async function LinkOnlySeriesAnalysisPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ team?: string; vaade?: string }> }) {
  const [{ token }, query] = await Promise.all([params, searchParams])
  const series = await seriesForToken(token)
  if (!series) notFound()
  const view = await loadSeriesView(series.id, "public")
  if (!view) notFound()
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-8">
        <SeriesPublicHeader view={view} preview={false} current="analysis" />
        <SeriesFreezeNotice view={view} />
        {view.publicFreeze
          ? <p role="status" className="rounded-xl border bg-white px-4 py-3 text-sm text-gray-600">Analüüs avaneb pärast tulemuste avalikustamist.</p>
          : <SeriesAnalysis view={view} basePath={`/analysis/series/${token}`} mode={query.vaade === "kp" ? "kp" : "team"} teamId={query.team ?? null} />}
      </div>
    </div>
  )
}
