import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { naturalCompare } from "@/lib/utils"
import { notFound } from "next/navigation"
import Link from "next/link"
import { PrintButton } from "@/components/PrintButton"
import {
  EmptyProtocolSheet,
  emptyProtocolStyles,
} from "@/components/protocol/EmptyProtocolSheet"

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

      <div className="no-print flex items-center gap-3 m-6 mb-0 p-4 bg-gray-50 border rounded-lg">
        <Link
          href={`/dashboard/competitions/${competitionId}`}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← Tagasi
        </Link>
        <span className="text-gray-300">|</span>
        <PrintButton label="Prindi kõik tühjad protokollid" />
        <span className="text-xs text-gray-400 ml-2">
          {competition.elements.length} elementi · iga element eraldi lehel
        </span>
      </div>

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
