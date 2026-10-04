import { resultExceptionKind } from "./exceptionKinds"

// Üleriiklik arvestus mitme osavõistluse (eraldi võistluse) tulemustest,
// vt docs/national-ranking.md:
// 1. Iga osavõistluse keskmine läbitud KP-de arv, ümardatud matemaatiliselt.
// 2. Arvestatav KP-de arv N on osavõistluste ümardatud keskmistest väikseim.
// 3. Võistkonna tulemus = N parima KP punktid + karistused täies ulatuses.
// Arvutus kasutab osavõistlustel salvestatud punkte.

export type SeriesScoringMode = "PLUS" | "PENALTY"
export type SeriesElementRole = "KP" | "PENALTY" | "IGNORED"

// Elemendi tüübi roll. Postkastid ja käsitsi sisestatavad elemendid
// arvestusse ei lähe.
export const SERIES_ELEMENT_ROLES: Record<string, SeriesElementRole> = {
  CHECKPOINT: "KP",
  COUNTER_ACTION: "PENALTY",
  EQUIPMENT_CHECK: "PENALTY",
  LATENESS: "PENALTY",
  ABANDONMENT: "PENALTY",
  OTHER: "PENALTY",
}

export function seriesElementRole(type: string): SeriesElementRole {
  return SERIES_ELEMENT_ROLES[type] ?? "IGNORED"
}

export type SeriesElement = {
  id: string
  code: string
  name: string
  type: string
  order: number
  isCancelled: boolean
  exceptions: { label: string; kind?: string | null }[]
}

export type SeriesTeam = {
  id: string
  code: string
  name: string
  class: string | null
  isHorsDeCompetition: boolean
  hcFromElementOrder: number | null
  dnfFromElementOrder: number | null
  dnsFlag: boolean
}

export type SeriesCompetitionData = {
  id: string
  name: string
  scoringMode: SeriesScoringMode
  elements: SeriesElement[]
  teams: SeriesTeam[]
  results: { elementId: string; teamId: string; exceptionLabel: string | null }[]
  scores: { elementId: string; teamId: string; points: number }[]
  manualPenalties: { teamId: string; points: number }[]
}

export type SeriesCompetitionSummary = {
  id: string
  name: string
  kpCount: number
  // Arvestuses olevad võistkonnad ja neist need, kellel on mõni KP tulemus.
  teamCount: number
  startedTeamCount: number
  passedTotal: number
  average: number | null
  roundedAverage: number | null
}

export type SeriesKpScore = { elementId: string; code: string; points: number; counted: boolean }

export type SeriesRow = {
  competitionId: string
  competitionName: string
  team: { id: string; code: string; name: string; class: string | null }
  passedCount: number
  kpScores: SeriesKpScore[]
  kpTotal: number
  penaltyTotal: number
  total: number
  rank: number
  classRank: number | null
}

export type SeriesRanking = {
  scoringMode: SeriesScoringMode | null
  mixedScoringModes: boolean
  countedKpCount: number | null
  competitions: SeriesCompetitionSummary[]
  rows: SeriesRow[]
  classes: string[]
}

const round3 = (value: number) => Math.round(value * 1000) / 1000

// Arvestuses: mitte arvestusväline, katkestanud ega startimata.
export function isSeriesEligible(team: SeriesTeam): boolean {
  return !team.isHorsDeCompetition && team.hcFromElementOrder == null && team.dnfFromElementOrder == null && !team.dnsFlag
}

// Läbitud KP: sooritus, „Ebaõnnestus” või „Läbis, aga ei sooritanud”.
// „Ei läbinud” ja muu erand ei ole läbitud KP.
export function isPassedKpResult(exceptionLabel: string | null, exceptions: { label: string; kind?: string | null }[]): boolean {
  const kind = resultExceptionKind(exceptionLabel, exceptions)
  return kind === null || kind === "FAILED" || kind === "PASSED_NOT_DONE"
}

// Matemaatiline ümardamine: 11,5 → 12, 11,49 → 11.
export function roundHalfUp(value: number): number {
  return Math.floor(value + 0.5 + 1e-9)
}

function rankBy<T>(items: T[], total: (item: T) => number, better: (a: number, b: number) => boolean): Map<T, number> {
  const ranks = new Map<T, number>()
  for (const item of items) ranks.set(item, 1 + items.filter((other) => better(total(other), total(item))).length)
  return ranks
}

