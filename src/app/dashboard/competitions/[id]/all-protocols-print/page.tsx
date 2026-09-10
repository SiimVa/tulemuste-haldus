import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { naturalCompare } from "@/lib/utils"
import { notFound } from "next/navigation"
import {
  EmptyProtocolSheet,
  emptyProtocolStyles,
} from "@/components/protocol/EmptyProtocolSheet"
import { ProtocolPrintToolbar } from "@/components/protocol/ProtocolPrintToolbar"

export default async function AllProtocolsPrintPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await auth()
  const { id: competitionId } = await params

  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    include: {
      elements: {
        orderBy: { order: "asc" },
        include: {
          fields: { orderBy: { order: "asc" } },
          exceptions: { orderBy: { order: "asc" } },
        },
      },
    },
  })
  if (!competition) notFound()

  const teams = (
    await prisma.team.findMany({ where: { competitionId } })
  ).sort((a, b) => naturalCompare(a.code, b.code))

  return (
    <>
      <style>{emptyProtocolStyles}</style>

      <ProtocolPrintToolbar
        backHref={`/dashboard/competitions/${competitionId}`}
        buttonLabel="Prindi kõik tühjad protokollid"
        info={`${competition.elements.length} elementi · iga element eraldi lehel`}
        className="m-6 mb-0 rounded-lg"
      />

      {competition.elements.map((element, index) => (
        <EmptyProtocolSheet
          key={element.id}
          competition={competition}
          element={element}
          teams={teams}
          className={index > 0 ? "page-break" : ""}
          pageNumber={index + 1}
          pageCount={competition.elements.length}
        />
      ))}

      {competition.elements.length === 0 && (
        <p className="p-6 text-sm text-gray-500">Võistlusel pole prinditavaid elemente.</p>
      )}
    </>
  )
}
