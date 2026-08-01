import Link from "next/link"
import { notFound } from "next/navigation"
import { TeamResultsView } from "@/components/athlete/TeamResultsView"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getTeamResultData } from "@/lib/teamResults.server"

export const dynamic = "force-dynamic"

export default async function MemberTeamResultsPage({
  params,
}: {
  params: Promise<{ teamId: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) return null

  const { teamId } = await params
  const membership = await prisma.teamMember.findFirst({
    where: { teamId, userId: session.user.id },
    select: { id: true },
  })
  if (!membership) notFound()

  const data = await getTeamResultData(teamId)
  if (!data) notFound()

  return (
    <div className="max-w-2xl">
      <Link
        href="/dashboard"
        className="text-sm text-gray-400 hover:text-gray-600"
      >
        ← Tagasi
      </Link>
      <div className="mt-4 mb-6">
        <p className="text-sm font-medium text-blue-600">
          {data.competition.name}
        </p>
        <h1 className="text-2xl font-bold text-gray-900 mt-1">
          Võistkonna tulemused
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Näed korraldaja poolt võistlejatele avaldatud tulemusi ja kohti.
        </p>
      </div>

      <TeamResultsView data={data} />
    </div>
  )
}
