import { notFound } from "next/navigation"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { parseRanges, type AthletePointsMode } from "@/lib/athletePoints"
import { AthleteVisibilitySettings } from "@/components/competition/AthleteVisibilitySettings"

export const dynamic = "force-dynamic"

export default async function AthleteViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const competition = await prisma.competition.findUnique({
    where: { id },
    select: { id: true, name: true, athletePointsMode: true, athletePointsRanges: true, athleteShowTotal: true },
  })
  if (!competition) notFound()

  const elements = await prisma.scoringElement.findMany({
    where: { competitionId: id },
    orderBy: { order: "asc" },
    select: { id: true, code: true, name: true, revealPointsToAthletes: true },
  })

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-2 mb-4 text-sm text-gray-400">
        <Link href={`/dashboard/competitions/${id}`}>← Tagasi</Link>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">{competition.name}</h1>
      <p className="text-gray-500 text-sm mb-6">Sportlaste vaate seaded — mida võistlejad oma token-vaates näevad</p>

      <AthleteVisibilitySettings
        competitionId={id}
        initialMode={(competition.athletePointsMode as AthletePointsMode) ?? "HIDDEN"}
        initialRanges={parseRanges(competition.athletePointsRanges)}
        initialShowTotal={competition.athleteShowTotal}
        initialElements={elements.map(e => ({ id: e.id, code: e.code, name: e.name, reveal: e.revealPointsToAthletes }))}
      />
    </div>
  )
}
