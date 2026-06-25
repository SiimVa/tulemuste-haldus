import { notFound } from "next/navigation"
import Link from "next/link"
import { headers } from "next/headers"
import { getCompetitionOverview } from "@/lib/competitionOverview"
import { CompetitionDashboard } from "@/components/CompetitionDashboard"
import { CopyButton } from "@/components/CopyButton"

export const dynamic = "force-dynamic"

export default async function OverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await getCompetitionOverview(id)
  if (!data) notFound()

  const headersList = await headers()
  const host = headersList.get("host") ?? "localhost:3000"
  const proto = host.startsWith("localhost") ? "http" : "https"
  const publicUrl = `${proto}://${host}/public/${id}/dashboard`

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 text-sm text-gray-400">
        <Link href={`/dashboard/competitions/${id}`}>← Tagasi</Link>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-5 flex items-center gap-2">
        <span className="text-xs text-blue-800 font-medium w-20 shrink-0">Ülevaade</span>
        <span className="flex-1 text-xs font-mono text-gray-600 bg-white border rounded px-2 py-1 truncate">{publicUrl}</span>
        <CopyButton text={publicUrl} />
        <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline shrink-0">Ava</a>
      </div>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">{data.competition.name} — Ülevaade</h1>

      <CompetitionDashboard data={data} />
    </div>
  )
}
