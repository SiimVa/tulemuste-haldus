import Link from "next/link"
import { headers } from "next/headers"
import { CopyButton } from "@/components/CopyButton"
import { AutoRefresh } from "@/components/AutoRefresh"
import { notFound, redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { loadSeriesView } from "@/lib/seriesRanking.server"
import { visibleSeriesWidgets } from "@/lib/seriesDashboard"
import { SeriesDashboardView } from "@/components/series/SeriesWidgets"

export const dynamic = "force-dynamic"

export default async function SeriesOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) redirect("/login")
  if (session.user.role !== "ADMIN") redirect("/dashboard")
  const { id } = await params
  const view = await loadSeriesView(id, "internal")
  if (!view) notFound()
  const host = (await headers()).get("host") ?? "localhost:3000"
  const url = `${host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https"}://${host}/public/series/${id}/overview`
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-xl font-semibold text-ink">Ülevaade</h2><AutoRefresh intervalSeconds={60} /></div>
        <div className="flex gap-2 text-sm">
          <Link href={`/dashboard/series/${id}/public`} className="rounded-lg border bg-white px-4 py-2">Kohanda vaadet ja jagamist</Link>
          <Link href={`/public/series/${id}/screen`} className="rounded-lg border bg-white px-4 py-2">Ekraanirežiim</Link>
        </div>
      </div>
      {view.series.isPublished && view.series.leaderboardAccessMode === "PUBLIC" && <div className="flex flex-wrap items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
        <span className="text-sm text-blue-800">Avalik ülevaade</span><span className="min-w-0 flex-1 truncate text-xs">{url}</span><CopyButton text={url} /><Link href={url} className="text-sm text-blue-600">Ava</Link>
      </div>}
      <p className="text-sm text-ink-muted">
        Jooksev seis. Vidinate valik ja avalik nähtavus: <Link href={`/dashboard/series/${id}/public`} className="text-primary hover:underline">Avalik vaade</Link>.
      </p>
      <SeriesDashboardView view={view} widgets={visibleSeriesWidgets(view.config, "internal")} />
    </div>
  )
}
