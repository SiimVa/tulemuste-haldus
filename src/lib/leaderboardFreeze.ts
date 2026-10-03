// Avaliku pingerea külmutamise snapshot: kõik, mis mõjutab avalikke punkte ja
// kohti. Võistkondade nimed ja klassid loetakse jooksvalt, sest need ei
// avalda tulemusi.

export type FreezeSnapshot = {
  version: 1
  takenAt: string
  scores: { elementId: string; teamId: string; points: number }[]
  penalties: { teamId: string; points: number; description: string; enteredAt: string }[]
  miscEntries: { elementId: string; teamId: string; points: number; description: string; elementType: string }[]
  teams: {
    id: string
    isHorsDeCompetition: boolean
    hcFromElementOrder: number | null
    dnfFromElementOrder: number | null
    dnfReason: string | null
    dqFromElementOrder: number | null
    dnsFlag: boolean
  }[]
  elements: { id: string; isCancelled: boolean }[]
}

export type PublicFreeze = { freezeAt: Date; snapshot: FreezeSnapshot }

const isString = (value: unknown): value is string => typeof value === "string"
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)
const isOrder = (value: unknown): value is number | null => value === null || (Number.isInteger(value) && (value as number) >= 0)
const records = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object") : [])

export function emptyFreezeSnapshot(takenAt: Date): FreezeSnapshot {
  return { version: 1, takenAt: takenAt.toISOString(), scores: [], penalties: [], miscEntries: [], teams: [], elements: [] }
}

// Vigase snapshot'i korral näidatakse tühja seisu, mitte jooksvaid tulemusi.
export function parseFreezeSnapshot(value: unknown, fallbackTakenAt: Date): FreezeSnapshot {
  if (!value || typeof value !== "object" || (value as { version?: unknown }).version !== 1) return emptyFreezeSnapshot(fallbackTakenAt)
  const raw = value as Record<string, unknown>
  return {
    version: 1,
    takenAt: isString(raw.takenAt) ? raw.takenAt : fallbackTakenAt.toISOString(),
    scores: records(raw.scores).flatMap((item) => (
      isString(item.elementId) && isString(item.teamId) && isNumber(item.points)
        ? [{ elementId: item.elementId, teamId: item.teamId, points: item.points }] : [])),
    penalties: records(raw.penalties).flatMap((item) => (
      isString(item.teamId) && isNumber(item.points)
        ? [{ teamId: item.teamId, points: item.points, description: isString(item.description) ? item.description : "", enteredAt: isString(item.enteredAt) ? item.enteredAt : fallbackTakenAt.toISOString() }] : [])),
    miscEntries: records(raw.miscEntries).flatMap((item) => (
      isString(item.elementId) && isString(item.teamId) && isNumber(item.points)
        ? [{ elementId: item.elementId, teamId: item.teamId, points: item.points, description: isString(item.description) ? item.description : "", elementType: isString(item.elementType) ? item.elementType : "OTHER" }] : [])),
    teams: records(raw.teams).flatMap((item) => (
      isString(item.id) && isOrder(item.hcFromElementOrder) && isOrder(item.dnfFromElementOrder) && isOrder(item.dqFromElementOrder)
        ? [{
            id: item.id,
            isHorsDeCompetition: item.isHorsDeCompetition === true,
            hcFromElementOrder: item.hcFromElementOrder,
            dnfFromElementOrder: item.dnfFromElementOrder,
            dnfReason: isString(item.dnfReason) ? item.dnfReason : null,
            dqFromElementOrder: item.dqFromElementOrder,
            dnsFlag: item.dnsFlag === true,
          }] : [])),
    elements: records(raw.elements).flatMap((item) => (isString(item.id) ? [{ id: item.id, isCancelled: item.isCancelled === true }] : [])),
  }
}

type TeamStatus = Omit<FreezeSnapshot["teams"][number], "id">

// Võistkonna staatused külmutamise hetke seisuga. Hiljem lisatud võistkond
// jääb muutmata (tal pole snapshot'is tulemusi).
export function applyFrozenTeamStatus<T extends { id: string } & Partial<TeamStatus>>(teams: T[], snapshot: FreezeSnapshot): T[] {
  const byId = new Map(snapshot.teams.map((team) => [team.id, team]))
  return teams.map((team) => {
    const frozen = byId.get(team.id)
    if (!frozen) return team
    return {
      ...team,
      isHorsDeCompetition: frozen.isHorsDeCompetition,
      hcFromElementOrder: frozen.hcFromElementOrder,
      dnfFromElementOrder: frozen.dnfFromElementOrder,
      dnfReason: frozen.dnfReason,
      dqFromElementOrder: frozen.dqFromElementOrder,
      dnsFlag: frozen.dnsFlag,
    }
  })
}

export function applyFrozenElementStatus<T extends { id: string; isCancelled: boolean }>(elements: T[], snapshot: FreezeSnapshot): T[] {
  const byId = new Map(snapshot.elements.map((element) => [element.id, element.isCancelled]))
  return elements.map((element) => (byId.has(element.id) ? { ...element, isCancelled: byId.get(element.id)! } : element))
}

export function formatFreezeTime(date: Date): string {
  return date.toLocaleString("et-EE", { timeZone: "Europe/Tallinn", dateStyle: "medium", timeStyle: "short" })
}
