import { notFound } from "next/navigation"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { loadDashboard } from "@/lib/dashboard/data.server"
import { DashboardView, FreezeNotice } from "@/components/dashboard/DashboardView"
import { AutoRefresh } from "@/components/AutoRefresh"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const competition = await prisma.competition.findUnique({ where: { id }, select: { name: true } })
  return { title: competition ? `${competition.name} – Ülevaade` : "Ülevaade" }
}

export default async function PublicDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [data, competition] = await Promise.all([
    loadDashboard(id, "public"),
    prisma.competition.findUnique({ where: { id }, select: { analysisAccessMode: true } }),
  ])
  if (!data || !competition) notFound()

  const updatedAt = data.generatedAt.toLocaleString("et-EE", { timeZone: "Europe/Tallinn", dateStyle: "medium", timeStyle: "short" })

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-5xl space-y-5 px-4 py-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">{data.competition.name}</h1>
            <p className="mt-1 text-sm text-gray-500">Võistluse ülevaade</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Link href={`/public/${id}/leaderboard`} className="text-blue-600 hover:underline">Pingerida →</Link>
            {competition.analysisAccessMode === "PUBLIC" && !data.freeze && (
              <Link href={`/public/${id}/analysis`} className="text-blue-600 hover:underline">Analüüs →</Link>
            )}
            <Link href={`/public/${id}/screen`} className="text-blue-600 hover:underline">Ekraanirežiim →</Link>
          </div>
        </div>

        <FreezeNotice data={data} />
        <DashboardView data={data} />

        <p className="flex items-center justify-center gap-2 text-xs text-gray-400">
          <span>Uuendatud: {updatedAt}</span>
          <span>·</span>
          <AutoRefresh intervalSeconds={30} />
        </p>
      </div>
    </div>
  )
}
