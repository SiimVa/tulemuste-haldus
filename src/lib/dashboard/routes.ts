import { DEFAULT_ROUTE_KEY, type ClassRoute, type DashboardConfig, type RouteMode } from "./config"
import { resultExceptionKind } from "../exceptionKinds"
import {
  TRACKED_ELEMENT_TYPES,
  isRouteElement,
  isWithdrawnAt,
  minutesBetween,
  type DashElement,
  type DashResult,
  type DashTeam,
} from "./types"

type ElementRef = { id: string; code: string; name: string }
const ref = (element: DashElement): ElementRef => ({ id: element.id, code: element.code, name: element.name })

export type ResolvedRoute = { mode: RouteMode; elements: DashElement[] }

export function routeForClass(config: Pick<DashboardConfig, "routes">, cls: string | null): ClassRoute {
  return config.routes[cls ?? DEFAULT_ROUTE_KEY] ?? config.routes[DEFAULT_ROUTE_KEY] ?? { mode: "ORDER", elementIds: [] }
}

// Klassi rajapunktid läbimise järjekorras.
export function resolveRoute(route: ClassRoute, elements: DashElement[]): ResolvedRoute {
  const ordered = elements.filter(isRouteElement).sort((a, b) => a.order - b.order)
  if (route.mode === "REVERSE") return { mode: "REVERSE", elements: [...ordered].reverse() }
  if (route.mode === "CUSTOM") {
    const byId = new Map(elements.filter((element) => !element.isCancelled).map((element) => [element.id, element]))
    const custom = route.elementIds.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []))
    if (custom.length > 0) return { mode: "CUSTOM", elements: custom }
    return { mode: "ORDER", elements: ordered }
  }
  return { mode: route.mode, elements: ordered }
}

export type TeamStatus = "DNS" | "DNF" | "FINISHED" | "ON_ROUTE" | "NOT_SEEN"
export const TEAM_STATUS_LABELS: Record<TeamStatus, string> = {
  DNS: "Ei startinud",
  DNF: "Katkestanud",
  FINISHED: "Lõpetanud",
  ON_ROUTE: "Rajal",
  NOT_SEEN: "Pole nähtud",
}

export type TeamProgress = {
  team: { id: string; code: string; name: string; class: string | null }
  status: TeamStatus
  lastSeen: (ElementRef & { at: Date }) | null
  minutesSinceSeen: number | null
  nextElement: ElementRef | null
  visitedCount: number
  routeLength: number
  alert: "OVERDUE" | "NOT_SEEN" | null
  missing: ElementRef[]
}

export type TeamProgressInput = {
  teams: DashTeam[]
  elements: DashElement[]
  results: Pick<DashResult, "elementId" | "teamId" | "enteredAt" | "exceptionLabel">[]
  config: Pick<DashboardConfig, "routes" | "finishElementId">
  safetyMinutes: number
  status: string
  now: Date
}

