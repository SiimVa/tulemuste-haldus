import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { SeriesPublicHeader } from "@/components/series/SeriesPublicHeader"
import { SeriesDashboardView, SeriesFreezeNotice } from "@/components/series/SeriesWidgets"
import { visibleSeriesWidgets } from "@/lib/seriesDashboard"
import { loadPublicSeries } from "@/lib/seriesAccess.server"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const series = await prisma.competitionSeries.findUnique({ where: { id }, select: { name: true, isPublished: true } })
  return { title: series?.isPublished ? `${series.name} – Ülevaade` : "Ülevaade" }
}

// Avalik ülevaade: ainult avalikuks märgitud vidinad.
export default async function PublicSeriesOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const loaded = await loadPublicSeries(id)
  if (!loaded) notFound()
  const { view, preview } = loaded
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-8">
        <SeriesPublicHeader view={view} preview={preview} current="overview" />
        <SeriesFreezeNotice view={view} />
        <SeriesDashboardView view={view} widgets={visibleSeriesWidgets(view.config, "public")} />
      </div>
    </div>
  )
}
