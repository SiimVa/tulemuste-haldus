import { leaderboardGaps } from "../leaderboard"
import { rankLeaderboard, type TieBreakConfig, type TieBreakElement } from "../tieBreak"
import { ROUTE_ELEMENT_TYPES, round2, type DashScore, type DashTeam, type ScoringMode } from "./types"

type TeamRef = { id: string; code: string; name: string; class: string | null }

export type StandingRow = {
  team: TeamRef
  total: number
  manualTotal: number
  byElement: Record<string, number>
  rank: number
  classRank: number | null
}

const round3 = (value: number) => Math.round(value * 1000) / 1000

export function isEligibleForRanking(team: Pick<DashTeam, "isHorsDeCompetition" | "hcFromElementOrder" | "dnfFromElementOrder">) {
  return !team.isHorsDeCompetition && team.hcFromElementOrder == null && team.dnfFromElementOrder == null
}

// Sama arvutus mis pingereas: käsitsi karistused liidetakse (PENALTY) või
// lahutatakse (PLUS), viigid lahendatakse võistluse reeglite järgi.
export function buildStandings(input: {
  teams: DashTeam[]
  scores: DashScore[]
  penalties: { teamId: string; points: number }[]
  elements: TieBreakElement[]
  scoringMode: ScoringMode
  tieBreak: TieBreakConfig
}): StandingRow[] {
  const { teams, scores, penalties, elements, scoringMode, tieBreak } = input
  const byTeam = new Map<string, Record<string, number>>()
  for (const score of scores) {
    const map = byTeam.get(score.teamId) ?? {}
    map[score.elementId] = score.points
    byTeam.set(score.teamId, map)
  }
  const manual = new Map<string, number>()
  for (const penalty of penalties) manual.set(penalty.teamId, (manual.get(penalty.teamId) ?? 0) + penalty.points)
  const rows = teams.filter(isEligibleForRanking).map((team) => {
    const byElement = byTeam.get(team.id) ?? {}
    const kpTotal = Object.values(byElement).reduce((sum, points) => sum + points, 0)
    const manualTotal = manual.get(team.id) ?? 0
    return {
      team: { id: team.id, code: team.code, name: team.name, class: team.class },
      total: round3(scoringMode === "PLUS" ? kpTotal - manualTotal : kpTotal + manualTotal),
      manualTotal: round3(manualTotal),
      byElement,
    }
  })
  return rankLeaderboard(rows, elements, scoringMode, tieBreak).map((row) => ({
    team: row.team,
    total: row.total,
    manualTotal: row.manualTotal,
    byElement: row.byElement,
    rank: row.rank,
    classRank: row.classRank,
  }))
}

export type RankedTeam = { team: TeamRef; rank: number; total: number; gapPrevious: number | null; gapFirst: number | null }
export type TopTeams = { overall: RankedTeam[]; classes: { name: string; teams: RankedTeam[] }[] }

export function topTeams(standings: StandingRow[], count: number, classOrder: string[]): TopTeams {
  const gaps = leaderboardGaps(standings)
  const overall = standings.filter((row) => row.rank <= count).map((row) => ({
    team: row.team, rank: row.rank, total: row.total,
    gapPrevious: gaps.get(row.team.id)?.overallPrevious ?? null,
    gapFirst: gaps.get(row.team.id)?.overallFirst ?? null,
  }))
  const classes = classOrder.flatMap((name) => {
    const rows = standings.filter((row) => row.team.class === name && row.classRank != null)
      .sort((a, b) => a.classRank! - b.classRank!)
      .filter((row) => row.classRank! <= count)
    if (rows.length === 0) return []
    return [{
      name,
      teams: rows.map((row) => ({
        team: row.team, rank: row.classRank!, total: row.total,
        gapPrevious: gaps.get(row.team.id)?.classPrevious ?? null,
        gapFirst: gaps.get(row.team.id)?.classFirst ?? null,
      })),
    }]
  })
  return { overall, classes }
}

export type CloseContest = { scope: string | null; upper: RankedTeam; lower: RankedTeam; gap: number }

// Naaberkohad poodiumil ja poodiumi piiril (1–2, 2–3, 3–4), mille vahe on piiri sees.
export function closeContests(standings: StandingRow[], maxGap: number, classOrder: string[]): CloseContest[] {
  const scopes: { scope: string | null; rows: { row: StandingRow; rank: number }[] }[] = [
    { scope: null, rows: standings.map((row) => ({ row, rank: row.rank })) },
    ...classOrder.map((name) => ({
      scope: name,
      rows: standings.filter((row) => row.team.class === name && row.classRank != null)
        .sort((a, b) => a.classRank! - b.classRank!)
        .map((row) => ({ row, rank: row.classRank! })),
    })),
  ]
  const contests: CloseContest[] = []
  for (const { scope, rows } of scopes) {
    for (let index = 0; index + 1 < rows.length && rows[index].rank <= 3; index++) {
      const upper = rows[index], lower = rows[index + 1]
      const gap = round3(Math.abs(upper.row.total - lower.row.total))
      if (gap > maxGap) continue
      const toRanked = ({ row, rank }: { row: StandingRow; rank: number }): RankedTeam => ({ team: row.team, rank, total: row.total, gapPrevious: null, gapFirst: null })
      contests.push({ scope, upper: toRanked(upper), lower: toRanked(lower), gap })
    }
  }
  return contests
}

