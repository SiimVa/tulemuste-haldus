import "server-only"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { getPublicFreeze } from "@/lib/leaderboardFreeze.server"
import { applyFrozenElementStatus, applyFrozenTeamStatus } from "@/lib/leaderboardFreeze"
import { isAnalysisAccessMode, type AnalysisAccessMode } from "@/lib/analysisAccess"
import { computeSeriesRanking, type SeriesCompetitionData, type SeriesRanking, type SeriesScoringMode } from "@/lib/seriesRanking"
import { checkSeriesRules, type RuleCompetition, type SeriesRulesCheck } from "@/lib/seriesRules"
import { parseSeriesDashboardConfig, type SeriesAudience, type SeriesDashboardConfig } from "@/lib/seriesDashboard"
import { parseSeriesFreezeSnapshot, type SeriesFreezeSnapshot } from "@/lib/seriesFreeze"

export const COMPETITION_STATUS_LABELS: Record<string, string> = {
  SETUP: "Ettevalmistus",
  ACTIVE: "Toimub",
  FINISHED: "Lõppenud",
  CANCELLED: "Tühistatud",
  ARCHIVED: "Arhiveeritud",
}

const competitionMetaSelect = {
  id: true, name: true, status: true, date: true, scoringMode: true, defaultKPMaxValue: true, defaultPKMaxValue: true,
} as const

const seriesCompetitionsInclude = {
  orderBy: [{ order: "asc" as const }, { competition: { name: "asc" as const } }],
  select: { competition: { select: competitionMetaSelect } },
}

type CompetitionMeta = {
  id: string
  name: string
  status: string
  date: Date | null
  scoringMode: string
  defaultKPMaxValue: number
  defaultPKMaxValue: number
}

// Osavõistluste lähteandmed. Avalikus vaates näidatakse külmutatud
// osavõistlusest selle külmutamise hetke seisu, et peidetud tulemused
// üleriikliku arvestuse kaudu ei lekiks.
async function loadCompetitionData(competitions: CompetitionMeta[], audience: SeriesAudience, now: Date) {
  const competitionIds = competitions.map(({ id }) => id)
  const [elements, teams, results, scores, penalties, freezes] = await Promise.all([
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
      select: { elementId: true, teamId: true, exceptionLabel: true, enteredAt: true },
    }),
    prisma.computedScore.findMany({
      where: { element: { competitionId: { in: competitionIds } } },
      select: { elementId: true, teamId: true, penaltyPoints: true },
    }),
    prisma.manualPenalty.findMany({
      where: { competitionId: { in: competitionIds } },
      select: { competitionId: true, teamId: true, points: true, description: true },
    }),
    audience === "public"
      ? Promise.all(competitionIds.map(async (competitionId) => [competitionId, await getPublicFreeze(competitionId, now)] as const))
      : Promise.resolve([] as const),
  ])
  const freezeByCompetition = new Map(freezes)
  const competitionOfElement = new Map(elements.map((element) => [element.id, element.competitionId]))
  const inCompetition = (competitionId: string) => <T extends { elementId: string }>(item: T) => competitionOfElement.get(item.elementId) === competitionId

  const data: SeriesCompetitionData[] = competitions.map((competition) => {
    let competitionElements = elements.filter((element) => element.competitionId === competition.id).map((element) => ({
      id: element.id,
      code: element.code,
      name: element.name,
      type: element.type,
      order: element.order,
      isCancelled: element.isCancelled,
      exceptions: element.exceptions.map(({ label, kind }) => ({ label, kind })),
      maxValue: element.maxValue ?? (element.type === "CHECKPOINT" ? competition.defaultKPMaxValue : element.type === "PENALTY_BOX" ? competition.defaultPKMaxValue : null),
    }))
    let competitionTeams = teams.filter((team) => team.competitionId === competition.id).map((team) => ({
      id: team.id, code: team.code, name: team.name, class: team.class, isHorsDeCompetition: team.isHorsDeCompetition,
      hcFromElementOrder: team.hcFromElementOrder, dnfFromElementOrder: team.dnfFromElementOrder, dnsFlag: team.dnsFlag,
    }))
    let competitionResults = results.filter(inCompetition(competition.id))
    let competitionScores = scores.filter(inCompetition(competition.id)).map(({ elementId, teamId, penaltyPoints }) => ({ elementId, teamId, points: penaltyPoints }))
    let competitionPenalties = penalties.filter((penalty) => penalty.competitionId === competition.id).map(({ teamId, points, description }) => ({ teamId, points, description }))
    const freeze = freezeByCompetition.get(competition.id)
    if (freeze) {
      competitionTeams = applyFrozenTeamStatus(competitionTeams, freeze.snapshot)
      competitionElements = applyFrozenElementStatus(competitionElements, freeze.snapshot)
      competitionResults = competitionResults.filter((result) => result.enteredAt <= freeze.freezeAt)
      competitionScores = freeze.snapshot.scores
      competitionPenalties = freeze.snapshot.penalties.map(({ teamId, points, description }) => ({ teamId, points, description }))
    }
    return {
      id: competition.id,
      name: competition.name,
      scoringMode: competition.scoringMode as SeriesScoringMode,
      elements: competitionElements,
      teams: competitionTeams,
      results: competitionResults.map(({ elementId, teamId, exceptionLabel }) => ({ elementId, teamId, exceptionLabel })),
      scores: competitionScores,
      manualPenalties: competitionPenalties,
    }
  })
  const ruleData: RuleCompetition[] = competitions.map((competition) => ({
    id: competition.id,
    name: competition.name,
    scoringMode: competition.scoringMode,
    defaultKPMaxValue: competition.defaultKPMaxValue,
    defaultPKMaxValue: competition.defaultPKMaxValue,
    elements: elements.filter((element) => element.competitionId === competition.id),
  }))
  const frozenCompetitionNames = competitions.filter((competition) => freezeByCompetition.get(competition.id)).map((competition) => competition.name)
  return { data, ruleData, frozenCompetitionNames }
}

