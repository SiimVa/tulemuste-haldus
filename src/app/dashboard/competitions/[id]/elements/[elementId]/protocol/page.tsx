import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { naturalCompare } from "@/lib/utils"
import { notFound } from "next/navigation"
import {
  EmptyProtocolSheet,
  emptyProtocolStyles,
} from "@/components/protocol/EmptyProtocolSheet"
import { ProtocolPrintToolbar } from "@/components/protocol/ProtocolPrintToolbar"

export default async function ProtocolPage({
  params,
}: {
  params: Promise<{ id: string; elementId: string }>
}) {
  await auth()
  const { id: competitionId, elementId } = await params

  const element = await prisma.scoringElement.findFirst({
    where: { id: elementId, competitionId },
    include: {
      fields: { orderBy: { order: "asc" } },
      exceptions: { orderBy: { order: "asc" } },
      competition: {
        select: {
          name: true,
          date: true,
          endDate: true,
          location: true,
          scoringMode: true,
        },
      },
    },
  })

  if (!element) notFound()

  const teams = (
    await prisma.team.findMany({ where: { competitionId } })
  ).sort((a, b) => naturalCompare(a.code, b.code))

  return (
    <>
      <style>{emptyProtocolStyles}</style>

      <ProtocolPrintToolbar
        backHref={`/dashboard/competitions/${competitionId}/elements/${elementId}`}
        buttonLabel="Prindi protokoll"
        className="m-6 mb-0 rounded-lg"
      />

      <EmptyProtocolSheet
        competition={element.competition}
        element={element}
        teams={teams}
      />

      <p className="text-xs text-gray-400 mx-6 mb-6 no-print">
        Vajuta &quot;Prindi protokoll&quot; et avada prindivaade
      </p>
    </>
  )
}
