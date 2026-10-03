import { z } from "zod"

// Statistika töölaua vidinad. Järjekord on vaikimisi kuvamise järjekord.
// publicAllowed=false vidinad sisaldavad isikuandmeid või sisekorralduslikku
// infot ning neid ei saa avalikku vaatesse lisada.
export const DASHBOARD_WIDGETS = [
  { id: "summary", group: "LIVE", title: "Põhinumbrid", publicAllowed: true,
    description: "Keskmiselt läbitud KP-d, läbimise ja tulemuste protsent ning võistkondade seis." },
  { id: "map", group: "MAP", title: "Kaart", publicAllowed: true,
    description: "KP-d kaardil. Mulli suurus näitab läbimiste arvu, värv tulemust või värskust." },
  { id: "freshness", group: "LIVE", title: "KP-de värskus", publicAllowed: false,
    description: "Iga KP viimane sisestus ja sellest möödunud aeg." },
  { id: "teamTracker", group: "LIVE", title: "Võistkondade asukoht", publicAllowed: false,
    description: "Iga võistkonna viimane KP ja hoiatus, kui võistkonda pole kaua üheski KP-s nähtud." },
  { id: "missingResults", group: "LIVE", title: "Puuduvad tulemused", publicAllowed: false,
    description: "KP-d, mis jäid võistkonna läbitud teekonnal sisestamata." },
  { id: "judges", group: "LIVE", title: "Kohtunike aktiivsus", publicAllowed: false,
    description: "Sisestajate viimane tegevus ja KP-d, kuhu pole veel midagi sisestatud." },
  { id: "withdrawals", group: "LIVE", title: "Katkestamised ja staatused", publicAllowed: false,
    description: "Katkestanud, mittestartinud, diskvalifitseeritud ja arvestusvälised võistkonnad ning katkestanud liikmed." },
  { id: "entryRate", group: "LIVE", title: "Sisestamise tempo", publicAllowed: true,
    description: "Sisestatud tulemused ajas ja prognoos, millal kõik tulemused on sees." },
  { id: "elementProgress", group: "LIVE", title: "Edenemine elementide kaupa", publicAllowed: true,
    description: "Iga elemendi sisestatud ja oodatud tulemuste arv." },
  { id: "topTeams", group: "RESULTS", title: "Parimad võistkonnad", publicAllowed: true,
    description: "Esimesed võistkonnad üldarvestuses ja klassiti koos vahega eelmise ja esimesega." },
  { id: "interimStandings", group: "RESULTS", title: "Õiglane vahepingerida", publicAllowed: true,
    description: "Võistluse ajal on võistkonnad eri kaugusel. Võrdleb ühiseid KP-sid või punkte läbitud KP kohta." },
  { id: "closeContests", group: "RESULTS", title: "Tihedad heitlused", publicAllowed: true,
    description: "Poodiumikohad, kus vahe naabriga on väiksem kui määratud piir." },
  { id: "elementWinners", group: "RESULTS", title: "KP võitjad", publicAllowed: true,
    description: "Iga KP parim võistkond üldarvestuses ja klassiti." },
  { id: "elementTable", group: "ANALYSIS", title: "KP tabel", publicAllowed: true,
    description: "Sooritanud, erandid ja andmete täielikkus KP kaupa." },
  { id: "difficulty", group: "ANALYSIS", title: "Raskusaste", publicAllowed: true,
    description: "Kui palju punkte KP-s parimast keskmiselt kaotati ja kui paljudel jäi ülesanne sooritamata." },
  { id: "discrimination", group: "ANALYSIS", title: "Eristusvõime", publicAllowed: true,
    description: "Kas KP eristas võistkondi ja kui tugevalt oli KP tulemus seotud lõpptulemusega." },
  { id: "classComparison", group: "ANALYSIS", title: "Klasside võrdlus", publicAllowed: true,
    description: "Klasside keskmine tulemus KP kaupa." },
  { id: "timeSpent", group: "ANALYSIS", title: "Ajakulu KP-s", publicAllowed: true,
    description: "Ülesande kestus ja samaaegsed võistkonnad KP-des, kus on ajaväli." },
  { id: "penalties", group: "ANALYSIS", title: "Karistused", publicAllowed: false,
    description: "Vastutegevuse, varustuse, hilinemise ja käsitsi karistuste kokkuvõte." },
] as const

export type DashboardWidgetId = (typeof DASHBOARD_WIDGETS)[number]["id"]
export type DashboardWidgetGroup = (typeof DASHBOARD_WIDGETS)[number]["group"]
export const DASHBOARD_WIDGET_IDS = DASHBOARD_WIDGETS.map((widget) => widget.id) as DashboardWidgetId[]

