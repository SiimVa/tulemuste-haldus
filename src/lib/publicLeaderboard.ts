import { leaderboardGaps, type LeaderboardGap } from "./leaderboard"
import { applyFrozenElementStatus, applyFrozenTeamStatus, type PublicFreeze } from "./leaderboardFreeze"
import { parseTieBreakConfig, rankLeaderboard } from "./tieBreak"

export type PublicLeaderboardTeam = {
  id: string
  code: string
  name: string
  class: string | null
  isHorsDeCompetition: boolean
  hcFromElementOrder: number | null
  dnfFromElementOrder: number | null
  dnfReason: string | null
  dqFromElementOrder: number | null
  dnsFlag: boolean
}
export type PublicLeaderboardElement = { id: string; code: string; name: string; type: string; isCancelled: boolean }
export type PublicLeaderboardInput = {
  competition: { id: string; name: string; scoringMode: string; analysisAccessMode: string; tieBreakConfig: string; registrationClasses: { name: string }[] }
  teams: PublicLeaderboardTeam[]
  elements: PublicLeaderboardElement[]
  scores: { teamId: string; elementId: string; penaltyPoints: number }[]
  penalties: { teamId: string; points: number }[]
  miscEntries: { teamId: string; elementId: string; points: number; description: string; element: { type: string } }[]
  freeze: PublicFreeze | null
}
export type PublicLeaderboardRow = {
  team: PublicLeaderboardTeam
  total: number
  manualTotal: number
  // Values follow snapshot.elements order; null is a result not yet entered.
  points: (number | null)[]
  rank: number | null
  classRank: number | null
  tieBreakReason: string | null
  classTieBreakReason: string | null
  gap: LeaderboardGap | null
  memberAbandoned: boolean
  misc: Record<string, { description: string; points: number }[]>
}
export type PublicLeaderboardSnapshot = {
  schemaVersion: 1
  competition: { id: string; name: string; scoringMode: "PENALTY" | "PLUS"; analysisAvailable: boolean }
  generatedAt: string
  freezeAt: string | null
  elements: PublicLeaderboardElement[]
  classes: string[]
  ranked: PublicLeaderboardRow[]
  horsCompetition: PublicLeaderboardRow[]
  abandoned: PublicLeaderboardRow[]
}

const naturalOrder = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })

/** Build only publicly displayed data. Never spread database records into the DTO. */
export function buildPublicLeaderboard(input: PublicLeaderboardInput, now = new Date()): PublicLeaderboardSnapshot {
  const { competition, freeze } = input
  const scoringMode = competition.scoringMode === "PLUS" ? "PLUS" : "PENALTY"
  const teams = (freeze ? applyFrozenTeamStatus(input.teams, freeze.snapshot) : input.teams)
    .map(team => ({ id: team.id, code: team.code, name: team.name, class: team.class, isHorsDeCompetition: team.isHorsDeCompetition,
      hcFromElementOrder: team.hcFromElementOrder, dnfFromElementOrder: team.dnfFromElementOrder, dnfReason: team.dnfReason,
      dqFromElementOrder: team.dqFromElementOrder, dnsFlag: team.dnsFlag }))
    .sort((a, b) => naturalOrder(a.code, b.code))
  const elements = (freeze ? applyFrozenElementStatus(input.elements, freeze.snapshot) : input.elements)
    .map(element => ({ id: element.id, code: element.code, name: element.name, type: element.type, isCancelled: element.isCancelled }))
  const scores = freeze
    ? freeze.snapshot.scores.map(score => ({ teamId: score.teamId, elementId: score.elementId, penaltyPoints: score.points }))
    : input.scores
  const penalties = freeze ? freeze.snapshot.penalties : input.penalties
  const miscEntries = freeze
    ? freeze.snapshot.miscEntries.map(entry => ({ ...entry, element: { type: entry.elementType } }))
    : input.miscEntries
  const scoresByTeam = new Map<string, { total: number; byElement: Record<string, number> }>()
  for (const score of scores) {
    const group = scoresByTeam.get(score.teamId) ?? { total: 0, byElement: {} }
    group.total += score.penaltyPoints
    group.byElement[score.elementId] = score.penaltyPoints
    scoresByTeam.set(score.teamId, group)
  }
  const penaltiesByTeam = new Map<string, number>()
  for (const penalty of penalties) penaltiesByTeam.set(penalty.teamId, (penaltiesByTeam.get(penalty.teamId) ?? 0) + penalty.points)
  const miscByTeam = new Map<string, PublicLeaderboardRow["misc"]>()
  const memberAbandoned = new Set<string>()
  for (const entry of miscEntries) {
    const group = miscByTeam.get(entry.teamId) ?? {}
    ;(group[entry.elementId] ??= []).push({ description: entry.description, points: entry.points })
    miscByTeam.set(entry.teamId, group)
    if (entry.element.type === "ABANDONMENT" && entry.description !== "Kogu võistkond") memberAbandoned.add(entry.teamId)
  }
  const rows = teams.map(team => {
    const scores = scoresByTeam.get(team.id)
    const manualTotal = penaltiesByTeam.get(team.id) ?? 0
    const total = (scores?.total ?? 0) + (scoringMode === "PLUS" ? -manualTotal : manualTotal)
    return { team, total: Math.round(total * 1000) / 1000, manualTotal, byElement: scores?.byElement ?? {} }
  })
  const isHorsCompetition = (team: PublicLeaderboardTeam) => team.isHorsDeCompetition || team.hcFromElementOrder !== null
  const inCompetition = rows.filter(row => !isHorsCompetition(row.team) && row.team.dnfFromElementOrder === null)
  const ranked = rankLeaderboard(inCompetition, elements, scoringMode, parseTieBreakConfig(competition.tieBreakConfig))
  const gaps = leaderboardGaps(ranked)
  const serialize = (row: typeof rows[number], ranking?: typeof ranked[number]): PublicLeaderboardRow => ({
    team: row.team, total: row.total, manualTotal: row.manualTotal,
    points: elements.map(element => row.byElement[element.id] ?? null),
    rank: ranking?.rank ?? null, classRank: ranking?.classRank ?? null,
    tieBreakReason: ranking?.tieBreakReason ?? null, classTieBreakReason: ranking?.classTieBreakReason ?? null,
    gap: gaps.get(row.team.id) ?? null, memberAbandoned: memberAbandoned.has(row.team.id), misc: miscByTeam.get(row.team.id) ?? {},
  })
  const scoreOrder = (a: typeof rows[number], b: typeof rows[number]) => scoringMode === "PLUS" ? b.total - a.total : a.total - b.total
  return {
    schemaVersion: 1,
    competition: { id: competition.id, name: competition.name, scoringMode, analysisAvailable: competition.analysisAccessMode === "PUBLIC" && !freeze },
    generatedAt: now.toISOString(), freezeAt: freeze?.freezeAt.toISOString() ?? null,
    elements,
    classes: [...new Set([...competition.registrationClasses.map(cls => cls.name), ...teams.map(team => team.class ?? "")])].sort(naturalOrder),
    ranked: ranked.map(row => serialize(row, row)),
    horsCompetition: rows.filter(row => isHorsCompetition(row.team) && row.team.dnfFromElementOrder === null).sort(scoreOrder).map(row => serialize(row)),
    abandoned: rows.filter(row => row.team.dnfFromElementOrder !== null).sort((a, b) => a.team.name.localeCompare(b.team.name)).map(row => serialize(row)),
  }
}
