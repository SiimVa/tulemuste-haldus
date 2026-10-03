import { notFound } from "next/navigation"
import Link from "next/link"
import { requireCompetitionManager } from "@/lib/competitionPageAccess.server"
import { prisma } from "@/lib/prisma"
import { naturalCompare } from "@/lib/utils"
import { parseDashboardConfig } from "@/lib/dashboard/config"
import { DashboardSettingsForm } from "@/components/dashboard/DashboardSettingsForm"

export const dynamic = "force-dynamic"

export default async function DashboardSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requireCompetitionManager(id)
  const competition = await prisma.competition.findUnique({
    where: { id },
    select: {
      name: true, status: true, dashboardConfig: true,
      registrationClasses: { where: { isActive: true }, orderBy: [{ order: "asc" }, { name: "asc" }], select: { name: true } },
      teams: { select: { class: true } },
      elements: { orderBy: { order: "asc" }, select: { id: true, code: true, name: true, type: true, isCancelled: true } },
    },
  })
  if (!competition) notFound()
  const classes = [...new Set([
    ...competition.registrationClasses.map((cls) => cls.name),
    ...competition.teams.map((team) => team.class).filter((cls): cls is string => Boolean(cls)).sort(naturalCompare),
  ])]

  return (
    <div className="max-w-4xl">
      <div className="mb-4 flex items-center gap-2 text-sm text-gray-400">
        <Link href={`/dashboard/competitions/${id}/overview`}>← Statistika</Link>
      </div>
      <h1 className="text-2xl font-bold text-gray-900">{competition.name}</h1>
      <p className="mb-6 mt-1 text-sm text-gray-500">Statistika vaate kohandamine: millised vidinad on töölaual ja avalikus vaates.</p>
      <DashboardSettingsForm
        competitionId={id}
        initialConfig={parseDashboardConfig(competition.dashboardConfig)}
        classes={classes}
        elements={competition.elements.filter((element) => !element.isCancelled)}
      />
    </div>
  )
}
