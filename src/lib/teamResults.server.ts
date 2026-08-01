import "server-only"

import type { ResultCard } from "@/components/athlete/AthleteResultCards"
import {
  formatAthletePoints,
  parseRanges,
  type AthletePointsMode,
  type RangeBucket,
} from "@/lib/athletePoints"
import { prisma } from "@/lib/prisma"

export type TeamResultTotalBlock = {
  totalLabel: string
  rank: number | null
  totalTeams: number
  classRank: number | null
  classTotal: number
  notional: boolean
  statusLabel: string | null
}

export type TeamResultData = {
  competition: { id: string; name: string }
  team: {
    id: string
    name: string
    class: string | null
    members: { name: string; role: string }[]
  }
  pointsMode: AthletePointsMode
  pointsRanges: RangeBucket[]
  showTotal: boolean
  showRank: boolean
  defaultMax: number
  scoringMode: "PENALTY" | "PLUS"
  totalBlock: TeamResultTotalBlock | null
  cards: ResultCard[]
}

export async function getTeamResultData(
  teamId: string
): Promise<TeamResultData | null> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      name: true,
      class: true,
      competitionId: true,
      isHorsDeCompetition: true,
      hcFromElementOrder: true,
      dnfFromElementOrder: true,
      members: {
        select: { name: true, role: true },
        orderBy: { name: "asc" },
      },
      competition: {
        select: {
          id: true,
          name: true,
          scoringMode: true,
          defaultKPMaxValue: true,
          athletePointsMode: true,
          athletePointsRanges: true,
          athleteShowTotal: true,
          athleteShowRank: true,
        },
      },
    },
  })
  if (!team) return null

  const competitionId = team.competitionId
  const pointsMode =
    (team.competition.athletePointsMode as AthletePointsMode) ?? "HIDDEN"
  const pointsRanges = parseRanges(team.competition.athletePointsRanges)
  const showTotal =
    team.competition.athleteShowTotal && pointsMode !== "HIDDEN"
  const showRank = team.competition.athleteShowRank && pointsMode !== "HIDDEN"
  const defaultMax = team.competition.defaultKPMaxValue
  const scoringMode = team.competition.scoringMode as "PENALTY" | "PLUS"

  const [results, miscEntries, elements, myScores] = await Promise.all([
    prisma.result.findMany({
      where: { teamId: team.id },
      include: {
        element: {
          select: {
            id: true,
            name: true,
            code: true,
            order: true,
            type: true,
            fields: { orderBy: { order: "asc" } },
            calcMethod: {
              select: { type: true, params: true, customFormula: true },
            },
          },
        },
      },
    }),
    prisma.miscEntry.findMany({
      where: { teamId: team.id },
      include: {
        element: {
          select: {
            id: true,
            name: true,
            code: true,
            order: true,
            type: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.scoringElement.findMany({
      where: { competitionId },
      orderBy: { order: "asc" },
      select: {
        id: true,
        name: true,
        code: true,
        order: true,
        type: true,
        isCancelled: true,
        maxValue: true,
        revealPointsToAthletes: true,
      },
    }),
    prisma.computedScore.findMany({
      where: { teamId: team.id },
      select: { elementId: true, penaltyPoints: true },
    }),
  ])

  const scoreByElement = new Map(
    myScores.map((score) => [score.elementId, score.penaltyPoints])
  )
  let totalBlock: TeamResultTotalBlock | null = null

  if (showTotal || showRank) {
    const [allScores, allPenalties, allTeams] = await Promise.all([
      prisma.computedScore.findMany({
        where: { element: { competitionId } },
        select: { teamId: true, penaltyPoints: true },
      }),
      prisma.manualPenalty.findMany({
        where: { competitionId },
        select: { teamId: true, points: true },
      }),
      prisma.team.findMany({
        where: { competitionId },
        select: {
          id: true,
          class: true,
          isHorsDeCompetition: true,
          hcFromElementOrder: true,
        },
      }),
    ])
    const totalByTeam = new Map<string, number>()
    for (const candidate of allTeams) totalByTeam.set(candidate.id, 0)
    for (const score of allScores) {
      totalByTeam.set(
        score.teamId,
        (totalByTeam.get(score.teamId) ?? 0) + score.penaltyPoints
      )
    }
    for (const penalty of allPenalties) {
      totalByTeam.set(
        penalty.teamId,
        (totalByTeam.get(penalty.teamId) ?? 0) +
          (scoringMode === "PLUS" ? -penalty.points : penalty.points)
      )
    }

    const ranked = allTeams
      .filter(
        (candidate) =>
          !candidate.isHorsDeCompetition &&
          candidate.hcFromElementOrder == null
      )
      .map((candidate) => ({
        id: candidate.id,
        class: candidate.class ?? "–",
        total:
          Math.round((totalByTeam.get(candidate.id) ?? 0) * 1000) / 1000,
      }))
      .sort((a, b) =>
        scoringMode === "PLUS" ? b.total - a.total : a.total - b.total
      )
    const myTotal =
      Math.round((totalByTeam.get(team.id) ?? 0) * 1000) / 1000
    const myClass = team.class ?? "–"
    const classRanked = ranked.filter((candidate) => candidate.class === myClass)
    const rankIndex = ranked.findIndex((candidate) => candidate.id === team.id)
    const classIndex = classRanked.findIndex(
      (candidate) => candidate.id === team.id
    )
    const teamHorsDeCompetition =
      team.isHorsDeCompetition || team.hcFromElementOrder != null
    const teamDidNotFinish = team.dnfFromElementOrder != null
    const isNotional =
      rankIndex < 0 && (teamHorsDeCompetition || teamDidNotFinish)
    const betterThan = (list: { total: number }[]) =>
      list.filter((candidate) =>
        scoringMode === "PLUS"
          ? candidate.total > myTotal
          : candidate.total < myTotal
      ).length

    totalBlock = {
      totalLabel:
        formatAthletePoints(
          myTotal,
          0,
          "EXACT",
          pointsRanges,
          scoringMode
        ) ?? `${myTotal}p`,
      rank:
        rankIndex >= 0
          ? rankIndex + 1
          : isNotional
            ? betterThan(ranked) + 1
            : null,
      totalTeams: ranked.length + (isNotional ? 1 : 0),
      classRank:
        classIndex >= 0
          ? classIndex + 1
          : isNotional
            ? betterThan(classRanked) + 1
            : null,
      classTotal: classRanked.length + (isNotional ? 1 : 0),
      notional: isNotional,
      statusLabel: isNotional
        ? teamDidNotFinish
          ? "Katkestanud"
          : "Arvestusväline"
        : null,
    }
  }

  const miscByElement = new Map<string, typeof miscEntries>()
  for (const entry of miscEntries) {
    const current = miscByElement.get(entry.elementId) ?? []
    current.push(entry)
    miscByElement.set(entry.elementId, current)
  }

  const resultByElement = new Map(
    results.map((result) => [result.elementId, result])
  )
  const activeElementIds = new Set([
    ...results.map((result) => result.elementId),
    ...miscEntries.map((entry) => entry.elementId),
  ])
  const activeElements = elements.filter((element) =>
    activeElementIds.has(element.id)
  )

  const cards = activeElements.flatMap((element): ResultCard[] => {
    if (element.type === "OTHER" || element.type === "ABANDONMENT") {
      return [
        {
          id: element.id,
          code: element.code,
          name: element.name,
          type: element.type,
          isCancelled: element.isCancelled,
          maxValue: element.maxValue ?? defaultMax,
          revealPointsToAthletes: element.revealPointsToAthletes,
          exceptionLabel: null,
          realScore: scoreByElement.get(element.id) ?? null,
          fields: [],
          inputFields: [],
          values: {},
          calcType: null,
          customFormula: null,
          calcParams: {},
          misc: (miscByElement.get(element.id) ?? []).map((entry) => ({
            id: entry.id,
            description: entry.description,
            points: entry.points,
          })),
        },
      ]
    }

    const result = resultByElement.get(element.id)
    if (!result) return []
    let values: Record<string, string> = {}
    try {
      values = JSON.parse(result.values)
    } catch {}
    const calculation = result.element.calcMethod
    let calculationParameters: Record<string, unknown> = {}
    try {
      calculationParameters = JSON.parse(calculation?.params ?? "{}")
    } catch {}

    return [
      {
        id: element.id,
        code: element.code,
        name: element.name,
        type: element.type,
        isCancelled: element.isCancelled,
        maxValue: element.maxValue ?? defaultMax,
        revealPointsToAthletes: element.revealPointsToAthletes,
        exceptionLabel: result.exceptionLabel ?? null,
        realScore: scoreByElement.get(element.id) ?? null,
        fields: result.element.fields.map((field) => ({
          name: field.name,
          type: field.type,
          isResultField: field.isResultField,
          rankingPriority: field.rankingPriority,
          formula: field.formula,
          order: field.order,
        })),
        inputFields: result.element.fields
          .filter((field) => field.type !== "COMPUTED")
          .map((field) => ({
            name: field.name,
            label: field.label,
            type: field.type,
          })),
        values,
        calcType: calculation?.type ?? null,
        customFormula: calculation?.customFormula ?? null,
        calcParams: calculationParameters,
        misc: [],
      },
    ]
  })

  return {
    competition: {
      id: team.competition.id,
      name: team.competition.name,
    },
    team: {
      id: team.id,
      name: team.name,
      class: team.class,
      members: team.members,
    },
    pointsMode,
    pointsRanges,
    showTotal,
    showRank,
    defaultMax,
    scoringMode,
    totalBlock,
    cards,
  }
}
