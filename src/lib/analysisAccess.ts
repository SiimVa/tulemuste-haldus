export const ANALYSIS_ACCESS_MODES = ["PUBLIC", "LINK_ONLY", "PRIVATE"] as const

export type AnalysisAccessMode = (typeof ANALYSIS_ACCESS_MODES)[number]

export function isAnalysisAccessMode(
  value: unknown
): value is AnalysisAccessMode {
  return (
    typeof value === "string" &&
    ANALYSIS_ACCESS_MODES.includes(value as AnalysisAccessMode)
  )
}

export function isAnalysisLinkToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value)
}
