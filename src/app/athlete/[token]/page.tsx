import { TeamResultsView } from "@/components/athlete/TeamResultsView"
import { prisma } from "@/lib/prisma"
import { getTeamResultData } from "@/lib/teamResults.server"
import { notFound } from "next/navigation"

export const dynamic = "force-dynamic"

export default async function AthletePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const accessToken = await prisma.accessToken.findUnique({
    where: { token },
    select: {
      id: true,
      type: true,
      teamId: true,
      competitionId: true,
      team: { select: { competitionId: true } },
    },
  })

  if (
    !accessToken ||
    accessToken.type !== "ATHLETE" ||
    !accessToken.teamId ||
    !accessToken.team ||
    accessToken.team.competitionId !== accessToken.competitionId
  ) {
    notFound()
  }

  const data = await getTeamResultData(accessToken.teamId)
  if (!data || data.competition.id !== accessToken.competitionId) notFound()

  await prisma.accessToken.update({
    where: { id: accessToken.id },
    data: { lastUsedAt: new Date() },
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between gap-2">
          <span className="font-semibold text-gray-900 truncate">
            {data.competition.name}
          </span>
          <span className="text-sm text-gray-500 shrink-0">
            {data.team.name}
          </span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        <TeamResultsView data={data} />
      </main>
    </div>
  )
}