// Võtab külmutuse snapshot'i, kui aeg on käes ja seda veel pole. Samaaegsed
// päringud ei kirjuta üksteise snapshot'i üle.
async function ensureSeriesSnapshot(seriesId: string, now: Date): Promise<SeriesFreezeSnapshot | null> {
  const current = await prisma.competitionSeries.findUnique({
    where: { id: seriesId },
    select: { freezeAt: true, freezeSnapshot: true, competitions: seriesCompetitionsInclude },
  })
  if (!current?.freezeAt || current.freezeAt > now) return null
  if (current.freezeSnapshot) return parseSeriesFreezeSnapshot(current.freezeSnapshot, current.freezeAt)
  const { data } = await loadCompetitionData(current.competitions.map(({ competition }) => competition), "public", now)
  const snapshot: SeriesFreezeSnapshot = { version: 1, takenAt: now.toISOString(), competitions: data }
  const updated = await prisma.competitionSeries.updateMany({
    where: { id: seriesId, freezeAt: current.freezeAt, freezeSnapshotAt: null },
    data: { freezeSnapshot: snapshot as unknown as Prisma.InputJsonValue, freezeSnapshotAt: now },
  })
  if (updated.count === 1) return snapshot
  const stored = await prisma.competitionSeries.findUnique({ where: { id: seriesId }, select: { freezeAt: true, freezeSnapshot: true } })
  return stored?.freezeAt && stored.freezeSnapshot ? parseSeriesFreezeSnapshot(stored.freezeSnapshot, stored.freezeAt) : snapshot
}

export type SeriesView = {
  series: {
    id: string
    name: string
    isPublished: boolean
    analysisAccessMode: AnalysisAccessMode
    hasAnalysisLink: boolean
    freezeAt: Date | null
    frozen: boolean
  }
  competitions: (CompetitionMeta & { statusLabel: string })[]
  data: SeriesCompetitionData[]
  ranking: SeriesRanking
  rules: SeriesRulesCheck | null
  config: SeriesDashboardConfig
  audience: SeriesAudience
  generatedAt: Date
  // Avalik vaade külmutatud arvestusest näitab külmutamise hetke seisu.
  publicFreeze: { freezeAt: Date } | null
  frozenCompetitionNames: string[]
}

