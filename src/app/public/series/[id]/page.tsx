import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { loadPublicSeries } from "@/lib/seriesAccess.server"
import { SeriesPublicView } from "@/components/series/SeriesPublicView"
export const dynamic = "force-dynamic"
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const series = await prisma.competitionSeries.findFirst({ where: { id, isPublished: true, leaderboardAccessMode: "PUBLIC" }, select: { name: true } })
  return { title: series ? `${series.name} – Pingerida` : "Üleriiklik arvestus" }
}
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ class?: string | string[] }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const loaded = await loadPublicSeries(id)
  if (!loaded) notFound()
  return <SeriesPublicView loaded={loaded} current="leaderboard" query={query} />
}
