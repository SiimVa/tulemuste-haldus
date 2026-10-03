import "server-only"

import { prisma } from "@/lib/prisma"
import { naturalCompare } from "@/lib/utils"
import { parseTieBreakConfig } from "@/lib/tieBreak"
import { resultExceptionKind } from "@/lib/exceptionKinds"
import { applyFrozenElementStatus, applyFrozenTeamStatus } from "@/lib/leaderboardFreeze"
import { getFreezeState, getPublicFreeze } from "@/lib/leaderboardFreeze.server"
import {
  parseDashboardConfig,
  visibleWidgetIds,
  type DashboardConfig,
  type DashboardWidgetId,
  type MapColorMode,
} from "@/lib/dashboard/config"
import { computeTeamProgress, sortTeamProgress, type TeamProgress } from "@/lib/dashboard/routes"
import {
  elementProgressRows,
  elementTableRows,
  entryRate,
  freshnessRows,
  judgeActivity,
  summaryStats,
  withdrawals,
  type ElementProgressRow,
  type ElementTableRow,
  type EntryRate,
  type FreshnessLevel,
  type FreshnessRow,
  type JudgeActivity,
  type SummaryStats,
  type Withdrawals,
} from "@/lib/dashboard/progress"
import {
  buildStandings,
  closeContests,
  elementWinners,
  interimStandings,
  topTeams,
  type CloseContest,
  type ElementWinner,
  type InterimStandings,
  type StandingRow,
  type TopTeams,
} from "@/lib/dashboard/standings"
import {
  classComparison,
  difficultyRows,
  discriminationRows,
  penaltySummary,
  timeSpentRows,
  type ClassComparison,
  type DifficultyRow,
  type DiscriminationRow,
  type PenaltySummary,
  type TimeSpentRow,
} from "@/lib/dashboard/analysis"
import { mapGeometry, parseMapMarkers } from "@/lib/dashboard/mapData"
import type { DashElement, DashMiscEntry, DashPenalty, DashResult, DashScore, DashTeam, ScoringMode } from "@/lib/dashboard/types"

export type DashboardAudience = "internal" | "public"

export type DashboardMapPoint = {
  id: string
  code: string
  name: string
  mapX: number
  mapY: number
  visits: number
  // 0 (halb) … 1 (hea) keskmise tulemuse järgi; null kui hinnatav tulemus puudub.
  score: number | null
  freshness: FreshnessLevel | null
  minutesAgo: number | null
  teamsHere: number
}

export type DashboardMapData = {
  mode: "IMAGE" | "SCHEMATIC"
  imageUrl: string | null
  aspect: number
  scaleBar: { meters: number; fraction: number } | null
  colorMode: MapColorMode
  points: DashboardMapPoint[]
  markers: { id: string; label: string; mapX: number; mapY: number }[]
  unplacedCount: number
  maxVisits: number
}

export type DashboardData = {
  competition: { id: string; name: string; status: string; location: string | null; scoringMode: ScoringMode }
  audience: DashboardAudience
  generatedAt: Date
  // Avalikus vaates: külmutatud seisu aeg. Töölaual: avaliku pingerea külmutuse seis.
  freeze: { freezeAt: Date; frozen: boolean } | null
  config: DashboardConfig
  widgets: DashboardWidgetId[]
  classes: string[]
  summary?: SummaryStats
  elementProgress?: ElementProgressRow[]
  freshness?: FreshnessRow[]
  teamTracker?: TeamProgress[]
  missingResults?: TeamProgress[]
  judges?: JudgeActivity
  withdrawals?: Withdrawals
  entryRate?: EntryRate | null
  topTeams?: TopTeams
  interimStandings?: InterimStandings
  closeContests?: CloseContest[]
  elementWinners?: ElementWinner[]
  elementTable?: ElementTableRow[]
  difficulty?: DifficultyRow[]
  discrimination?: DiscriminationRow[]
  classComparison?: ClassComparison
  timeSpent?: TimeSpentRow[]
  penalties?: PenaltySummary
  map?: DashboardMapData | null
}

