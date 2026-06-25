import { notFound } from "next/navigation"
import Link from "next/link"
import { getCompetitionOverview } from "@/lib/competitionOverview"
import { CompetitionDashboard } from "@/components/CompetitionDashboard"
import { AutoRefresh } from "@/components/AutoRefresh"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await getCompetitionOverview(id)
  return { title: data ? `${data.competition.name} – Ülevaade` : "Ülevaade" }
}

export default async function PublicDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await getCompetitionOverview(id)
  if (!data) notFound()

  const updatedAt = new Date().toLocaleString("et-EE", { timeZone: "Europe/Tallinn", dateStyle: "medium", timeStyle: "short" })

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{data.competition.name}</h1>
            <p className="text-gray-500 text-sm mt-1">Võistluse ülevaade</p>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link href={`/public/${id}/leaderboard`} className="text-blue-600 hover:underline">Pingerida →</Link>
            <Link href={`/public/${id}/analysis`} className="text-blue-600 hover:underline">Analüüs →</Link>
          </div>
        </div>

        <CompetitionDashboard data={data} />

        <p className="text-xs text-gray-400 mt-6 flex items-center gap-2 justify-center">
          <span>Uuendatud: {updatedAt}</span>
          <span>·</span>
          <AutoRefresh intervalSeconds={30} />
        </p>
      </div>
    </div>
  )
}
