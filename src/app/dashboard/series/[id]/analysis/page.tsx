import { notFound, redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { loadSeriesView } from "@/lib/seriesRanking.server"
import { SeriesAnalysis } from "@/components/series/SeriesAnalysis"

export const dynamic = "force-dynamic"

export default async function SeriesAnalysisPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ team?: string; vaade?: string }> }) {
  const session = await auth()
  if (!session?.user) redirect("/login")
  if (session.user.role !== "ADMIN") redirect("/dashboard")
  const [{ id }, query] = await Promise.all([params, searchParams])
  const view = await loadSeriesView(id, "internal")
  if (!view) notFound()
  return <SeriesAnalysis view={view} basePath={`/dashboard/series/${id}/analysis`} mode={query.vaade === "kp" ? "kp" : "team"} teamId={query.team ?? null} />
}
