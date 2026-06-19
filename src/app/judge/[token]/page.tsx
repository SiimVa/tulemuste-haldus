import { prisma } from "@/lib/prisma"
import { naturalCompare } from "@/lib/utils"
import { notFound } from "next/navigation"
import { JudgeInterface } from "@/components/JudgeInterface"

export default async function JudgePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const accessToken = await prisma.accessToken.findUnique({
    where: { token },
    include: {
      competition: { select: { id: true, name: true, status: true } },
      element: {
        include: {
          fields: { orderBy: { order: "asc" } },
          exceptions: { orderBy: { order: "asc" } },
        },
      },
    },
  })

  if (!accessToken || accessToken.type !== "JUDGE") notFound()

  // Leia elemendid, mida see kohtunik tohib sisestada
  let elements
  if (accessToken.element) {
    elements = [accessToken.element]
  } else {
    // Kõik elemendid selles võistluses
    elements = await prisma.scoringElement.findMany({
      where: { competitionId: accessToken.competition.id },
      orderBy: { order: "asc" },
      include: {
        fields: { orderBy: { order: "asc" } },
        exceptions: { orderBy: { order: "asc" } },
      },
    })
  }

  const teams = (await prisma.team.findMany({
    where: { competitionId: accessToken.competition.id },
  })).sort((a, b) => naturalCompare(a.code, b.code))

  // Olemasolevad tulemused
  const elementIds = elements.map(e => e.id)
  const results = await prisma.result.findMany({
    where: { elementId: { in: elementIds } },
    select: { elementId: true, teamId: true, values: true, exceptionLabel: true, updatedAt: true },
  })

  // Update lastUsedAt
  await prisma.accessToken.update({ where: { token }, data: { lastUsedAt: new Date() } })

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-sm font-semibold text-gray-900">{accessToken.competition.name}</span>
            <span className="text-xs text-gray-400 ml-2 hidden sm:inline">· Kohtunik: {accessToken.name}</span>
            <span className="text-xs text-gray-400 block sm:hidden truncate">Kohtunik: {accessToken.name}</span>
          </div>
          <span className={`text-xs px-2 py-1 rounded-full font-medium shrink-0 ${
            accessToken.competition.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
          }`}>
            {accessToken.competition.status === "ACTIVE" ? "Aktiivne" : "Ettevalmistus"}
          </span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        <JudgeInterface
          accessToken={token}
          elements={elements.map(el => ({
            id: el.id,
            name: el.name,
            code: el.code,
            fields: el.fields,
            exceptions: el.exceptions,
          }))}
          teams={teams.map(t => ({ id: t.id, name: t.name, code: t.code, class: t.class }))}
          existingResults={results}
        />
      </main>
    </div>
  )
}