// Üleriikliku arvestuse andmed vaate jaoks. Sisemine vaade näitab jooksvat
// seisu ja reeglite kontrolli; avalik vaade arvestab külmutusi. Avaldamist
// kontrollivad lehed ise (administraator näeb avaldamata arvestuse eelvaadet).
export async function loadSeriesView(seriesId: string, audience: SeriesAudience, now = new Date()): Promise<SeriesView | null> {
  const series = await prisma.competitionSeries.findUnique({
    where: { id: seriesId },
    select: {
      id: true, name: true, isPublished: true, analysisAccessMode: true, analysisTokenHash: true, dashboardConfig: true, freezeAt: true,
      competitions: seriesCompetitionsInclude,
    },
  })
  if (!series) return null
  const competitions = series.competitions.map(({ competition }) => competition)
  const frozen = series.freezeAt !== null && series.freezeAt <= now

  let data: SeriesCompetitionData[]
  let rules: SeriesRulesCheck | null = null
  let frozenCompetitionNames: string[] = []
  if (audience === "public" && frozen) {
    data = (await ensureSeriesSnapshot(series.id, now))?.competitions ?? []
  } else {
    const loaded = await loadCompetitionData(competitions, audience, now)
    data = loaded.data
    frozenCompetitionNames = loaded.frozenCompetitionNames
    if (audience === "internal") rules = checkSeriesRules(loaded.ruleData)
  }

  return {
    series: {
      id: series.id,
      name: series.name,
      isPublished: series.isPublished,
      analysisAccessMode: isAnalysisAccessMode(series.analysisAccessMode) ? series.analysisAccessMode : "PUBLIC",
      hasAnalysisLink: Boolean(series.analysisTokenHash),
      freezeAt: series.freezeAt,
      frozen,
    },
    competitions: competitions.map((competition) => ({ ...competition, statusLabel: COMPETITION_STATUS_LABELS[competition.status] ?? competition.status })),
    data,
    ranking: computeSeriesRanking(data),
    rules,
    config: parseSeriesDashboardConfig(series.dashboardConfig),
    audience,
    generatedAt: now,
    publicFreeze: audience === "public" && frozen && series.freezeAt ? { freezeAt: series.freezeAt } : null,
    frozenCompetitionNames,
  }
}

// Määrab külmutamise aja; möödunud või praegune aeg külmutab kohe.
export async function setSeriesFreeze(seriesId: string, freezeAt: Date, now = new Date()) {
  await prisma.competitionSeries.update({
    where: { id: seriesId },
    data: { freezeAt, freezeSnapshot: Prisma.DbNull, freezeSnapshotAt: null },
  })
  if (freezeAt <= now) await ensureSeriesSnapshot(seriesId, now)
}

// Avalikustab: avalikud vaated näitavad taas jooksvat seisu.
export async function revealSeries(seriesId: string) {
  await prisma.competitionSeries.update({
    where: { id: seriesId },
    data: { freezeAt: null, freezeSnapshot: Prisma.DbNull, freezeSnapshotAt: null },
  })
}

// Cron: ajastatud külmutused saavad snapshot'i ka siis, kui keegi avalikku
// vaadet parajasti ei ava.
export async function processDueSeriesFreezesSafely(now = new Date()) {
  try {
    const due = await prisma.competitionSeries.findMany({
      where: { freezeSnapshotAt: null, freezeAt: { lte: now } },
      select: { id: true },
      take: 20,
    })
    let taken = 0
    for (const { id } of due) if (await ensureSeriesSnapshot(id, now)) taken++
    return { taken }
  } catch (error) {
    console.error("Series freeze processing failed:", error instanceof Error ? error.message : error)
    return { taken: 0, failed: true }
  }
}

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
