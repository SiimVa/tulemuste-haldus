import { computeAllScores, type ComputeResult } from "./scoreCompute"
import { isSeriesEligible, type SeriesCompetitionData } from "./seriesRanking"
import { scopeKeyFor, TEAM_COUNT_SCOPES } from "./classGroups"

import type { SeriesScoringSource } from "./seriesScoringSource"
export type { SeriesScoringSource } from "./seriesScoringSource"

export type SeriesScoringInput = { data: SeriesCompetitionData; source?: SeriesScoringSource }

// Arvutab KP-d ühise toorandmete kogumi pealt, OV punkte andmebaasis muutmata.
// Eri seadistuste korral kasutatakse iga OV enda reegleid; erinevused on
// administraatori reeglite kontrollis nähtavad.
export function recomputeSeriesKpScores(inputs: SeriesScoringInput[]): SeriesCompetitionData[] {
  if (new Set(inputs.map(({ data }) => data.scoringMode)).size > 1) return inputs.map(({ data }) => data)
  const pooled = new Map<string, ComputeResult[]>()
  const teams = inputs.flatMap(({ data }) => data.teams.filter(isSeriesEligible))
  for (const { data, source } of inputs) {
    if (!source) continue // Vanal külmutusel pole taastatavaid toorandmeid.
    const teamById = new Map(data.teams.filter(isSeriesEligible).map((team) => [team.id, team]))
    const elements = new Map(source.elements.filter((element) => !element.isCancelled && element.type === "CHECKPOINT").map((element) => [element.id, element]))
    for (const result of source.results) {
      const element = elements.get(result.elementId)
      const team = teamById.get(result.teamId)
      if (!element || !team) continue
      const group = pooled.get(element.code) ?? []
      group.push({ ...result, team })
      pooled.set(element.code, group)
    }
  }
  return inputs.map(({ data, source }) => {
    if (!source) return data
    const groups = source.config.classGroups ?? []
    const registeredCounts = new Map<string, number>()
    for (const scope of TEAM_COUNT_SCOPES) for (const team of teams) {
      const key = scopeKeyFor(scope, team.class, groups)
      registeredCounts.set(key, (registeredCounts.get(key) ?? 0) + 1)
    }
    const kpIds = new Set(source.elements.filter((element) => element.type === "CHECKPOINT").map((element) => element.id))
    const scores = data.scores.filter((score) => !kpIds.has(score.elementId))
    const ownTeams = new Set(data.teams.map((team) => team.id))
    for (const element of source.elements) {
      if (element.type !== "CHECKPOINT" || element.isCancelled) continue
      const results = (pooled.get(element.code) ?? []).map((result) => ({ ...result, elementId: element.id }))
      const calculated = computeAllScores([element], results, { ...source.config, registeredCounts }).get(element.id)!
      for (const [teamId, points] of calculated) if (ownTeams.has(teamId)) scores.push({ elementId: element.id, teamId, points })
    }
    return { ...data, scores }
  })
}