export const DASHBOARD_GROUP_LABELS: Record<DashboardWidgetGroup, string> = {
  LIVE: "Võistluse ajal",
  RESULTS: "Tulemused",
  ANALYSIS: "Analüüs",
  MAP: "Kaart",
}

export function dashboardWidget(id: DashboardWidgetId) {
  return DASHBOARD_WIDGETS.find((widget) => widget.id === id)!
}

export function isDashboardWidgetId(value: unknown): value is DashboardWidgetId {
  return typeof value === "string" && (DASHBOARD_WIDGET_IDS as string[]).includes(value)
}

// ─── Klasside liikumisjärjekord ─────────────────────────────────────────────
// ORDER: elementide järjekorras, REVERSE: vastupidi, CUSTOM: korraldaja
// määratud KP-d ja järjekord, FREE: järjekord on vaba (nt rogain).
export const ROUTE_MODES = ["ORDER", "REVERSE", "CUSTOM", "FREE"] as const
export type RouteMode = (typeof ROUTE_MODES)[number]
export const ROUTE_MODE_LABELS: Record<RouteMode, string> = {
  ORDER: "Elementide järjekorras",
  REVERSE: "Vastupidises järjekorras",
  CUSTOM: "Oma järjekord",
  FREE: "Vaba järjekord",
}
export type ClassRoute = { mode: RouteMode; elementIds: string[] }
// Võti "" kehtib klassidele, millele pole eraldi järjekorda määratud.
export const DEFAULT_ROUTE_KEY = ""

export const MAP_COLOR_MODES = ["RESULT", "FRESHNESS", "VISITS"] as const
export type MapColorMode = (typeof MAP_COLOR_MODES)[number]
export const MAP_COLOR_MODE_LABELS: Record<MapColorMode, string> = {
  RESULT: "Keskmine tulemus",
  FRESHNESS: "Värskus",
  VISITS: "Läbimised",
}

export type DashboardWidgetSetting = { id: DashboardWidgetId; internal: boolean; public: boolean }

export type DashboardThresholds = {
  freshnessWarnMinutes: number
  freshnessAlertMinutes: number
  safetyMinutes: number
  topCount: number
  closeGap: number
  screenRotateSeconds: number
}

export type DashboardConfig = {
  widgets: DashboardWidgetSetting[]
  thresholds: DashboardThresholds
  routes: Record<string, ClassRoute>
  finishElementId: string | null
  mapColorMode: MapColorMode
  // Avalik kaart näitab KP-de asukohti, seega vaikimisi alles pärast võistlust.
  mapPublicWhileActive: boolean
}

export const DEFAULT_THRESHOLDS: DashboardThresholds = {
  freshnessWarnMinutes: 20,
  freshnessAlertMinutes: 45,
  safetyMinutes: 60,
  topCount: 5,
  closeGap: 3,
  screenRotateSeconds: 20,
}

const THRESHOLD_LIMITS: Record<keyof DashboardThresholds, { min: number; max: number; integer: boolean }> = {
  freshnessWarnMinutes: { min: 1, max: 1440, integer: true },
  freshnessAlertMinutes: { min: 1, max: 1440, integer: true },
  safetyMinutes: { min: 5, max: 1440, integer: true },
  topCount: { min: 1, max: 20, integer: true },
  closeGap: { min: 0, max: 1000, integer: false },
  screenRotateSeconds: { min: 5, max: 300, integer: true },
}

// Avalikus vaates on vaikimisi sama sisu, mis enne vidinate lisamist.
const DEFAULT_PUBLIC: DashboardWidgetId[] = ["summary", "elementProgress"]

export function defaultDashboardConfig(): DashboardConfig {
  return {
    widgets: DASHBOARD_WIDGET_IDS.map((id) => ({ id, internal: true, public: DEFAULT_PUBLIC.includes(id) })),
    thresholds: { ...DEFAULT_THRESHOLDS },
    routes: {},
    finishElementId: null,
    mapColorMode: "RESULT",
    mapPublicWhileActive: false,
  }
}

const idSchema = z.string().min(1).max(100)
const routeSchema = z.object({
  mode: z.enum(ROUTE_MODES),
  elementIds: z.array(idSchema).max(500),
}).strict()

