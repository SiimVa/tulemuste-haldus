import { leaderboardGaps, type LeaderboardGap } from "./leaderboard"
import { isPassedKpResult, seriesElementRole, type SeriesCompetitionData, type SeriesElement, type SeriesRanking, type SeriesRow } from "./seriesRanking"

// Üleriikliku arvestuse ülevaate ja analüüsi arvutused pingerea ja
// osavõistluste andmete põhjal (vt docs/national-ranking.md).

const round2 = (value: number) => Math.round(value * 100) / 100
const round3 = (value: number) => Math.round(value * 1000) / 1000
const mean = (values: number[]) => (values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null)
const compareCodes = (a: string, b: string) => a.localeCompare(b, "et", { numeric: true })
const kpElementsOf = (competition: SeriesCompetitionData) => competition.elements
  .filter((element) => !element.isCancelled && seriesElementRole(element.type) === "KP")
  .sort((a, b) => a.order - b.order)

// Vahed eelmise ja esimesega; read on juba kohtade järjekorras.
export function seriesGaps(ranking: SeriesRanking): Record<string, LeaderboardGap> {
  return Object.fromEntries(leaderboardGaps(ranking.rows))
}

// Kõigi osavõistluste KP tähised loomulikus järjekorras (KP2 enne KP10).
export function seriesKpCodes(ranking: SeriesRanking): string[] {
  return [...new Set(ranking.rows.flatMap((row) => row.kpScores.map((score) => score.code)))].sort(compareCodes)
}

export type CompetitionComparisonRow = {
  id: string
  name: string
  teamCount: number
  average: number | null
  roundedAverage: number | null
  averageTotal: number | null
  bestTotal: number | null
  best: { name: string; class: string | null } | null
  isMinimum: boolean
}

export function competitionComparison(ranking: SeriesRanking): CompetitionComparisonRow[] {
  return ranking.competitions.map((summary) => {
    const rows = ranking.rows.filter((row) => row.competitionId === summary.id)
    const average = mean(rows.map((row) => row.total))
    return {
      id: summary.id,
      name: summary.name,
      teamCount: rows.length,
      average: summary.average,
      roundedAverage: summary.roundedAverage,
      averageTotal: average === null ? null : round2(average),
      bestTotal: rows[0]?.total ?? null,
      best: rows[0] ? { name: rows[0].team.name, class: rows[0].team.class } : null,
      isMinimum: summary.roundedAverage !== null && summary.roundedAverage === ranking.countedKpCount,
    }
  })
}

export type TopTeamEntry = {
  rank: number
  team: SeriesRow["team"]
  competitionName: string
  total: number
  gapToPrevious: number | null
  gapToFirst: number | null
}
export type TopTeamsGroup = { className: string | null; entries: TopTeamEntry[] }

// Üldarvestuse ja iga klassi esimesed; jagatud kohtade korral võib ridu olla rohkem.
export function topTeams(ranking: SeriesRanking, topCount: number): TopTeamsGroup[] {
  const gaps = leaderboardGaps(ranking.rows)
  const overall = ranking.rows.filter((row) => row.rank <= topCount).map((row) => ({
    rank: row.rank, team: row.team, competitionName: row.competitionName, total: row.total,
    gapToPrevious: gaps.get(row.team.id)?.overallPrevious ?? null, gapToFirst: gaps.get(row.team.id)?.overallFirst ?? null,
  }))
  const byClass = ranking.classes.map((className) => ({
    className,
    entries: ranking.rows
      .filter((row) => row.team.class === className && row.classRank !== null && row.classRank <= topCount)
      .sort((a, b) => (a.classRank ?? 0) - (b.classRank ?? 0))
      .map((row) => ({
        rank: row.classRank ?? 0, team: row.team, competitionName: row.competitionName, total: row.total,
        gapToPrevious: gaps.get(row.team.id)?.classPrevious ?? null, gapToFirst: gaps.get(row.team.id)?.classFirst ?? null,
      })),
  }))
  return [{ className: null, entries: overall }, ...byClass]
}

export type ClassComparisonRow = {
  className: string
  teamCount: number
  averageTotal: number | null
  bestTotal: number | null
  // Osavõistluste järjekorras; null, kui klassi võistkondi seal polnud.
  byCompetition: (number | null)[]
}

