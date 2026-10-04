import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { SeriesDashboardScreen, SeriesFreezeNotice } from "@/components/series/SeriesWidgets"
import { visibleSeriesWidgets } from "@/lib/seriesDashboard"
import { loadPublicSeries } from "@/lib/seriesAccess.server"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const series = await prisma.competitionSeries.findUnique({ where: { id }, select: { name: true, isPublished: true } })
  return { title: series?.isPublished ? `${series.name} – Ekraan` : "Ekraan" }
}

// Ekraanirežiim: avalikuks märgitud vidinad ükshaaval.
export default async function PublicSeriesScreenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const loaded = await loadPublicSeries(id)
  if (!loaded) notFound()
  const { view } = loaded
  return (
    <>
      {(view.publicFreeze || view.frozenCompetitionNames.length > 0) && <div className="px-4 pt-4 sm:px-6"><SeriesFreezeNotice view={view} /></div>}
      <SeriesDashboardScreen view={view} widgets={visibleSeriesWidgets(view.config, "public")} />
    </>
  )
}