export const dashboardConfigInputSchema = z.object({
  widgets: z.array(z.object({
    id: z.enum(DASHBOARD_WIDGET_IDS as [DashboardWidgetId, ...DashboardWidgetId[]]),
    internal: z.boolean(),
    public: z.boolean(),
  }).strict()).max(DASHBOARD_WIDGETS.length),
  thresholds: z.object({
    freshnessWarnMinutes: z.number(),
    freshnessAlertMinutes: z.number(),
    safetyMinutes: z.number(),
    topCount: z.number(),
    closeGap: z.number(),
    screenRotateSeconds: z.number(),
  }).strict(),
  routes: z.record(z.string().max(100), routeSchema).refine((routes) => Object.keys(routes).length <= 100, "Liiga palju klasse"),
  finishElementId: idSchema.nullable(),
  mapColorMode: z.enum(MAP_COLOR_MODES),
  mapPublicWhileActive: z.boolean(),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.widgets.map((widget) => widget.id)).size !== value.widgets.length)
    ctx.addIssue({ code: "custom", message: "Vidin ei tohi korduda." })
  for (const [key, route] of Object.entries(value.routes)) {
    if (new Set(route.elementIds).size !== route.elementIds.length)
      ctx.addIssue({ code: "custom", message: `Klassi ${key || "vaikimisi"} järjekorras kordub KP.` })
    if (route.mode === "CUSTOM" && route.elementIds.length === 0)
      ctx.addIssue({ code: "custom", message: `Vali klassi ${key || "vaikimisi"} järjekorda vähemalt üks KP.` })
  }
})
export type DashboardConfigInput = z.infer<typeof dashboardConfigInputSchema>

function clampThreshold(key: keyof DashboardThresholds, value: unknown): number {
  const { min, max, integer } = THRESHOLD_LIMITS[key]
  const number = typeof value === "number" && Number.isFinite(value) ? value : DEFAULT_THRESHOLDS[key]
  const clamped = Math.min(max, Math.max(min, number))
  return integer ? Math.round(clamped) : Math.round(clamped * 100) / 100
}

function normalizeRoute(value: unknown): ClassRoute | null {
  if (!value || typeof value !== "object") return null
  const raw = value as { mode?: unknown; elementIds?: unknown }
  if (typeof raw.mode !== "string" || !(ROUTE_MODES as readonly string[]).includes(raw.mode)) return null
  const elementIds = Array.isArray(raw.elementIds)
    ? [...new Set(raw.elementIds.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 100))].slice(0, 500)
    : []
  const mode = raw.mode as RouteMode
  if (mode === "CUSTOM" && elementIds.length === 0) return null
  return { mode, elementIds: mode === "CUSTOM" ? elementIds : [] }
}

// Salvestatud või kliendilt tulnud seadistus kehtivaks: tundmatud vidinad
// jäetakse välja, puuduvad lisatakse lõppu vaikeseadega ning avaliku vaate
// keeluga vidinad ei saa kunagi avalikuks.
export function normalizeDashboardConfig(value: unknown): DashboardConfig {
  const defaults = defaultDashboardConfig()
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaults
  const raw = value as Record<string, unknown>

  const seen = new Set<DashboardWidgetId>()
  const widgets: DashboardWidgetSetting[] = []
  if (Array.isArray(raw.widgets)) {
    for (const item of raw.widgets) {
      if (!item || typeof item !== "object") continue
      const widget = item as { id?: unknown; internal?: unknown; public?: unknown }
      if (!isDashboardWidgetId(widget.id) || seen.has(widget.id)) continue
      seen.add(widget.id)
      widgets.push({
        id: widget.id,
        internal: widget.internal !== false,
        public: widget.public === true && dashboardWidget(widget.id).publicAllowed,
      })
    }
  }
  for (const widget of defaults.widgets) if (!seen.has(widget.id)) widgets.push(widget)

  const rawThresholds = raw.thresholds && typeof raw.thresholds === "object" ? raw.thresholds as Record<string, unknown> : {}
  const thresholds = Object.fromEntries(
    (Object.keys(DEFAULT_THRESHOLDS) as (keyof DashboardThresholds)[]).map((key) => [key, clampThreshold(key, rawThresholds[key])])
  ) as DashboardThresholds
  if (thresholds.freshnessAlertMinutes < thresholds.freshnessWarnMinutes)
    thresholds.freshnessAlertMinutes = thresholds.freshnessWarnMinutes

  const routes: Record<string, ClassRoute> = {}
  if (raw.routes && typeof raw.routes === "object" && !Array.isArray(raw.routes)) {
    for (const [key, route] of Object.entries(raw.routes as Record<string, unknown>).slice(0, 100)) {
      const normalized = normalizeRoute(route)
      if (normalized && key.length <= 100) routes[key.trim()] = normalized
    }
  }

  return {
    widgets,
    thresholds,
    routes,
    finishElementId: typeof raw.finishElementId === "string" && raw.finishElementId.length <= 100 ? raw.finishElementId : null,
    mapColorMode: (MAP_COLOR_MODES as readonly string[]).includes(raw.mapColorMode as string) ? raw.mapColorMode as MapColorMode : "RESULT",
    mapPublicWhileActive: raw.mapPublicWhileActive === true,
  }
}

export function parseDashboardConfig(json: string | null | undefined): DashboardConfig {
  try {
    return normalizeDashboardConfig(JSON.parse(json || "{}"))
  } catch {
    return defaultDashboardConfig()
  }
}