export function computeSeriesRanking(competitions: SeriesCompetitionData[]): SeriesRanking {
  const modes = [...new Set(competitions.map((competition) => competition.scoringMode))]
  const mixedScoringModes = modes.length > 1
  const scoringMode = modes.length === 1 ? modes[0] : null

  type Prepared = { competition: SeriesCompetitionData; kpElements: SeriesElement[]; started: SeriesTeam[]; passedByTeam: Map<string, number> }
  const prepared: Prepared[] = []
  const summaries: SeriesCompetitionSummary[] = []
  for (const competition of competitions) {
    const kpElements = competition.elements
      .filter((element) => !element.isCancelled && seriesElementRole(element.type) === "KP")
      .sort((a, b) => a.order - b.order)
    const kpIds = new Set(kpElements.map((element) => element.id))
    const elementById = new Map(kpElements.map((element) => [element.id, element]))
    const eligible = competition.teams.filter(isSeriesEligible)
    const passedByTeam = new Map<string, number>()
    const withResults = new Set<string>()
    for (const result of competition.results) {
      if (!kpIds.has(result.elementId)) continue
      withResults.add(result.teamId)
      if (isPassedKpResult(result.exceptionLabel, elementById.get(result.elementId)!.exceptions)) {
        passedByTeam.set(result.teamId, (passedByTeam.get(result.teamId) ?? 0) + 1)
      }
    }
    const started = eligible.filter((team) => withResults.has(team.id))
    const passedTotal = started.reduce((sum, team) => sum + (passedByTeam.get(team.id) ?? 0), 0)
    const average = started.length > 0 ? passedTotal / started.length : null
    summaries.push({
      id: competition.id,
      name: competition.name,
      kpCount: kpElements.length,
      teamCount: eligible.length,
      startedTeamCount: started.length,
      passedTotal,
      average: average === null ? null : round3(average),
      roundedAverage: average === null ? null : roundHalfUp(average),
    })
    prepared.push({ competition, kpElements, started, passedByTeam })
  }

  const rounded = summaries.map((summary) => summary.roundedAverage).filter((value): value is number => value !== null)
  const countedKpCount = rounded.length > 0 ? Math.min(...rounded) : null
  const classes = [...new Set(prepared.flatMap(({ started }) => started.map((team) => team.class).filter((value): value is string => Boolean(value))))]
    .sort((a, b) => a.localeCompare(b, "et"))

  if (mixedScoringModes || !scoringMode) {
    return { scoringMode, mixedScoringModes, countedKpCount, competitions: summaries, rows: [], classes }
  }

  const plus = scoringMode === "PLUS"
  const better = (a: number, b: number) => (plus ? a > b : a < b)
  const unranked: Omit<SeriesRow, "rank" | "classRank">[] = []
  for (const { competition, kpElements, started, passedByTeam } of prepared) {
    const roleById = new Map(competition.elements.filter((element) => !element.isCancelled).map((element) => [element.id, seriesElementRole(element.type)]))
    const scoresByTeam = new Map<string, Map<string, number>>()
    for (const score of competition.scores) {
      const teamScores = scoresByTeam.get(score.teamId) ?? new Map<string, number>()
      teamScores.set(score.elementId, score.points)
      scoresByTeam.set(score.teamId, teamScores)
    }
    const manualByTeam = new Map<string, number>()
    for (const penalty of competition.manualPenalties) manualByTeam.set(penalty.teamId, (manualByTeam.get(penalty.teamId) ?? 0) + penalty.points)

    for (const team of started) {
      const teamScores = scoresByTeam.get(team.id) ?? new Map<string, number>()
      const kpScores = kpElements
        .filter((element) => teamScores.has(element.id))
        .map((element) => ({ elementId: element.id, code: element.code, order: element.order, points: teamScores.get(element.id)! }))
      // Parimad enne; võrdsete punktide korral elementide järjekorras.
      const best = [...kpScores].sort((a, b) => (plus ? b.points - a.points : a.points - b.points) || a.order - b.order)
      const counted = new Set(best.slice(0, countedKpCount ?? best.length).map((score) => score.elementId))
      const kpTotal = best.filter((score) => counted.has(score.elementId)).reduce((sum, score) => sum + score.points, 0)
      // Karistuselementide punktid on juba õige märgiga; käsitsi karistused
      // lahutatakse (punktid) või liidetakse (karistuspunktid) nagu pingereas.
      let elementPenalties = 0
      for (const [elementId, points] of teamScores) if (roleById.get(elementId) === "PENALTY") elementPenalties += points
      const manual = manualByTeam.get(team.id) ?? 0
      const penaltyTotal = elementPenalties + (plus ? -manual : manual)
      unranked.push({
        competitionId: competition.id,
        competitionName: competition.name,
        team: { id: team.id, code: team.code, name: team.name, class: team.class },
        passedCount: passedByTeam.get(team.id) ?? 0,
        kpScores: kpScores.map(({ elementId, code, points }) => ({ elementId, code, points, counted: counted.has(elementId) })),
        kpTotal: round3(kpTotal),
        penaltyTotal: round3(penaltyTotal),
        total: round3(kpTotal + penaltyTotal),
      })
    }
  }

  // Võrdne kogusumma annab jagatud koha (1, 1, 3).
  const ranks = rankBy(unranked, (row) => row.total, better)
  const classRanks = new Map<(typeof unranked)[number], number>()
  for (const className of classes) {
    const inClass = unranked.filter((row) => row.team.class === className)
    for (const [row, rank] of rankBy(inClass, (item) => item.total, better)) classRanks.set(row, rank)
  }
  const rows: SeriesRow[] = unranked
    .map((row) => ({ ...row, rank: ranks.get(row)!, classRank: classRanks.get(row) ?? null }))
    .sort((a, b) => a.rank - b.rank || a.competitionName.localeCompare(b.competitionName, "et") || a.team.code.localeCompare(b.team.code, "et", { numeric: true }))
  return { scoringMode, mixedScoringModes, countedKpCount, competitions: summaries, rows, classes }
}
