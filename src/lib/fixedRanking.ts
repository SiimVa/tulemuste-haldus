import { isTeamCountScope, type TeamCountScope } from "./classGroups"

export const FIXED_RANKING_MODES = ["PARTIAL", "MANUAL_ALL", "REGISTERED_COUNT"] as const

export type FixedRankingMode = (typeof FIXED_RANKING_MODES)[number]

export type FixedRankingParams = {
  higherIsBetter: boolean
  fixedRankingMode: FixedRankingMode
  fixedPoints: number[]
  minPoints: number
  teamCountScope: TeamCountScope
  teamCountBase: number
  teamCountStep: number
}

export function isFixedRankingMode(value: unknown): value is FixedRankingMode {
  return typeof value === "string" && (FIXED_RANKING_MODES as readonly string[]).includes(value)
}

function finiteNumber(value: unknown, fallback: number) {
  const number = typeof value === "number" ? value : Number(value)
  return Number.isFinite(number) ? number : fallback
}

export function nonNegativeFiniteNumber(value: unknown, fallback: number) {
  return Math.max(0, finiteNumber(value, fallback))
}

export function parseFixedPointValues(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((point) => typeof point !== "string" || point.trim() !== "")
    .map((point) => Number(point))
    .filter((point) => Number.isFinite(point) && point >= 0)
}

/**
 * Parses both the current fixed-ranking configuration and the legacy PR40 shape.
 * Keeping pointsFromTeamCount readable means existing elements continue to work
 * after the richer mode selector is deployed.
 */
export function parseFixedRankingParams(value: unknown): FixedRankingParams {
  let input: Record<string, unknown> = {}
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value)
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) input = parsed
    } catch {}
  } else if (value && typeof value === "object" && !Array.isArray(value)) {
    input = value as Record<string, unknown>
  }

  const legacyTeamCount = input.pointsFromTeamCount === true
  const fixedRankingMode = isFixedRankingMode(input.fixedRankingMode)
    ? input.fixedRankingMode
    : legacyTeamCount
      ? "REGISTERED_COUNT"
      : "PARTIAL"

  const fixedPoints = parseFixedPointValues(input.fixedPoints)

  return {
    higherIsBetter: input.higherIsBetter === true,
    fixedRankingMode,
    fixedPoints,
    minPoints: nonNegativeFiniteNumber(input.minPoints, 0),
    teamCountScope: isTeamCountScope(input.teamCountScope) ? input.teamCountScope : "ALL",
    teamCountBase: nonNegativeFiniteNumber(input.teamCountBase, legacyTeamCount ? 1 : 0),
    teamCountStep: nonNegativeFiniteNumber(input.teamCountStep, 1),
  }
}

export function fixedRankingParamsForStorage(params: FixedRankingParams) {
  return {
    higherIsBetter: params.higherIsBetter,
    fixedRankingMode: params.fixedRankingMode,
    fixedPoints: params.fixedRankingMode === "REGISTERED_COUNT" ? [] : params.fixedPoints,
    minPoints: params.minPoints,
    teamCountScope: params.teamCountScope,
    teamCountBase: params.teamCountBase,
    teamCountStep: params.teamCountStep,
    // Tahaühilduvus koodiga, mis loeb veel PR40 välja.
    pointsFromTeamCount: params.fixedRankingMode === "REGISTERED_COUNT",
  }
}

export function registeredCountPoints(
  rank: number,
  teamCount: number,
  scoringMode: "PENALTY" | "PLUS",
  base: number,
  step: number
) {
  const count = Math.max(1, Math.round(teamCount))
  const cappedRank = Math.min(Math.max(1, Math.round(rank)), count)
  const offset = scoringMode === "PLUS" ? count - cappedRank : cappedRank - 1
  return Math.round((base + offset * step) * 1000) / 1000
}
