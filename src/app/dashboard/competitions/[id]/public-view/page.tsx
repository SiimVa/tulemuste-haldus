import { notFound } from "next/navigation"
import { requireCompetitionManager } from "@/lib/competitionPageAccess.server"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { isAnalysisAccessMode, type AnalysisAccessMode } from "@/lib/analysisAccess"
import { AnalysisAccessSettings } from "@/components/competition/AnalysisAccessSettings"
import { LeaderboardFreezeSettings } from "@/components/competition/LeaderboardFreezeSettings"
import { getFreezeState } from "@/lib/leaderboardFreeze.server"

export const dynamic = "force-dynamic"

export default async function PublicViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requireCompetitionManager(id)

  const [competition, freeze] = await Promise.all([
    prisma.competition.findUnique({
      where: { id },
      select: { id: true, name: true, analysisAccessMode: true, analysisTokenHash: true },
    }),
    getFreezeState(id),
  ])
  if (!competition) notFound()

  const mode: AnalysisAccessMode = isAnalysisAccessMode(competition.analysisAccessMode)
    ? competition.analysisAccessMode
    : "PUBLIC"

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-2 mb-4 text-sm text-gray-400">
        <Link href={`/dashboard/competitions/${id}`}>← Tagasi</Link>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">{competition.name}</h1>
      <p className="text-gray-500 text-sm mb-6">
        Avaliku vaate seaded — mida pingerea jagamisel näha saab
      </p>

      <AnalysisAccessSettings
        competitionId={id}
        initialMode={mode}
        initialHasLink={Boolean(competition.analysisTokenHash)}
      />

      <LeaderboardFreezeSettings
        competitionId={id}
        initial={freeze ? { freezeAt: freeze.freezeAt.toISOString(), frozen: freeze.frozen } : { freezeAt: null, frozen: false }}
      />
    </div>
  )
}
