import { z } from "zod"

// Üleriikliku arvestuse ülevaate vidinad. Järjekord on vaikimisi kuvamise
// järjekord. Kõik vidinad põhinevad pingerea andmetel, seega võib igaüks olla
// avalik; osavõistluse sisekorralduse vidinaid (ohutus, kohtunikud) siin pole.
export const SERIES_WIDGETS = [
  { id: "summary", title: "Põhinumbrid",
    description: "Osavõistlused, võistkonnad arvestuses, arvestatav KP-de arv ja lõppenud osavõistlused." },
  { id: "topTeams", title: "Parimad võistkonnad",
    description: "Esimesed võistkonnad üldarvestuses ja klassiti koos vahega eelmise ja esimesega." },
  { id: "competitions", title: "Osavõistluste võrdlus",
    description: "Keskmine läbitud KP-de arv, keskmine ja parim tulemus osavõistluste kaupa." },
  { id: "classComparison", title: "Klasside võrdlus",
    description: "Klasside keskmine ja parim tulemus kokku ja osavõistluste kaupa." },
  { id: "closeContests", title: "Tihedad heitlused",
    description: "Poodiumikohad, kus vahe naabriga on väiksem kui määratud piir." },
  { id: "kpComparison", title: "KP-d osavõistlustes",
    description: "Sama tähisega KP keskmine tulemus ja läbimise protsent igas osavõistluses." },
] as const

export type SeriesWidgetId = (typeof SERIES_WIDGETS)[number]["id"]
export const SERIES_WIDGET_IDS = SERIES_WIDGETS.map((widget) => widget.id) as SeriesWidgetId[]

export function seriesWidget(id: SeriesWidgetId) {
  return SERIES_WIDGETS.find((widget) => widget.id === id)!
}

export function isSeriesWidgetId(value: unknown): value is SeriesWidgetId {
  return typeof value === "string" && (SERIES_WIDGET_IDS as string[]).includes(value)
}

export type SeriesWidgetSetting = { id: SeriesWidgetId; internal: boolean; public: boolean }
export type SeriesThresholds = { topCount: number; closeGap: number; screenRotateSeconds: number }
export type SeriesDashboardConfig = { widgets: SeriesWidgetSetting[]; thresholds: SeriesThresholds }
export type SeriesAudience = "internal" | "public"

export const DEFAULT_SERIES_THRESHOLDS: SeriesThresholds = { topCount: 5, closeGap: 3, screenRotateSeconds: 20 }

const THRESHOLD_LIMITS: Record<keyof SeriesThresholds, { min: number; max: number; integer: boolean }> = {
  topCount: { min: 1, max: 20, integer: true },
  closeGap: { min: 0, max: 1000, integer: false },
  screenRotateSeconds: { min: 5, max: 300, integer: true },
}

const DEFAULT_PUBLIC: SeriesWidgetId[] = ["summary", "topTeams", "competitions"]

export function defaultSeriesDashboardConfig(): SeriesDashboardConfig {
  return {
    widgets: SERIES_WIDGET_IDS.map((id) => ({ id, internal: true, public: DEFAULT_PUBLIC.includes(id) })),
    thresholds: { ...DEFAULT_SERIES_THRESHOLDS },
  }
}

function clampThreshold(key: keyof SeriesThresholds, value: unknown): number {
  const limits = THRESHOLD_LIMITS[key]
  const number = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(number)) return DEFAULT_SERIES_THRESHOLDS[key]
  const clamped = Math.min(limits.max, Math.max(limits.min, number))
  return limits.integer ? Math.round(clamped) : Math.round(clamped * 100) / 100
}

// Salvestatud seadete lugemine: tundmatud vidinad jäetakse välja, puuduvad
// lisatakse vaikeväärtustega lõppu, lävendid piiratakse lubatud vahemikku.
export function normalizeSeriesDashboardConfig(value: unknown): SeriesDashboardConfig {
  const input = value && typeof value === "object" ? (value as Record<string, unknown>) : {}
  const defaults = defaultSeriesDashboardConfig()
  const seen = new Set<SeriesWidgetId>()
  const widgets: SeriesWidgetSetting[] = []
  for (const item of Array.isArray(input.widgets) ? input.widgets : []) {
    const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {}
    if (!isSeriesWidgetId(record.id) || seen.has(record.id)) continue
    seen.add(record.id)
    widgets.push({ id: record.id, internal: record.internal !== false, public: record.public === true })
  }
  for (const widget of defaults.widgets) if (!seen.has(widget.id)) widgets.push(widget)
  const thresholds = input.thresholds && typeof input.thresholds === "object" ? (input.thresholds as Record<string, unknown>) : {}
  return {
    widgets,
    thresholds: {
      topCount: clampThreshold("topCount", thresholds.topCount ?? DEFAULT_SERIES_THRESHOLDS.topCount),
      closeGap: clampThreshold("closeGap", thresholds.closeGap ?? DEFAULT_SERIES_THRESHOLDS.closeGap),
      screenRotateSeconds: clampThreshold("screenRotateSeconds", thresholds.screenRotateSeconds ?? DEFAULT_SERIES_THRESHOLDS.screenRotateSeconds),
    },
  }
}

export function parseSeriesDashboardConfig(raw: string | null | undefined): SeriesDashboardConfig {
  if (!raw) return defaultSeriesDashboardConfig()
  try {
    return normalizeSeriesDashboardConfig(JSON.parse(raw))
  } catch {
    return defaultSeriesDashboardConfig()
  }
}

// API sisend: iga vidin täpselt üks kord, lävendid lubatud vahemikus.
export const seriesDashboardConfigSchema = z.object({
  widgets: z.array(z.object({ id: z.enum(SERIES_WIDGET_IDS as [SeriesWidgetId, ...SeriesWidgetId[]]), internal: z.boolean(), public: z.boolean() }).strict())
    .refine((widgets) => new Set(widgets.map((widget) => widget.id)).size === widgets.length, "Vidin on topelt"),
  thresholds: z.object({
    topCount: z.number().int().min(THRESHOLD_LIMITS.topCount.min).max(THRESHOLD_LIMITS.topCount.max),
    closeGap: z.number().min(THRESHOLD_LIMITS.closeGap.min).max(THRESHOLD_LIMITS.closeGap.max),
    screenRotateSeconds: z.number().int().min(THRESHOLD_LIMITS.screenRotateSeconds.min).max(THRESHOLD_LIMITS.screenRotateSeconds.max),
  }).strict(),
}).strict()

export function visibleSeriesWidgets(config: SeriesDashboardConfig, audience: SeriesAudience): SeriesWidgetId[] {
  return config.widgets.filter((widget) => (audience === "public" ? widget.public : widget.internal)).map((widget) => widget.id)
}