// Elemendiviited, mis ei kuulu enam võistlusse, eemaldatakse.
export function pruneDashboardElementIds(config: DashboardConfig, elementIds: Set<string>): DashboardConfig {
  const routes: Record<string, ClassRoute> = {}
  for (const [key, route] of Object.entries(config.routes)) {
    const ids = route.elementIds.filter((id) => elementIds.has(id))
    if (route.mode === "CUSTOM" && ids.length === 0) continue
    routes[key] = { mode: route.mode, elementIds: ids }
  }
  return {
    ...config,
    routes,
    finishElementId: config.finishElementId && elementIds.has(config.finishElementId) ? config.finishElementId : null,
  }
}

// Võistluse kopeerimisel seotakse elemendiviited uute elementidega.
export function remapDashboardElementIds(config: DashboardConfig, idMap: Map<string, string>): DashboardConfig {
  const routes: Record<string, ClassRoute> = {}
  for (const [key, route] of Object.entries(config.routes)) {
    const ids = route.elementIds.flatMap((id) => (idMap.has(id) ? [idMap.get(id)!] : []))
    if (route.mode === "CUSTOM" && ids.length === 0) continue
    routes[key] = { mode: route.mode, elementIds: ids }
  }
  return {
    ...config,
    routes,
    finishElementId: config.finishElementId ? idMap.get(config.finishElementId) ?? null : null,
  }
}

// ─── Eelseaded ───────────────────────────────────────────────────────────────
// Eelseade määrab töölaua ja/või avaliku vaate vidinad. Puuduv nimekiri jätab
// selle vaate valikud muutmata.
type PresetDefinition = {
  label: string
  description: string
  internal?: readonly DashboardWidgetId[]
  public?: readonly DashboardWidgetId[]
}

export const DASHBOARD_PRESETS = {
  LIVE: {
    label: "Võistluse ajal",
    description: "Peakorterile: värskus, asukohad, puuduvad tulemused ja kohtunikud. Avalikku vaadet ei muuda.",
    internal: ["summary", "map", "freshness", "teamTracker", "missingResults", "judges", "withdrawals", "entryRate", "elementProgress", "topTeams", "elementTable"],
  },
  PUBLIC_SCREEN: {
    label: "Avalik ekraan",
    description: "Avalikku vaatesse parimad, tihedad heitlused, KP võitjad ja kaart. Töölauda ei muuda.",
    public: ["summary", "topTeams", "closeContests", "elementWinners", "map", "entryRate", "elementProgress"],
  },
  SUMMARY: {
    label: "Kokkuvõte",
    description: "Pärast võistlust: KP-de analüüs, klasside võrdlus, ajakulu ja karistused töölauale ning kokkuvõte avalikku vaatesse.",
    internal: ["summary", "topTeams", "elementWinners", "elementTable", "difficulty", "discrimination", "classComparison", "timeSpent", "penalties", "withdrawals", "map"],
    public: ["summary", "topTeams", "elementWinners", "elementTable", "map"],
  },
} as const satisfies Record<string, PresetDefinition>
export type DashboardPreset = keyof typeof DASHBOARD_PRESETS

export function applyDashboardPreset(config: DashboardConfig, preset: DashboardPreset): DashboardConfig {
  const definition: PresetDefinition = DASHBOARD_PRESETS[preset]
  const shownIds = [...new Set([...(definition.internal ?? []), ...(definition.public ?? [])])]
  // Eelseade tõstab oma vidinad ettepoole, ülejäänud jäävad senisesse järjekorda.
  const ordered = [
    ...shownIds.map((id) => config.widgets.find((widget) => widget.id === id)!),
    ...config.widgets.filter((widget) => !shownIds.includes(widget.id)),
  ]
  return {
    ...config,
    widgets: ordered.map((widget) => ({
      id: widget.id,
      internal: definition.internal ? definition.internal.includes(widget.id) : widget.internal,
      public: (definition.public ? definition.public.includes(widget.id) : widget.public) && dashboardWidget(widget.id).publicAllowed,
    })),
  }
}

export function publicMapVisible(config: Pick<DashboardConfig, "mapPublicWhileActive">, status: string) {
  return config.mapPublicWhileActive || ["FINISHED", "ARCHIVED", "CANCELLED"].includes(status)
}

// Võistluse staatuse andmisel peidetakse avalik kaart enne võistluse lõppu.
export function visibleWidgetIds(config: DashboardConfig, audience: "internal" | "public", status?: string): DashboardWidgetId[] {
  return config.widgets
    .filter((widget) => (audience === "public" ? widget.public && dashboardWidget(widget.id).publicAllowed : widget.internal))
    .filter((widget) => !(audience === "public" && widget.id === "map" && status !== undefined && !publicMapVisible(config, status)))
    .map((widget) => widget.id)
}
