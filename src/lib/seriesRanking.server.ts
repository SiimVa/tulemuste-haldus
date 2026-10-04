import "server-only"
import { prisma } from "@/lib/prisma"
import { computeSeriesRanking, type SeriesCompetitionData, type SeriesScoringMode } from "@/lib/seriesRanking"
import { checkSeriesRules, type RuleCompetition } from "@/lib/seriesRules"

export const COMPETITION_STATUS_LABELS: Record<string, string> = {
  SETUP: "Ettevalmistus",
  ACTIVE: "Toimub",
  FINISHED: "Lõppenud",
  CANCELLED: "Tühistatud",
  ARCHIVED: "Arhiveeritud",
}

// Laeb üleriikliku arvestuse osavõistluste andmed ning arvutab pingerea ja
// reeglite kontrolli. Kasutab salvestatud punkte, osavõistlusi ümber ei arvuta.
export async function loadSeriesRanking(seriesId: string) {
  const series = await prisma.competitionSeries.findUnique({
    where: { id: seriesId },
    include: {
      competitions: {
        orderBy: [{ order: "asc" }, { competition: { name: "asc" } }],
        include: {
          competition: {
            select: { id: true, name: true, status: true, date: true, scoringMode: true, defaultKPMaxValue: true, defaultPKMaxValue: true },
          },
        },
      },
    },
  })
  if (!series) return null

  const competitions = series.competitions.map(({ competition }) => competition)
  const competitionIds = competitions.map(({ id }) => id)
  const [elements, teams, results, scores, penalties] = await Promise.all([
    prisma.scoringElement.findMany({
      where: { competitionId: { in: competitionIds } },
      orderBy: { order: "asc" },
      include: {
        exceptions: { orderBy: { order: "asc" } },
        calcMethod: true,
        fields: { where: { sectionId: null }, orderBy: { order: "asc" } },
        sections: { orderBy: { order: "asc" }, include: { calcMethod: true, fields: { orderBy: { order: "asc" } } } },
      },
    }),
    prisma.team.findMany({
      where: { competitionId: { in: competitionIds } },
      select: { id: true, competitionId: true, code: true, name: true, class: true, isHorsDeCompetition: true, hcFromElementOrder: true, dnfFromElementOrder: true, dnsFlag: true },
    }),
    prisma.result.findMany({
      where: { element: { competitionId: { in: competitionIds } } },
      select: { elementId: true, teamId: true, exceptionLabel: true },
    }),
    prisma.computedScore.findMany({
      where: { element: { competitionId: { in: competitionIds } } },
      select: { elementId: true, teamId: true, penaltyPoints: true },
    }),
    prisma.manualPenalty.findMany({
      where: { competitionId: { in: competitionIds } },
      select: { competitionId: true, teamId: true, points: true },
    }),
  ])

  const competitionOfElement = new Map(elements.map((element) => [element.id, element.competitionId]))
  const inCompetition = (competitionId: string) => <T extends { elementId: string }>(item: T) => competitionOfElement.get(item.elementId) === competitionId

  const rankingData: SeriesCompetitionData[] = competitions.map((competition) => ({
    id: competition.id,
    name: competition.name,
    scoringMode: competition.scoringMode as SeriesScoringMode,
    elements: elements.filter((element) => element.competitionId === competition.id),
    teams: teams.filter((team) => team.competitionId === competition.id),
    results: results.filter(inCompetition(competition.id)),
    scores: scores.filter(inCompetition(competition.id)).map(({ elementId, teamId, penaltyPoints }) => ({ elementId, teamId, points: penaltyPoints })),
    manualPenalties: penalties.filter((penalty) => penalty.competitionId === competition.id),
  }))
  const ruleData: RuleCompetition[] = competitions.map((competition) => ({
    id: competition.id,
    name: competition.name,
    scoringMode: competition.scoringMode,
    defaultKPMaxValue: competition.defaultKPMaxValue,
    defaultPKMaxValue: competition.defaultPKMaxValue,
    elements: elements.filter((element) => element.competitionId === competition.id),
  }))

  return {
    series: { id: series.id, name: series.name, updatedAt: series.updatedAt },
    competitions: competitions.map((competition) => ({
      id: competition.id,
      name: competition.name,
      status: competition.status,
      statusLabel: COMPETITION_STATUS_LABELS[competition.status] ?? competition.status,
      date: competition.date,
    })),
    ranking: computeSeriesRanking(rankingData),
    rules: checkSeriesRules(ruleData),
  }
}

export type LoadedSeriesRanking = NonNullable<Awaited<ReturnType<typeof loadSeriesRanking>>>

const MAX_SERIES_COMPETITIONS = 50

// Loomise ja muutmise sisend: nimi ja osavõistlused (järjekord = valiku järjekord).
export async function parseSeriesInput(body: unknown): Promise<
  { ok: true; name: string; competitionIds: string[] } | { ok: false; error: string }
> {
  const input = body && typeof body === "object" ? (body as Record<string, unknown>) : {}
  const name = typeof input.name === "string" ? input.name.trim() : ""
  if (!name) return { ok: false, error: "Arvestuse nimi on kohustuslik" }
  if (name.length > 120) return { ok: false, error: "Arvestuse nimi on liiga pikk" }
  const requested: unknown[] = Array.isArray(input.competitionIds) ? input.competitionIds : []
  if (requested.some((id) => typeof id !== "string" || !id)) return { ok: false, error: "Vigane osavõistlus" }
  const competitionIds = [...new Set(requested as string[])]
  if (competitionIds.length === 0) return { ok: false, error: "Vali vähemalt üks osavõistlus" }
  if (competitionIds.length > MAX_SERIES_COMPETITIONS) return { ok: false, error: `Arvestuses saab olla kuni ${MAX_SERIES_COMPETITIONS} osavõistlust` }
  const found = await prisma.competition.count({ where: { id: { in: competitionIds } } })
  if (found !== competitionIds.length) return { ok: false, error: "Osavõistlust ei leitud" }
  return { ok: true, name, competitionIds }
}
