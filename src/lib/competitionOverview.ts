import { prisma } from "@/lib/prisma"

export type ElementProgress = {
  id: string
  name: string
  code: string
  type: string
  isCancelled: boolean
  entered: number
  total: number
}

export type CompetitionOverview = {
  competition: { id: string; name: string; status: string; date: Date | null; endDate: Date | null; location: string | null }
  teamCount: number
  inCompCount: number
  classCount: number
  elementCount: number
  activeElementCount: number
  elements: ElementProgress[]
  totalEntered: number
  totalSlots: number
  progressPct: number
}

export async function getCompetitionOverview(id: string): Promise<CompetitionOverview | null> {
  const competition = await prisma.competition.findUnique({
    where: { id },
    select: { id: true, name: true, status: true, date: true, endDate: true, location: true },
  })
  if (!competition) return null

  const [teams, elements, results, miscEntries] = await Promise.all([
    prisma.team.findMany({ where: { competitionId: id }, select: { id: true, class: true, isHorsDeCompetition: true } }),
    prisma.scoringElement.findMany({
      where: { competitionId: id },
      orderBy: { order: "asc" },
      select: { id: true, name: true, code: true, type: true, isCancelled: true },
    }),
    prisma.result.findMany({ where: { element: { competitionId: id } }, select: { elementId: true, teamId: true } }),
    prisma.miscEntry.findMany({ where: { element: { competitionId: id } }, select: { elementId: true, teamId: true } }),
  ])

  const teamCount = teams.length
  const inCompCount = teams.filter((t) => !t.isHorsDeCompetition).length
  const classCount = new Set(teams.map((t) => t.class ?? "–")).size

  // Mitu erinevat võistkonda on igas elemendis sooritusi teinud (Result või MiscEntry)
  const enteredByElement = new Map<string, Set<string>>()
  const add = (elementId: string, teamId: string) => {
    const s = enteredByElement.get(elementId) ?? new Set<string>()
    s.add(teamId)
    enteredByElement.set(elementId, s)
  }
  for (const r of results) add(r.elementId, r.teamId)
  for (const m of miscEntries) add(m.elementId, m.teamId)

  const elementProgress: ElementProgress[] = elements.map((el) => ({
    id: el.id,
    name: el.name,
    code: el.code,
    type: el.type,
    isCancelled: el.isCancelled,
    entered: enteredByElement.get(el.id)?.size ?? 0,
    total: teamCount,
  }))

  const activeElements = elements.filter((e) => !e.isCancelled)
  const totalSlots = activeElements.length * teamCount
  const totalEntered = activeElements.reduce((s, el) => s + (enteredByElement.get(el.id)?.size ?? 0), 0)
  const progressPct = totalSlots > 0 ? Math.round((totalEntered / totalSlots) * 100) : 0

  return {
    competition,
    teamCount,
    inCompCount,
    classCount,
    elementCount: elements.length,
    activeElementCount: activeElements.length,
    elements: elementProgress,
    totalEntered,
    totalSlots,
    progressPct,
  }
}
