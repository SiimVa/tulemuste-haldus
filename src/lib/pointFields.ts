import { calculateEstimation, formatEstimate, readEstimation, validateEstimation } from "./estimation"
/** Point-valued inputs retain the judge's original choice/duration in Result.values. */
export type PointOption = { id: string; label: string; points: number }
export type TimeBand = { through: number; points: number }
export type PointFieldMeta = {
  options?: PointOption[]
  timeBands?: TimeBand[]
  overflowPoints?: number
  timeTieBreak?: boolean
  [key: string]: unknown
}
export type PointField = { name: string; label?: string; type: string; meta?: string | null }
export function readPointMeta(raw?: string | null): PointFieldMeta {
  try { const v = JSON.parse(raw || "{}"); return v && typeof v === "object" && !Array.isArray(v) ? v : {} } catch { return {} }
}
export function durationSeconds(value: unknown): number {
  const raw = String(value ?? "").trim()
  if (!/^\d+:\d{1,2}(:\d{1,2})?$/.test(raw)) return NaN
  const parts = raw.split(":").map(Number)
  if (parts.at(-1)! > 59 || (parts.length === 3 && parts[1] > 59)) return NaN
  return parts.reduce((sum, part) => sum * 60 + part, 0)
}
export function durationLabel(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}
export function pointFieldValue(field: PointField, value: unknown): number | undefined {
  if (value == null || String(value).trim() === "") return undefined
  const meta = readPointMeta(field.meta)
  if (field.type === "ESTIMATION") return calculateEstimation(readEstimation(field.meta), value).result
  if (field.type === "POINTS_SELECT") return meta.options?.find(o => o.id === String(value))?.points
  if (field.type === "TIME_POINTS") {
    const seconds = durationSeconds(value)
    if (!Number.isFinite(seconds)) return undefined
    return meta.timeBands?.find(b => seconds <= b.through)?.points ?? meta.overflowPoints ?? 0
  }
  return undefined
}
export function pointFieldLabel(field: PointField, value: unknown): string {
  if (value == null || String(value).trim() === "") return "–"
  if (field.type === "ESTIMATION") {
    const config = readEstimation(field.meta)
    const result = calculateEstimation(config, value)
    const details = result.rows.map(r => `${r.label}: ${r.guess === null ? "–" : formatEstimate(r.guess)} ${config.unit}`).join("; ")
    return result.complete ? `${details} | ${formatEstimate(result.points)} p · eksimus ${formatEstimate(result.error)} ${config.unit} · ${formatEstimate(result.errorPercent)}%` : `${details} | Pakkumised pole täielikud`
  }
  const points = pointFieldValue(field, value)
  if (field.type === "POINTS_SELECT") return `${readPointMeta(field.meta).options?.find(o => o.id === String(value))?.label ?? value} (${points ?? "?"} p)`
  if (field.type === "TIME_POINTS") return `${value} (${points ?? "?"} p)`
  return String(value)
}
export function validatePointFields(fields: PointField[]): string | null {
  for (const field of fields) {
    if (field.type === "ESTIMATION") {
      const error = validateEstimation(readEstimation(field.meta))
      if (error) return `${field.label || field.name}: ${error}`
    }
    const m = readPointMeta(field.meta)
    if (field.type === "POINTS_SELECT") {
      if (!Array.isArray(m.options) || !m.options.length || m.options.length > 100 || m.options.some(o => !o || typeof o.id !== "string" || !o.id.trim() || typeof o.label !== "string" || !o.label.trim() || !Number.isFinite(o.points)) || new Set(m.options.map(o => o.id)).size !== m.options.length) return `${field.label || field.name}: määra valikute nimetused ja punktid (kuni 100 valikut).`
    }
    if (field.type === "TIME_POINTS") {
      if (!Array.isArray(m.timeBands) || !m.timeBands.length || m.timeBands.length > 100 || m.timeBands.some((b, i, bands) => !b || !Number.isSafeInteger(b.through) || b.through < 0 || !Number.isFinite(b.points) || (i > 0 && b.through <= bands[i - 1].through)) || !Number.isFinite(m.overflowPoints) || (m.timeTieBreak !== undefined && typeof m.timeTieBreak !== "boolean")) return `${field.label || field.name}: ajapiirid peavad olema kasvavas järjekorras ja punktid arvud.`
    }
  }
  return null
}
/** Called only after comparing element points. Never used by competition standings. */
export function compareElementTimes(fields: PointField[], a: Record<string, unknown>, b: Record<string, unknown>): number {
  for (const field of fields) {
    if (field.type !== "TIME_POINTS" || !readPointMeta(field.meta).timeTieBreak) continue
    const av = durationSeconds(a[field.name]), bv = durationSeconds(b[field.name])
    if (!Number.isFinite(av) && !Number.isFinite(bv)) continue
    if (!Number.isFinite(av)) return 1
    if (!Number.isFinite(bv)) return -1
    if (av !== bv) return av - bv
  }
  return 0
}
export const exampleTimeMeta: PointFieldMeta = {
  timeBands: Array.from({ length: 15 }, (_, i) => ({ through: 255 + i * 16, points: 15 - i })),
  overflowPoints: 0,
  timeTieBreak: true,
}
export function examplePointFields() {
  const common = { rankingPriority: null, formula: "", displayAsTime: false, validation: { required: true }, fieldHigherIsBetter: null }
  return [
    { ...common, name: "nato", label: "NATO tähestiku kasutamine", type: "POINTS_SELECT", meta: JSON.stringify({ options: [{ id: "yes", label: "Kasutab", points: 2 }, { id: "partly", label: "Kasutab osaliselt", points: 1 }, { id: "no", label: "Ei kasuta", points: 0 }] }) },
    { ...common, name: "sedelid", label: "Õigesti avatud sedeleid", type: "NUMBER", validation: { required: true, min: 0, max: 9, integer: true } },
    { ...common, name: "lahendus", label: "Lahendussõna leidmine", type: "POINTS_SELECT", meta: JSON.stringify({ options: [{ id: "yes", label: "Leidis", points: 5 }, { id: "no", label: "Ei leidnud", points: 0 }] }) },
    { ...common, name: "aeg", label: "Aeg", type: "TIME_POINTS", meta: JSON.stringify(exampleTimeMeta) },
    { ...common, name: "kokku", label: "Punkte kokku", type: "COMPUTED", rankingPriority: 1, fieldHigherIsBetter: true, formula: "nato + sedelid * 2 + lahendus + aeg", validation: {} },
  ]
}
