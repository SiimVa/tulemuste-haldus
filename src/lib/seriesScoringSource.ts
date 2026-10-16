import type { ComputeElement, ComputeResult, ComputeConfig } from "./scoreCompute"

// JSON-serialiseeritavad lähteandmed säilitatakse ka OV avaliku külmutuse juures.
export type SeriesScoringSource = {
  elements: (ComputeElement & { code: string; name?: string })[]
  results: Omit<ComputeResult, "team">[]
  config: Omit<ComputeConfig, "registeredCounts">
}

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value)
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value)
const nullableNumber = (value: unknown) => value === null || number(value)
const nullableString = (value: unknown) => value === null || typeof value === "string"
const method = (value: unknown): boolean => value === null || (record(value) && typeof value.type === "string" && typeof value.params === "string" && nullableString(value.customFormula))
const fields = (value: unknown): boolean => Array.isArray(value) && value.every((field) => record(field) && typeof field.name === "string" && typeof field.type === "string" && number(field.order) && nullableNumber(field.rankingPriority) && nullableString(field.formula) && nullableString(field.meta))

export function parseSeriesScoringSource(value: unknown): SeriesScoringSource | undefined {
  if (!record(value) || !record(value.config) || !["PLUS", "PENALTY"].includes(String(value.config.scoringMode)) || !number(value.config.defaultKPMaxValue) || !number(value.config.defaultPKMaxValue)) return undefined
  if (value.config.classGroups !== undefined && (!Array.isArray(value.config.classGroups) || !value.config.classGroups.every((group) => record(group) && typeof group.name === "string" && Array.isArray(group.classes) && group.classes.every((cls) => typeof cls === "string")))) return undefined
  if (!Array.isArray(value.elements) || !value.elements.every((element) => record(element)
    && typeof element.id === "string" && typeof element.code === "string" && element.type === "CHECKPOINT"
    && number(element.order) && typeof element.isCancelled === "boolean" && nullableNumber(element.maxValue)
    && method(element.calcMethod) && fields(element.fields)
    && Array.isArray(element.sections) && element.sections.every((section) => record(section) && nullableNumber(section.maxValue) && method(section.calcMethod) && fields(section.fields))
    && Array.isArray(element.miscEntries) && element.miscEntries.every((entry) => record(entry) && typeof entry.teamId === "string" && number(entry.points))
    && Array.isArray(element.exceptions) && element.exceptions.every((exception) => record(exception) && typeof exception.label === "string"))) return undefined
  if (!Array.isArray(value.results) || !value.results.every((result) => record(result) && typeof result.elementId === "string" && typeof result.teamId === "string" && typeof result.values === "string" && nullableString(result.exceptionLabel) && nullableNumber(result.exceptionPenalty))) return undefined
  return value as SeriesScoringSource
}

