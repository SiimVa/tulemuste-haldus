import Link from "next/link"
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
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">
        Jooksev seis. Vidinate valik ja avalik nähtavus: <Link href={`/dashboard/series/${id}/public`} className="text-primary hover:underline">Avalik vaade</Link>.
      </p>
      <SeriesDashboardView view={view} widgets={visibleSeriesWidgets(view.config, "internal")} />
    </div>
  )
}