export function classComparison(ranking: SeriesRanking): { competitions: { id: string; name: string }[]; rows: ClassComparisonRow[] } {
  const competitions = ranking.competitions.map(({ id, name }) => ({ id, name }))
  const rows = ranking.classes.map((className) => {
    const inClass = ranking.rows.filter((row) => row.team.class === className)
    const average = mean(inClass.map((row) => row.total))
    return {
      className,
      teamCount: inClass.length,
      averageTotal: average === null ? null : round2(average),
      bestTotal: inClass[0]?.total ?? null,
      byCompetition: competitions.map((competition) => {
        const value = mean(inClass.filter((row) => row.competitionId === competition.id).map((row) => row.total))
        return value === null ? null : round2(value)
      }),
    }
  })
  return { competitions, rows }
}

export type CloseContest = {
  className: string | null
  upper: { rank: number; team: SeriesRow["team"]; competitionName: string; total: number }
  lower: { rank: number; team: SeriesRow["team"]; competitionName: string; total: number }
  gap: number
}

// Poodiumikohad (1–2, 2–3, 3–4), kus vahe naabriga on kuni closeGap.
export function closeContests(ranking: SeriesRanking, closeGap: number): CloseContest[] {
  const groups: { className: string | null; rows: { rank: number; row: SeriesRow }[] }[] = [
    { className: null, rows: ranking.rows.map((row) => ({ rank: row.rank, row })) },
    ...ranking.classes.map((className) => ({
      className,
      rows: ranking.rows
        .filter((row) => row.team.class === className && row.classRank !== null)
        .map((row) => ({ rank: row.classRank ?? 0, row }))
        .sort((a, b) => a.rank - b.rank),
    })),
  ]
  const contests: CloseContest[] = []
  for (const group of groups) {
    for (let index = 0; index + 1 < group.rows.length && group.rows[index].rank <= 3; index++) {
      const upper = group.rows[index]
      const lower = group.rows[index + 1]
      const gap = round3(Math.abs(upper.row.total - lower.row.total))
      if (gap > closeGap) continue
      const side = ({ rank, row }: { rank: number; row: SeriesRow }) => ({ rank, team: row.team, competitionName: row.competitionName, total: row.total })
      contests.push({ className: group.className, upper: side(upper), lower: side(lower), gap })
    }
  }
  return contests
}

export type KpComparisonCell = {
  competitionId: string
  elementId: string | null
  averagePoints: number | null
  averagePercent: number | null
  passedPercent: number | null
  teamCount: number
}
export type KpComparisonRow = { code: string; name: string; cells: KpComparisonCell[]; spread: number | null; hardestCompetitionId: string | null }

// Sama tähisega KP-d osavõistlustes: keskmine tulemus ja läbimise protsent
// pingereas olevate võistkondade hulgas.
export function kpComparison(data: SeriesCompetitionData[], ranking: SeriesRanking): { competitions: { id: string; name: string }[]; rows: KpComparisonRow[] } {
  const plus = ranking.scoringMode !== "PENALTY"
  const competitions = data.map(({ id, name }) => ({ id, name }))
  const rankedByCompetition = new Map<string, Set<string>>()
  for (const row of ranking.rows) {
    const teams = rankedByCompetition.get(row.competitionId) ?? new Set<string>()
    teams.add(row.team.id)
    rankedByCompetition.set(row.competitionId, teams)
  }
  const names = new Map<string, string>()
  for (const competition of data) for (const element of kpElementsOf(competition)) if (!names.has(element.code)) names.set(element.code, element.name)

  const rows = [...names.keys()].sort(compareCodes).map((code) => {
    const cells: KpComparisonCell[] = data.map((competition) => {
      const element = kpElementsOf(competition).find((item) => item.code === code)
      const teams = rankedByCompetition.get(competition.id) ?? new Set<string>()
      if (!element || teams.size === 0) return { competitionId: competition.id, elementId: element?.id ?? null, averagePoints: null, averagePercent: null, passedPercent: null, teamCount: teams.size }
      const points = competition.scores.filter((score) => score.elementId === element.id && teams.has(score.teamId)).map((score) => score.points)
      const passed = competition.results.filter((result) => result.elementId === element.id && teams.has(result.teamId) && isPassedKpResult(result.exceptionLabel, element.exceptions)).length
      const average = mean(points)
      return {
        competitionId: competition.id,
        elementId: element.id,
        averagePoints: average === null ? null : round2(average),
        averagePercent: average !== null && element.maxValue ? round2((average / element.maxValue) * 100) : null,
        passedPercent: round2((passed / teams.size) * 100),
        teamCount: teams.size,
      }
    })
    const measured = cells.filter((cell) => cell.averagePoints !== null)
    // Eri maksimumiga KP-sid võrreldakse protsendina maksimumist.
    const usePercent = measured.every((cell) => cell.averagePercent !== null)
    const metric = (cell: KpComparisonCell) => (usePercent ? cell.averagePercent! : cell.averagePoints!)
    const metrics = measured.map(metric)
    const hasSpread = metrics.length > 1 && Math.max(...metrics) !== Math.min(...metrics)
    const hardest = hasSpread
      ? measured.reduce((a, b) => (plus ? (metric(b) < metric(a) ? b : a) : (metric(b) > metric(a) ? b : a)))
      : null
    const points = measured.map((cell) => cell.averagePoints!)
    return {
      code,
      name: names.get(code) ?? code,
      cells,
      spread: points.length > 1 ? round2(Math.max(...points) - Math.min(...points)) : null,
      hardestCompetitionId: hardest?.competitionId ?? null,
    }
  })
  return { competitions, rows }
}

