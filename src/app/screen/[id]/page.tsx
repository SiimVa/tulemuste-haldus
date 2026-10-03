import { notFound } from "next/navigation"
import { requireCompetitionManager } from "@/lib/competitionPageAccess.server"
import { loadDashboard } from "@/lib/dashboard/data.server"
import { DashboardScreen } from "@/components/dashboard/DashboardView"

export const dynamic = "force-dynamic"

export async function generateMetadata() {
  return { title: "Statistika ekraan" }
}

// Peakorteri ekraan: korraldaja töölaua vidinad ilma menüüdeta.
export default async function InternalScreenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requireCompetitionManager(id)
  const data = await loadDashboard(id, "internal")
  if (!data) notFound()
  return <DashboardScreen data={data} title={data.competition.name} />
}
