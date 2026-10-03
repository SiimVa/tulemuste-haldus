// Statistika töölaua arvutuste sisendid. Kõik arvutused on puhtad funktsioonid,
// et neid saaks testida ilma andmebaasita.

export type DashTeam = {
  id: string
  code: string
  name: string
  class: string | null
  isHorsDeCompetition: boolean
  hcFromElementOrder: number | null
  dnfFromElementOrder: number | null
  dnfReason: string | null
  dqFromElementOrder: number | null
  dnsFlag: boolean
}

export type DashField = {
  name: string
  label: string
  type: string
  meta: string | null
  rankingPriority: number | null
}

export type DashElement = {
  id: string
  code: string
  name: string
  type: string
  order: number
  isCancelled: boolean
  maxValue: number | null
  // Kõik sisendväljad (ka sektsioonide omad), arvutatud väljadeta.
  inputFields: DashField[]
  exceptions: { label: string; kind: string | null }[]
}

export type DashResult = {
  elementId: string
  teamId: string
  values: Record<string, unknown>
  exceptionLabel: string | null
  enteredAt: Date
  updatedAt: Date
  enteredByUserId: string | null
  enteredByTokenId: string | null
}

export type DashMiscEntry = {
  elementId: string
  teamId: string
  points: number
  description: string
  reason: string | null
  abandonElementId: string | null
  abandonTime: string | null
  createdAt: Date
}

export type DashScore = { elementId: string; teamId: string; points: number }
export type DashPenalty = { teamId: string; points: number; description: string; enteredAt: Date }

export type ScoringMode = "PENALTY" | "PLUS"

// Rajal liikumist näitavad elemendid. Muud tüübid (Muu, Katkestamine,
// käsitsi) sisestab korraldaja ja need ei näita võistkonna asukohta.
export const TRACKED_ELEMENT_TYPES = ["CHECKPOINT", "PENALTY_BOX", "COUNTER_ACTION", "EQUIPMENT_CHECK", "LATENESS"]
// Rajapunktid, mille järjekorda ja läbimist jälgitakse.
export const ROUTE_ELEMENT_TYPES = ["CHECKPOINT", "PENALTY_BOX"]
// Elemendid, millel on võistkonnapõhine oodatav tulemus.
export const MISC_ELEMENT_TYPES = ["OTHER", "ABANDONMENT"]

export const isRouteElement = (element: { type: string; isCancelled: boolean }) =>
  !element.isCancelled && ROUTE_ELEMENT_TYPES.includes(element.type)

export const MINUTE = 60_000
export const minutesBetween = (from: Date, to: Date) => Math.max(0, Math.floor((to.getTime() - from.getTime()) / MINUTE))

export function isWithdrawnAt(team: { dnfFromElementOrder: number | null }, order: number) {
  return team.dnfFromElementOrder != null && order >= team.dnfFromElementOrder
}

export const round2 = (value: number) => Math.round(value * 100) / 100
