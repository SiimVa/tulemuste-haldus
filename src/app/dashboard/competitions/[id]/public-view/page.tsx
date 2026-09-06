import { notFound } from "next/navigation"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { isAnalysisAccessMode, type AnalysisAccessMode } from "@/lib/analysisAccess"
import { AnalysisAccessSettings } from "@/components/competition/AnalysisAccessSettings"

export const dynamic = "force-dynamic"

export default async function PublicViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const competition = await prisma.competition.findUnique({
    where: { id },
    select: { id: true, name: true, analysisAccessMode: true, analysisTokenHash: true },
  })
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
    </div>
  )
}
