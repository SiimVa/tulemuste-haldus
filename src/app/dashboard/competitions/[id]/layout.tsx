import { requireCompetitionManager } from "@/lib/competitionPageAccess.server"

export default async function CompetitionLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  await requireCompetitionManager(id)

  return children
}
