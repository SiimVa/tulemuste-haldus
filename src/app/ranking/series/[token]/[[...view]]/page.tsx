import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { isAnalysisLinkToken } from "@/lib/analysisAccess"
import { hashAnalysisLinkToken } from "@/lib/analysisAccess.server"
import { loadSeriesView } from "@/lib/seriesRanking.server"
import { SeriesPublicView } from "@/components/series/SeriesPublicView"
export const dynamic = "force-dynamic"
export const metadata = { title: "Üleriiklik arvestus", robots: { index: false, follow: false } }
export default async function Page({ params, searchParams }: { params: Promise<{ token: string; view?: string[] }>; searchParams: Promise<{ class?: string | string[] }> }) {
  const [{ token, view: path }, query] = await Promise.all([params, searchParams])
  if (!isAnalysisLinkToken(token) || (path && (path.length !== 1 || !["overview", "screen"].includes(path[0])))) notFound()
  const series = await prisma.competitionSeries.findFirst({ where: { isPublished: true, leaderboardAccessMode: "LINK_ONLY", leaderboardTokenHash: hashAnalysisLinkToken(token) }, select: { id: true } })
  if (!series) notFound()
  const view = await loadSeriesView(series.id, "public")
  if (!view) notFound()
  return <SeriesPublicView loaded={{ view, preview: false }} current={path?.[0] === "overview" ? "overview" : path?.[0] === "screen" ? "screen" : "leaderboard"} query={query} leaderboardBasePath={`/ranking/series/${token}`} />
}