// Võistkonna liikumine rajal tulemuste sisestusaegade järgi. Tulemus „Ei
// läbinud” ei tähenda, et võistkond oleks KP-s käinud, seega seda ei loeta.
// Lõpetanuks loetakse võistkond ainult finiši (või järjestatud raja viimase
// KP) tulemuse põhjal, et suletud KP-de „Ei läbinud” kirjed ei peidaks
// kadunud võistkonda.
export function computeTeamProgress(input: TeamProgressInput): TeamProgress[] {
  const { teams, elements, results, config, safetyMinutes, status, now } = input
  const elementById = new Map(elements.map((element) => [element.id, element]))
  const active = status === "ACTIVE"
  const competitionFinished = status === "FINISHED" || status === "ARCHIVED"

  const resultsByTeam = new Map<string, TeamProgressInput["results"]>()
  for (const result of results) {
    const list = resultsByTeam.get(result.teamId) ?? []
    list.push(result)
    resultsByTeam.set(result.teamId, list)
  }

  let firstSightingAt: Date | null = null
  const sightingsByTeam = new Map<string, { element: DashElement; at: Date }[]>()
  for (const result of results) {
    const element = elementById.get(result.elementId)
    if (!element || element.isCancelled || !TRACKED_ELEMENT_TYPES.includes(element.type)) continue
    if (resultExceptionKind(result.exceptionLabel, element.exceptions) === "NOT_PASSED") continue
    const list = sightingsByTeam.get(result.teamId) ?? []
    list.push({ element, at: result.enteredAt })
    sightingsByTeam.set(result.teamId, list)
    if (!firstSightingAt || result.enteredAt < firstSightingAt) firstSightingAt = result.enteredAt
  }

  return teams.map((team): TeamProgress => {
    const route = resolveRoute(routeForClass(config, team.class), elements)
    const routeElements = route.elements.filter((element) => !isWithdrawnAt(team, element.order))
    const sightings = sightingsByTeam.get(team.id) ?? []
    const seenIds = new Set(sightings.map((sighting) => sighting.element.id))
    const resultIds = new Set((resultsByTeam.get(team.id) ?? []).map((result) => result.elementId))
    const last = sightings.reduce<{ element: DashElement; at: Date } | null>(
      (latest, sighting) => (!latest || sighting.at > latest.at ? sighting : latest), null)

    const ordered = route.mode !== "FREE"
    const finishId = config.finishElementId && elementById.has(config.finishElementId)
      ? config.finishElementId
      : ordered && route.elements.length > 0 ? route.elements[route.elements.length - 1].id : null
    const finished = finishId != null && seenIds.has(finishId)

    let teamStatus: TeamStatus
    if (team.dnsFlag) teamStatus = "DNS"
    else if (team.dnfFromElementOrder != null) teamStatus = "DNF"
    else if (finished) teamStatus = "FINISHED"
    else if (last) teamStatus = "ON_ROUTE"
    else teamStatus = "NOT_SEEN"

    const furthest = routeElements.reduce((max, element, index) => (seenIds.has(element.id) ? index : max), -1)
    const checkAll = teamStatus === "FINISHED" || competitionFinished
    const missing = teamStatus === "DNS" ? [] : routeElements
      .filter((element, index) => !resultIds.has(element.id) && (checkAll || (ordered && index < furthest)))
      .map(ref)
    const nextElement = ordered && (teamStatus === "ON_ROUTE" || teamStatus === "NOT_SEEN")
      ? routeElements.slice(furthest + 1).find((element) => !resultIds.has(element.id)) ?? null
      : null

    const minutesSinceSeen = last ? minutesBetween(last.at, now) : null
    let alert: TeamProgress["alert"] = null
    if (active && teamStatus === "ON_ROUTE" && minutesSinceSeen != null && minutesSinceSeen >= safetyMinutes) alert = "OVERDUE"
    if (active && teamStatus === "NOT_SEEN" && firstSightingAt && minutesBetween(firstSightingAt, now) >= safetyMinutes) alert = "NOT_SEEN"

    return {
      team: { id: team.id, code: team.code, name: team.name, class: team.class },
      status: teamStatus,
      lastSeen: last ? { ...ref(last.element), at: last.at } : null,
      minutesSinceSeen,
      nextElement: nextElement ? ref(nextElement) : null,
      visitedCount: routeElements.filter((element) => seenIds.has(element.id)).length,
      routeLength: routeElements.length,
      alert,
      missing,
    }
  })
}

const STATUS_ORDER: Record<TeamStatus, number> = { ON_ROUTE: 0, NOT_SEEN: 1, FINISHED: 2, DNF: 3, DNS: 4 }

// Hoiatused ette (kauem nägemata enne), seejärel rajal olijad.
export function sortTeamProgress(rows: TeamProgress[]): TeamProgress[] {
  return [...rows].sort((a, b) =>
    Number(Boolean(b.alert)) - Number(Boolean(a.alert)) ||
    STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
    (b.minutesSinceSeen ?? -1) - (a.minutesSinceSeen ?? -1) ||
    a.team.code.localeCompare(b.team.code, "et", { numeric: true }))
}
