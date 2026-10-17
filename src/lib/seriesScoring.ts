import { computeAllScores, type ComputeResult } from "./scoreCompute"
import { isSeriesEligible, type SeriesCompetitionData } from "./seriesRanking"
import { scopeKeyFor, TEAM_COUNT_SCOPES } from "./classGroups"
import { readPointMeta, type PointField } from "./pointFields"

import type { SeriesScoringSource } from "./seriesScoringSource"
export type { SeriesScoringSource } from "./seriesScoringSource"

export type SeriesScoringInput = { data: SeriesCompetitionData; source?: SeriesScoringSource }

// Sama vastuse tehnilised ID-d võivad eri OV-des erineda. Enne siht-KP
// reeglite rakendamist seome valiku tema sisu järgi siht-KP valikuga.
function translateChoices(values: string, sourceFields: PointField[], targetFields: PointField[]): string {
  let answers: Record<string, unknown>
  try { answers = JSON.parse(values) } catch { return values }
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return values
  for (const source of sourceFields) {
    if (source.type !== "POINTS_SELECT" || answers[source.name] == null) continue
    const target = targetFields.find((field) => field.name === source.name && field.type === "POINTS_SELECT")
    if (!target) continue
    const selected = readPointMeta(source.meta).options?.find((option) => option.id === String(answers[source.name]))
    if (!selected) continue
    const equivalent = readPointMeta(target.meta).options?.find((option) => option.label === selected.label && option.points === selected.points)
    if (equivalent) answers[source.name] = equivalent.id
  }
  return JSON.stringify(answers)
}

// Arvutab KP-d ühise toorandmete kogumi pealt, OV punkte andmebaasis muutmata.
// Eri seadistuste korral kasutatakse iga OV enda reegleid; erinevused on
// administraatori reeglite kontrollis nähtavad.
export function recomputeSeriesKpScores(inputs: SeriesScoringInput[]): SeriesCompetitionData[] {
  if (new Set(inputs.map(({ data }) => data.scoringMode)).size > 1) return inputs.map(({ data }) => data)
  const pooled = new Map<string, { result: ComputeResult; fields: PointField[] }[]>()
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
      group.push({ result: { ...result, team }, fields: [...element.fields, ...element.sections.flatMap((section) => section.fields)] })
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
      const targetFields = [...element.fields, ...element.sections.flatMap((section) => section.fields)]
      const results = (pooled.get(element.code) ?? []).map(({ result, fields }) => ({
        ...result, elementId: element.id, values: translateChoices(result.values, fields, targetFields),
      }))
      const calculated = computeAllScores([element], results, { ...source.config, registeredCounts }).get(element.id)!
      for (const [teamId, points] of calculated) if (ownTeams.has(teamId)) scores.push({ elementId: element.id, teamId, points })
    }
    return { ...data, scores }
  })
}
