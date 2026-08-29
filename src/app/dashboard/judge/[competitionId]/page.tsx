import Link from "next/link"
import { notFound } from "next/navigation"
import { JudgeInterface } from "@/components/JudgeInterface"
import { auth } from "@/lib/auth"
import { canAccessCompetition } from "@/lib/competitionAccess"
import { prisma } from "@/lib/prisma"
import { naturalCompare } from "@/lib/utils"

export default async function AccountJudgePage({
  params,
}: {
  params: Promise<{ competitionId: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) return null

  const { competitionId } = await params
  const actor = { id: session.user.id, role: session.user.role }
  const mayManageAll = await canAccessCompetition(competitionId, actor)

  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: { id: true, name: true, status: true },
  })
  if (!competition) notFound()

  const membership = mayManageAll
    ? null
    : await prisma.competitionMember.findUnique({
        where: {
          competitionId_userId: {
            competitionId,
            userId: session.user.id,
          },
        },
        select: {
          roles: { where: { role: "JUDGE" }, select: { role: true } },
          judgedElements: { select: { elementId: true } },
        },
      })

  if (!mayManageAll && (!membership || membership.roles.length === 0)) {
    notFound()
  }

  const assignedElementIds =
    membership?.judgedElements.map(({ elementId }) => elementId) ?? []
  const elements = await prisma.scoringElement.findMany({
    where: {
      competitionId,
      ...(mayManageAll ? {} : { id: { in: assignedElementIds } }),
    },
    orderBy: { order: "asc" },
    include: {
      fields: { orderBy: { order: "asc" } },
      exceptions: { orderBy: { order: "asc" } },
    },
  })

  const teams = (
    await prisma.team.findMany({ where: { competitionId } })
  ).sort((a, b) => naturalCompare(a.code, b.code))
  const results = await prisma.result.findMany({
    where: { elementId: { in: elements.map(({ id }) => id) } },
    select: {
      elementId: true,
      teamId: true,
      values: true,
      exceptionLabel: true,
      updatedAt: true,
    },
  })

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-5">
        <Link href="/dashboard" className="text-sm text-gray-400 hover:text-blue-600">
          ← Tagasi töölauale
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{competition.name}</h1>
          <p className="text-sm text-gray-500 mt-1">
            Kohtunik: {session.user.name}
          </p>
        </div>
        <span
          className={`text-xs px-2 py-1 rounded-full font-medium shrink-0 ${
            competition.status === "ACTIVE"
              ? "bg-green-100 text-green-700"
              : "bg-gray-100 text-gray-600"
          }`}
        >
          {competition.status === "ACTIVE" ? "Aktiivne" : "Ettevalmistus"}
        </span>
      </div>

      {elements.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-800">
          Sulle pole veel ühtegi hindamiselementi määratud.
        </div>
      ) : (
        <JudgeInterface
          elements={elements.map((element) => ({
            id: element.id,
            name: element.name,
            code: element.code,
            fields: element.fields,
            exceptions: element.exceptions,
          }))}
          teams={teams.map((team) => ({
            id: team.id,
            name: team.name,
            code: team.code,
            class: team.class,
          }))}
          existingResults={results}
        />
      )}
    </div>
  )
}