type ElementInfo = { id: string; code: string; name: string; type: string; order: number; isCancelled: boolean }
export type ElementWinner = {
  element: { id: string; code: string; name: string }
  best: number
  overall: TeamRef[]
  classes: { name: string; best: number; teams: TeamRef[] }[]
}

function bestOf(rows: StandingRow[], elementId: string, scoringMode: ScoringMode) {
  const scored = rows.filter((row) => Number.isFinite(row.byElement[elementId]))
  if (scored.length === 0) return null
  const values = scored.map((row) => round3(row.byElement[elementId]))
  const best = scoringMode === "PLUS" ? Math.max(...values) : Math.min(...values)
  return { best, teams: scored.filter((row) => round3(row.byElement[elementId]) === best).map((row) => row.team) }
}

export function elementWinners(standings: StandingRow[], elements: ElementInfo[], scoringMode: ScoringMode, classOrder: string[]): ElementWinner[] {
  return elements
    .filter((element) => !element.isCancelled && ROUTE_ELEMENT_TYPES.includes(element.type))
    .sort((a, b) => a.order - b.order)
    .flatMap((element) => {
      const overall = bestOf(standings, element.id, scoringMode)
      if (!overall) return []
      return [{
        element: { id: element.id, code: element.code, name: element.name },
        best: overall.best,
        overall: overall.teams,
        classes: classOrder.flatMap((name) => {
          const result = bestOf(standings.filter((row) => row.team.class === name), element.id, scoringMode)
          return result ? [{ name, ...result }] : []
        }),
      }]
    })
}

// Võistluse ajal on võistkonnad eri kaugusel, seega võrreldakse ainult KP-sid,
// kus kõigil on tulemus, ja keskmist tulemust läbitud KP kohta.
export type InterimRow = {
  team: TeamRef
  officialRank: number
  scoredCount: number
  commonTotal: number | null
  commonRank: number | null
  average: number | null
  averageRank: number | null
}
export type InterimStandings = { commonElements: { id: string; code: string; name: string }[]; routeElementCount: number; rows: InterimRow[] }

function competitionRanks(values: (number | null)[], direction: number): (number | null)[] {
  const indexed = values.map((value, index) => ({ value, index })).filter((item): item is { value: number; index: number } => item.value != null)
  indexed.sort((a, b) => direction * (a.value - b.value))
  const ranks: (number | null)[] = values.map(() => null)
  indexed.forEach((item, position) => {
    ranks[item.index] = position > 0 && round3(indexed[position - 1].value) === round3(item.value)
      ? ranks[indexed[position - 1].index]
      : position + 1
  })
  return ranks
}

export function interimStandings(standings: StandingRow[], elements: ElementInfo[], scoringMode: ScoringMode): InterimStandings {
  const routeElements = elements.filter((element) => !element.isCancelled && ROUTE_ELEMENT_TYPES.includes(element.type)).sort((a, b) => a.order - b.order)
  const common = standings.length > 0
    ? routeElements.filter((element) => standings.every((row) => Number.isFinite(row.byElement[element.id])))
    : []
  const direction = scoringMode === "PLUS" ? -1 : 1
  const partial = standings.map((row) => {
    const scored = routeElements.filter((element) => Number.isFinite(row.byElement[element.id]))
    const sum = scored.reduce((total, element) => total + row.byElement[element.id], 0)
    return {
      row,
      scoredCount: scored.length,
      commonTotal: common.length ? round2(common.reduce((total, element) => total + row.byElement[element.id], 0)) : null,
      average: scored.length ? round2(sum / scored.length) : null,
    }
  })
  const commonRanks = competitionRanks(partial.map((item) => item.commonTotal), direction)
  const averageRanks = competitionRanks(partial.map((item) => item.average), direction)
  return {
    commonElements: common.map((element) => ({ id: element.id, code: element.code, name: element.name })),
    routeElementCount: routeElements.length,
    rows: partial.map((item, index) => ({
      team: item.row.team,
      officialRank: item.row.rank,
      scoredCount: item.scoredCount,
      commonTotal: item.commonTotal,
      commonRank: commonRanks[index],
      average: item.average,
      averageRank: averageRanks[index],
    })),
  }
}