export type TeamKp = {
  code: string
  name: string
  points: number | null
  counted: boolean
  passed: boolean
  exceptionLabel: string | null
  competitionAverage: number | null
}
export type TeamAnalysis = {
  row: SeriesRow
  teamCount: number
  classTeamCount: number
  beatenPercent: number | null
  gap: LeaderboardGap | null
  kps: TeamKp[]
  penalties: { label: string; points: number }[]
}

export function teamAnalysis(data: SeriesCompetitionData[], ranking: SeriesRanking, teamId: string): TeamAnalysis | null {
  const row = ranking.rows.find((item) => item.team.id === teamId)
  const competition = row ? data.find((item) => item.id === row.competitionId) : undefined
  if (!row || !competition) return null
  const plus = ranking.scoringMode !== "PENALTY"
  const ranked = new Set(ranking.rows.filter((item) => item.competitionId === competition.id).map((item) => item.team.id))
  const counted = new Map(row.kpScores.map((score) => [score.elementId, score.counted]))
  const scoreOf = (element: SeriesElement, team: string) => competition.scores.find((score) => score.elementId === element.id && score.teamId === team)

  const kps = kpElementsOf(competition).map((element) => {
    const result = competition.results.find((item) => item.elementId === element.id && item.teamId === teamId)
    const average = mean(competition.scores.filter((score) => score.elementId === element.id && ranked.has(score.teamId)).map((score) => score.points))
    return {
      code: element.code,
      name: element.name,
      points: scoreOf(element, teamId)?.points ?? null,
      counted: counted.get(element.id) ?? false,
      passed: result ? isPassedKpResult(result.exceptionLabel, element.exceptions) : false,
      exceptionLabel: result?.exceptionLabel ?? null,
      competitionAverage: average === null ? null : round2(average),
    }
  })

  const penalties = competition.elements
    .filter((element) => !element.isCancelled && seriesElementRole(element.type) === "PENALTY")
    .sort((a, b) => a.order - b.order)
    .flatMap((element) => {
      const points = scoreOf(element, teamId)?.points ?? 0
      return points === 0 ? [] : [{ label: `${element.code} · ${element.name}`, points }]
    })
  for (const penalty of competition.manualPenalties.filter((item) => item.teamId === teamId)) {
    penalties.push({ label: penalty.description?.trim() || "Käsitsi karistus", points: plus ? -penalty.points : penalty.points })
  }

  const worse = ranking.rows.filter((item) => (plus ? item.total < row.total : item.total > row.total)).length
  return {
    row,
    teamCount: ranking.rows.length,
    classTeamCount: row.team.class ? ranking.rows.filter((item) => item.team.class === row.team.class).length : 0,
    beatenPercent: ranking.rows.length > 1 ? Math.round((worse / (ranking.rows.length - 1)) * 100) : null,
    gap: leaderboardGaps(ranking.rows).get(teamId) ?? null,
    kps,
    penalties,
  }
}