function parseValues(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

const STANDINGS_WIDGETS: DashboardWidgetId[] = ["topTeams", "interimStandings", "closeContests", "elementWinners", "difficulty", "discrimination", "classComparison", "map"]

export function mapImageUrl(competitionId: string, audience: DashboardAudience, version: Date) {
  const base = audience === "public" ? `/api/public/competitions/${competitionId}/map-image` : `/api/competitions/${competitionId}/map/image`
  return `${base}?v=${version.getTime()}`
}

export async function loadDashboard(competitionId: string, audience: DashboardAudience, now = new Date()): Promise<DashboardData | null> {
  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: {
      id: true, name: true, status: true, location: true, scoringMode: true, tieBreakConfig: true, dashboardConfig: true,
      defaultKPMaxValue: true, defaultPKMaxValue: true,
      registrationClasses: { where: { isActive: true }, orderBy: [{ order: "asc" }, { name: "asc" }], select: { name: true } },
    },
  })
  if (!competition) return null
  const config = parseDashboardConfig(competition.dashboardConfig)
  const widgets = visibleWidgetIds(config, audience, competition.status)
  const show = (id: DashboardWidgetId) => widgets.includes(id)
  const scoringMode: ScoringMode = competition.scoringMode === "PLUS" ? "PLUS" : "PENALTY"

  const publicFreeze = audience === "public" ? await getPublicFreeze(competitionId, now) : null
  const freezeState = audience === "internal" ? await getFreezeState(competitionId, now) : null

  const needsJudges = show("judges")
  const needsMap = show("map")
  const [teamRows, elementRows, resultRows, miscRows, scoreRows, penaltyRows, tokens, assignments, mapRow] = await Promise.all([
    prisma.team.findMany({
      where: { competitionId },
      select: { id: true, code: true, name: true, class: true, isHorsDeCompetition: true, hcFromElementOrder: true, dnfFromElementOrder: true, dnfReason: true, dqFromElementOrder: true, dnsFlag: true },
    }),
    prisma.scoringElement.findMany({
      where: { competitionId },
      orderBy: { order: "asc" },
      select: {
        id: true, code: true, name: true, type: true, order: true, isCancelled: true, maxValue: true,
        mapX: true, mapY: true, mgrs: true, latitude: true, longitude: true,
        fields: { orderBy: { order: "asc" }, select: { name: true, label: true, type: true, meta: true, rankingPriority: true } },
        exceptions: { orderBy: { order: "asc" }, select: { label: true, kind: true } },
      },
    }),
    prisma.result.findMany({
      where: { element: { competitionId } },
      select: { elementId: true, teamId: true, values: true, exceptionLabel: true, enteredAt: true, updatedAt: true, enteredByUserId: true, enteredByTokenId: true },
    }),
    prisma.miscEntry.findMany({
      where: { element: { competitionId } },
      select: { elementId: true, teamId: true, points: true, description: true, reason: true, abandonElementId: true, abandonTime: true, createdAt: true },
    }),
    prisma.computedScore.findMany({ where: { element: { competitionId } }, select: { elementId: true, teamId: true, penaltyPoints: true } }),
    prisma.manualPenalty.findMany({ where: { competitionId }, select: { teamId: true, points: true, description: true, enteredAt: true } }),
    needsJudges
      ? prisma.accessToken.findMany({ where: { competitionId }, select: { id: true, name: true, type: true, elementId: true, lastUsedAt: true } })
      : Promise.resolve([]),
    needsJudges
      ? prisma.judgeElementAssignment.findMany({ where: { competitionId }, select: { elementId: true, member: { select: { userId: true } } } })
      : Promise.resolve([]),
    needsMap
      ? prisma.competitionMap.findUnique({ where: { competitionId }, select: { imageType: true, imageWidth: true, imageHeight: true, imageUpdatedAt: true, markers: true } })
      : Promise.resolve(null),
  ])

  let teams: DashTeam[] = teamRows.sort((a, b) => naturalCompare(a.code, b.code))
  let elements: DashElement[] = elementRows.map((element) => ({
    id: element.id, code: element.code, name: element.name, type: element.type, order: element.order,
    isCancelled: element.isCancelled, maxValue: element.maxValue,
    inputFields: element.fields.filter((field) => field.type !== "COMPUTED"),
    exceptions: element.exceptions,
  }))
  let results: DashResult[] = resultRows.map((result) => ({ ...result, values: parseValues(result.values) }))
  let miscEntries: DashMiscEntry[] = miscRows
  let scores: DashScore[] = scoreRows.map((score) => ({ elementId: score.elementId, teamId: score.teamId, points: score.penaltyPoints }))
  let penalties: DashPenalty[] = penaltyRows

  // Külmutatud avalik vaade: tulemused ja seisud külmutamise hetke seisuga.
  if (publicFreeze) {
    const { freezeAt, snapshot } = publicFreeze
    teams = applyFrozenTeamStatus(teams, snapshot)
    elements = applyFrozenElementStatus(elements, snapshot)
    results = results.filter((result) => result.enteredAt <= freezeAt)
    miscEntries = miscEntries.filter((entry) => entry.createdAt <= freezeAt)
    scores = snapshot.scores
    penalties = snapshot.penalties.map((penalty) => ({ ...penalty, enteredAt: new Date(penalty.enteredAt) }))
  }

  const classes = [...new Set([
    ...competition.registrationClasses.map((cls) => cls.name),
    ...[...new Set(teams.map((team) => team.class).filter((cls): cls is string => Boolean(cls)))].sort(naturalCompare),
  ])]

  const data: DashboardData = {
    competition: { id: competition.id, name: competition.name, status: competition.status, location: competition.location, scoringMode },
    audience,
    generatedAt: now,
    freeze: publicFreeze ? { freezeAt: publicFreeze.freezeAt, frozen: true } : freezeState ? { freezeAt: freezeState.freezeAt, frozen: freezeState.frozen } : null,
    config,
    widgets,
    classes,
  }

  const progress = elementProgressRows(elements, teams, results, miscEntries)
  const teamProgress = computeTeamProgress({
    teams, elements, results, config, safetyMinutes: config.thresholds.safetyMinutes, status: competition.status, now,
  })
  const freshness = show("freshness") || needsMap
    ? freshnessRows(elements, progress, results, config.thresholds, competition.status, now)
    : []

  if (show("summary") || show("entryRate")) {
    const summary = summaryStats(teams, elements, progress, teamProgress)
    if (show("summary")) {
      // Avalikus vaates ei näidata ohutushoiatuste arvu.
      data.summary = audience === "public" ? { ...summary, alertCount: 0 } : summary
    }
    if (show("entryRate")) data.entryRate = entryRate(results, Math.max(0, summary.resultsExpected - summary.resultsEntered), competition.status, now)
  }
  if (show("elementProgress")) data.elementProgress = progress
  if (show("freshness")) data.freshness = freshness
  if (show("teamTracker")) data.teamTracker = sortTeamProgress(teamProgress)
  if (show("missingResults")) {
    data.missingResults = teamProgress
      .filter((row) => row.missing.length > 0)
      .sort((a, b) => b.missing.length - a.missing.length || naturalCompare(a.team.code, b.team.code))
  }
  if (needsJudges) {
    const userIds = [...new Set([
      ...results.flatMap((result) => (result.enteredByUserId ? [result.enteredByUserId] : [])),
      ...assignments.map((assignment) => assignment.member.userId),
    ])]
    const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : []
    data.judges = judgeActivity(elements, results, {
      tokens,
      users,
      assignments: assignments.map((assignment) => ({ userId: assignment.member.userId, elementId: assignment.elementId })),
    }, now)
  }
  if (show("withdrawals")) data.withdrawals = withdrawals(teams, elements, miscEntries)
  if (show("elementTable")) data.elementTable = elementTableRows(elements, teams, results)
  if (show("timeSpent")) data.timeSpent = timeSpentRows(elements, results, teams)
  if (show("penalties")) data.penalties = penaltySummary(elements, scores, results, penalties)

  let standings: StandingRow[] = []
  if (STANDINGS_WIDGETS.some(show)) {
    standings = buildStandings({
      teams, scores, penalties, elements, scoringMode, tieBreak: parseTieBreakConfig(competition.tieBreakConfig),
    })
  }
  const defaults = { kpMax: competition.defaultKPMaxValue, pkMax: competition.defaultPKMaxValue }
  if (show("topTeams")) data.topTeams = topTeams(standings, config.thresholds.topCount, classes)
  if (show("interimStandings")) data.interimStandings = interimStandings(standings, elements, scoringMode)
  if (show("closeContests")) data.closeContests = closeContests(standings, config.thresholds.closeGap, classes)
  if (show("elementWinners")) data.elementWinners = elementWinners(standings, elements, scoringMode, classes)
  const difficulty = show("difficulty") || needsMap ? difficultyRows(elements, standings, results, scoringMode, defaults) : []
  if (show("difficulty")) data.difficulty = difficulty
  if (show("discrimination")) data.discrimination = discriminationRows(elements, standings)
  if (show("classComparison")) data.classComparison = classComparison(elements, standings, classes, scoringMode)

  if (needsMap) {
    const image = mapRow?.imageType && mapRow.imageWidth && mapRow.imageHeight && mapRow.imageUpdatedAt
      ? { width: mapRow.imageWidth, height: mapRow.imageHeight, updatedAt: mapRow.imageUpdatedAt }
      : null
    const markers = parseMapMarkers(mapRow?.markers ?? [])
    const activeElements = elementRows.filter((element) => !element.isCancelled)
    const geometry = mapGeometry(image, [
      ...activeElements.map((element) => ({ id: element.id, mapX: element.mapX, mapY: element.mapY, mgrs: element.mgrs, latitude: element.latitude, longitude: element.longitude })),
      ...markers.map((marker) => ({ ...marker, id: `marker:${marker.id}` })),
    ])
    if (!geometry) data.map = null
    else {
      const elementById = new Map(elements.map((element) => [element.id, element]))
      const visits = new Map<string, number>()
      for (const result of results) {
        const element = elementById.get(result.elementId)
        if (!element || resultExceptionKind(result.exceptionLabel, element.exceptions) === "NOT_PASSED") continue
        visits.set(result.elementId, (visits.get(result.elementId) ?? 0) + 1)
      }
      const teamsHere = new Map<string, number>()
      if (audience === "internal") {
        for (const row of teamProgress) {
          if (row.status === "ON_ROUTE" && row.lastSeen) teamsHere.set(row.lastSeen.id, (teamsHere.get(row.lastSeen.id) ?? 0) + 1)
        }
      }
      const difficultyById = new Map(difficulty.map((row) => [row.id, row]))
      const freshnessById = new Map(freshness.map((row) => [row.id, row]))
      const points = activeElements.flatMap((element): DashboardMapPoint[] => {
        const position = geometry.positions.get(element.id)
        if (!position) return []
        const lossPct = difficultyById.get(element.id)?.lossPct
        const fresh = freshnessById.get(element.id)
        return [{
          id: element.id, code: element.code, name: element.name, mapX: position.mapX, mapY: position.mapY,
          visits: visits.get(element.id) ?? 0,
          score: lossPct == null ? null : Math.max(0, Math.min(1, 1 - lossPct / 100)),
          freshness: fresh?.level ?? null,
          minutesAgo: fresh?.minutesAgo ?? null,
          teamsHere: teamsHere.get(element.id) ?? 0,
        }]
      })
      data.map = {
        mode: geometry.mode,
        imageUrl: geometry.mode === "IMAGE" && image ? mapImageUrl(competitionId, audience, image.updatedAt) : null,
        aspect: geometry.aspect,
        scaleBar: geometry.scaleBar,
        colorMode: config.mapColorMode,
        points,
        markers: markers.flatMap((marker) => {
          const position = geometry.positions.get(`marker:${marker.id}`)
          return position ? [{ id: marker.id, label: marker.label, mapX: position.mapX, mapY: position.mapY }] : []
        }),
        unplacedCount: activeElements.filter((element) => ["CHECKPOINT", "PENALTY_BOX"].includes(element.type) && !geometry.positions.has(element.id)).length,
        maxVisits: Math.max(0, ...points.map((point) => point.visits)),
      }
    }
  }
  return data
}
