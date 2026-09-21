export type EstimateTarget = { id: string; label: string; correct: number | null }
export type ErrorBand = { through: number; points: number }
export type EstimationConfig = {
  targets: EstimateTarget[]
  bands: ErrorBand[]
  overflowPoints: number
  result: "POINTS" | "ERROR_PERCENT" | "ERROR_ABSOLUTE"
  unit: string
}
export const defaultEstimation: EstimationConfig = {
  targets: [], bands: [{ through: 5, points: 3 }, { through: 15, points: 2 }, { through: 30, points: 1 }],
  overflowPoints: 0, result: "POINTS", unit: "m",
}
export function readEstimation(meta?: string | null): EstimationConfig {
  try { return JSON.parse(meta || "{}").estimation ?? defaultEstimation } catch { return defaultEstimation }
}
export function parseEstimates(value: unknown): Record<string, string> {
  try {
    const parsed = JSON.parse(String(value ?? "{}"))
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed).filter(([, v]) => typeof v === "string" || typeof v === "number").map(([k, v]) => [k, String(v)]))
  } catch { return {} }
}
export function estimateNumber(value: unknown): number {
  const raw = String(value ?? "").trim().replace(",", ".")
  return /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw) ? Number(raw) : NaN
}
export function validateEstimation(config: EstimationConfig): string | null {
  if (!config || !Array.isArray(config.targets) || config.targets.length < 1 || config.targets.length > 100 || config.targets.some(t => !t || typeof t.id !== "string" || !t.id.trim() || typeof t.label !== "string" || !t.label.trim() || (t.correct !== null && (!Number.isFinite(t.correct) || t.correct <= 0))) || new Set(config.targets.map(t => t.id)).size !== config.targets.length) return "Sisesta 1–100 nimetatud õiget kaugust. Määratud õige kaugus peab olema suurem kui 0."
  if (new Set(config.targets.map(t => t.label.trim().toLowerCase())).size !== config.targets.length) return "Kauguste nimetused peavad olema erinevad."
  if (!Array.isArray(config.bands) || !config.bands.length || config.bands.length > 100 || config.bands.some((b, i, bands) => !b || !Number.isFinite(b.through) || b.through < 0 || !Number.isFinite(b.points) || (i > 0 && b.through <= bands[i - 1].through)) || !Number.isFinite(config.overflowPoints)) return "Veaprotsendi piirid peavad olema kasvavas järjekorras ja punktid arvud."
  if (!["POINTS", "ERROR_PERCENT", "ERROR_ABSOLUTE"].includes(config.result) || typeof config.unit !== "string" || config.unit.length > 20) return "Vali korrektne tulemus ja mõõtühik."
  return null
}
export function calculateEstimation(config: EstimationConfig, value: unknown) {
  const guesses = parseEstimates(value)
  const rows = config.targets.map(target => {
    const guess = estimateNumber(guesses[target.id])
    if (!Number.isFinite(guess) || target.correct === null) return { ...target, guess: null, error: null, errorPercent: null, points: null }
    const error = Math.abs(guess - target.correct)
    const errorPercent = error / target.correct * 100
    // Compare unrounded values, allowing only floating-point representation noise.
    const points = config.bands.find(b => errorPercent <= b.through + Number.EPSILON * 16 * Math.max(1, b.through))?.points ?? config.overflowPoints
    return { ...target, guess, error, errorPercent, points }
  })
  const points = rows.reduce((sum, r) => sum + (r.points ?? 0), 0)
  const error = rows.reduce((sum, r) => sum + (r.error ?? 0), 0)
  const errorPercent = rows.reduce((sum, r) => sum + (r.errorPercent ?? 0), 0)
  const complete = rows.length > 0 && rows.every(r => r.points !== null) && [points, error, errorPercent].every(Number.isFinite)
  const result = config.result === "ERROR_ABSOLUTE" ? error : config.result === "ERROR_PERCENT" ? errorPercent : points
  return { rows, points, error, errorPercent, complete, result: complete ? result : undefined }
}
export const formatEstimate = (value: number) => value.toLocaleString("et-EE", { minimumFractionDigits: 1, maximumFractionDigits: 2 })
