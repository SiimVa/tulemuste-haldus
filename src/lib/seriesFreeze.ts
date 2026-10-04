import type { SeriesCompetitionData } from "./seriesRanking"

// Üleriikliku arvestuse külmutuse snapshot: avalike vaadete lähteandmed
// külmutamise hetkel. Osavõistluste endi külmutused on selles juba arvestatud.
export type SeriesFreezeSnapshot = { version: 1; takenAt: string; competitions: SeriesCompetitionData[] }

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value)
const isString = (value: unknown): value is string => typeof value === "string"
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)
const list = (value: unknown) => (Array.isArray(value) ? value.filter(isRecord) : [])
const orderOrNull = (value: unknown) => (Number.isInteger(value) ? (value as number) : null)

function parseCompetition(raw: Record<string, unknown>): SeriesCompetitionData | null {
  if (!isString(raw.id) || !isString(raw.name)) return null
  return {
    id: raw.id,
    name: raw.name,
    scoringMode: raw.scoringMode === "PENALTY" ? "PENALTY" : "PLUS",
    elements: list(raw.elements).flatMap((element) => (
      isString(element.id) && isString(element.code) && isString(element.type)
        ? [{
            id: element.id,
            code: element.code,
            name: isString(element.name) ? element.name : element.code,
            type: element.type,
            order: isNumber(element.order) ? element.order : 0,
            isCancelled: element.isCancelled === true,
            exceptions: list(element.exceptions).flatMap((item) => (isString(item.label) ? [{ label: item.label, kind: isString(item.kind) ? item.kind : null }] : [])),
            maxValue: isNumber(element.maxValue) ? element.maxValue : null,
          }]
        : [])),
    teams: list(raw.teams).flatMap((team) => (
      isString(team.id) && isString(team.code) && isString(team.name)
        ? [{
            id: team.id,
            code: team.code,
            name: team.name,
            class: isString(team.class) ? team.class : null,
            isHorsDeCompetition: team.isHorsDeCompetition === true,
            hcFromElementOrder: orderOrNull(team.hcFromElementOrder),
            dnfFromElementOrder: orderOrNull(team.dnfFromElementOrder),
            dnsFlag: team.dnsFlag === true,
          }]
        : [])),
    results: list(raw.results).flatMap((result) => (
      isString(result.elementId) && isString(result.teamId)
        ? [{ elementId: result.elementId, teamId: result.teamId, exceptionLabel: isString(result.exceptionLabel) ? result.exceptionLabel : null }]
        : [])),
    scores: list(raw.scores).flatMap((score) => (
      isString(score.elementId) && isString(score.teamId) && isNumber(score.points) ? [{ elementId: score.elementId, teamId: score.teamId, points: score.points }] : [])),
    manualPenalties: list(raw.manualPenalties).flatMap((penalty) => (
      isString(penalty.teamId) && isNumber(penalty.points)
        ? [{ teamId: penalty.teamId, points: penalty.points, description: isString(penalty.description) ? penalty.description : "" }]
        : [])),
  }
}

// Vigase snapshot'i korral näidatakse tühja seisu, mitte jooksvaid tulemusi.
export function parseSeriesFreezeSnapshot(value: unknown, fallbackTakenAt: Date): SeriesFreezeSnapshot {
  if (!isRecord(value) || value.version !== 1) return { version: 1, takenAt: fallbackTakenAt.toISOString(), competitions: [] }
  return {
    version: 1,
    takenAt: isString(value.takenAt) ? value.takenAt : fallbackTakenAt.toISOString(),
    competitions: list(value.competitions).flatMap((competition) => parseCompetition(competition) ?? []),
  }
}
