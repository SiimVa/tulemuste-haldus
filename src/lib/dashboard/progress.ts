import { resultExceptionKind } from "../exceptionKinds"
import { parseEstimates, readEstimation } from "../estimation"
import type { TeamProgress } from "./routes"
import {
  MINUTE,
  MISC_ELEMENT_TYPES,
  TRACKED_ELEMENT_TYPES,
  isRouteElement,
  isWithdrawnAt,
  minutesBetween,
  round2,
  type DashElement,
  type DashMiscEntry,
  type DashResult,
  type DashTeam,
} from "./types"

type ElementRef = { id: string; code: string; name: string }
const ref = (element: DashElement): ElementRef => ({ id: element.id, code: element.code, name: element.name })
const pct = (part: number, whole: number) => (whole > 0 ? round2((part / whole) * 100) : null)

// ─── Edenemine elementide kaupa ──────────────────────────────────────────────
export type ElementProgressRow = ElementRef & {
  type: string
  isCancelled: boolean
  entered: number
  total: number
  withdrawn: number
}

export function elementProgressRows(elements: DashElement[], teams: DashTeam[], results: Pick<DashResult, "elementId" | "teamId">[], miscEntries: Pick<DashMiscEntry, "elementId" | "teamId">[]): ElementProgressRow[] {
  const entered = new Map<string, Set<string>>()
  for (const item of [...results, ...miscEntries]) {
    const set = entered.get(item.elementId) ?? new Set<string>()
    set.add(item.teamId)
    entered.set(item.elementId, set)
  }
  return [...elements].sort((a, b) => a.order - b.order).map((element) => {
    const eligible = teams.filter((team) => !isWithdrawnAt(team, element.order))
    const ids = entered.get(element.id) ?? new Set<string>()
    return {
      ...ref(element),
      type: element.type,
      isCancelled: element.isCancelled,
      entered: eligible.filter((team) => ids.has(team.id)).length,
      total: eligible.length,
      withdrawn: teams.length - eligible.length,
    }
  })
}

// ─── Põhinumbrid ─────────────────────────────────────────────────────────────
export type SummaryStats = {
  teamCount: number
  inCompCount: number
  classCount: number
  elementCount: number
  activeElementCount: number
  routeElementCount: number
  averageVisited: number | null
  visitPct: number | null
  resultsEntered: number
  resultsExpected: number
  resultsPct: number | null
  statusCounts: Record<TeamProgress["status"], number>
  alertCount: number
}

export function summaryStats(teams: DashTeam[], elements: DashElement[], progress: ElementProgressRow[], teamProgress: TeamProgress[]): SummaryStats {
  // Katkestamise ja Muu kirjeid ei oodata igalt võistkonnalt.
  const active = progress.filter((row) => !row.isCancelled && !MISC_ELEMENT_TYPES.includes(row.type))
  const resultsEntered = active.reduce((sum, row) => sum + row.entered, 0)
  const resultsExpected = active.reduce((sum, row) => sum + row.total, 0)
  const racing = teamProgress.filter((row) => row.status !== "DNS" && row.routeLength > 0)
  const statusCounts = { DNS: 0, DNF: 0, FINISHED: 0, ON_ROUTE: 0, NOT_SEEN: 0 }
  for (const row of teamProgress) statusCounts[row.status]++
  return {
    teamCount: teams.length,
    inCompCount: teams.filter((team) => !team.isHorsDeCompetition && team.hcFromElementOrder == null).length,
    classCount: new Set(teams.map((team) => team.class ?? "–")).size,
    elementCount: elements.length,
    activeElementCount: elements.filter((element) => !element.isCancelled).length,
    routeElementCount: elements.filter(isRouteElement).length,
    averageVisited: racing.length ? round2(racing.reduce((sum, row) => sum + row.visitedCount, 0) / racing.length) : null,
    visitPct: racing.length ? round2((racing.reduce((sum, row) => sum + row.visitedCount / row.routeLength, 0) / racing.length) * 100) : null,
    resultsEntered,
    resultsExpected,
    resultsPct: pct(resultsEntered, resultsExpected),
    statusCounts,
    alertCount: teamProgress.filter((row) => row.alert).length,
  }
}

// ─── KP tabel ────────────────────────────────────────────────────────────────
// Andmelahtrid: iga sisendväli, ajavahemikul algus ja lõpp, hindamisel iga
// hinnatav väärtus. Erandiga tulemustelt andmeid ei oodata.
export function inputCells(element: Pick<DashElement, "inputFields">, values: Record<string, unknown>): { total: number; filled: number } {
  let total = 0
  let filled = 0
  const present = (value: unknown) => value !== undefined && value !== null && String(value).trim() !== ""
  for (const field of element.inputFields) {
    if (field.type === "TIME_RANGE") {
      total += 2
      filled += Number(present(values[`${field.name}_start`])) + Number(present(values[`${field.name}_end`]))
    } else if (field.type === "ESTIMATION") {
      const targets = readEstimation(field.meta).targets
      const estimates = parseEstimates(values[field.name])
      total += targets.length
      filled += targets.filter((target) => present(estimates[target.id])).length
    } else if (field.type === "CHECKBOX") {
      // Märkimata märkeruut on samuti vastus.
      total += 1
      filled += 1
    } else {
      total += 1
      filled += Number(present(values[field.name]))
    }
  }
  return { total, filled }
}

export type ElementTableRow = ElementRef & {
  type: string
  expected: number
  entered: number
  enteredPct: number | null
  performed: number
  passedNotDone: number
  notPassed: number
  otherException: number
  visited: number
  dataCells: number
  dataFilled: number
  dataPct: number | null
}

export function elementTableRows(elements: DashElement[], teams: DashTeam[], results: DashResult[]): ElementTableRow[] {
  const resultsByElement = new Map<string, DashResult[]>()
  for (const result of results) {
    const list = resultsByElement.get(result.elementId) ?? []
    list.push(result)
    resultsByElement.set(result.elementId, list)
  }
  const teamById = new Map(teams.map((team) => [team.id, team]))
  return elements
    .filter((element) => !element.isCancelled && !MISC_ELEMENT_TYPES.includes(element.type))
    .sort((a, b) => a.order - b.order)
    .map((element) => {
      const expected = teams.filter((team) => !isWithdrawnAt(team, element.order)).length
      const elementResults = (resultsByElement.get(element.id) ?? []).filter((result) => {
        const team = teamById.get(result.teamId)
        return team && !isWithdrawnAt(team, element.order)
      })
      let performed = 0, passedNotDone = 0, notPassed = 0, otherException = 0, dataCells = 0, dataFilled = 0
      for (const result of elementResults) {
        const kind = resultExceptionKind(result.exceptionLabel, element.exceptions)
        if (kind === "NOT_PASSED") notPassed++
        else if (kind === "PASSED_NOT_DONE") passedNotDone++
        else if (kind === "OTHER") otherException++
        else {
          performed++
          const cells = inputCells(element, result.values)
          dataCells += cells.total
          dataFilled += cells.filled
        }
      }
      return {
        ...ref(element),
        type: element.type,
        expected,
        entered: elementResults.length,
        enteredPct: pct(elementResults.length, expected),
        performed,
        passedNotDone,
        notPassed,
        otherException,
        visited: performed + passedNotDone,
        dataCells,
        dataFilled,
        dataPct: pct(dataFilled, dataCells),
      }
    })
}

// ─── KP-de värskus ───────────────────────────────────────────────────────────
export type FreshnessLevel = "OK" | "WARN" | "ALERT" | "NONE" | "DONE"
export type FreshnessRow = ElementRef & {
  type: string
  lastActivityAt: Date | null
  minutesAgo: number | null
  recentCount: number
  entered: number
  total: number
  level: FreshnessLevel
}

export function freshnessRows(
  elements: DashElement[],
  progress: ElementProgressRow[],
  results: Pick<DashResult, "elementId" | "enteredAt" | "updatedAt">[],
  thresholds: { freshnessWarnMinutes: number; freshnessAlertMinutes: number },
  status: string,
  now: Date
): FreshnessRow[] {
  const last = new Map<string, Date>()
  const recent = new Map<string, number>()
  const recentSince = now.getTime() - 30 * MINUTE
  for (const result of results) {
    const activity = result.updatedAt > result.enteredAt ? result.updatedAt : result.enteredAt
    const current = last.get(result.elementId)
    if (!current || activity > current) last.set(result.elementId, activity)
    if (result.enteredAt.getTime() >= recentSince) recent.set(result.elementId, (recent.get(result.elementId) ?? 0) + 1)
  }
  const progressById = new Map(progress.map((row) => [row.id, row]))
  return elements
    .filter((element) => !element.isCancelled && TRACKED_ELEMENT_TYPES.includes(element.type))
    .sort((a, b) => a.order - b.order)
    .map((element) => {
      const lastActivityAt = last.get(element.id) ?? null
      const minutesAgo = lastActivityAt ? minutesBetween(lastActivityAt, now) : null
      const { entered = 0, total = 0 } = progressById.get(element.id) ?? {}
      let level: FreshnessLevel = "OK"
      if (total > 0 && entered >= total) level = "DONE"
      else if (!lastActivityAt) level = "NONE"
      else if (status === "ACTIVE" && minutesAgo! >= thresholds.freshnessAlertMinutes) level = "ALERT"
      else if (status === "ACTIVE" && minutesAgo! >= thresholds.freshnessWarnMinutes) level = "WARN"
      return { ...ref(element), type: element.type, lastActivityAt, minutesAgo, recentCount: recent.get(element.id) ?? 0, entered, total, level }
    })
}

// ─── Sisestamise tempo ───────────────────────────────────────────────────────
const BUCKET_MINUTES = [5, 10, 15, 30, 60, 120, 240, 720, 1440]
export type EntryRate = {
  bucketMinutes: number
  buckets: { start: Date; count: number }[]
  total: number
  lastHour: number
  remaining: number
  etaMinutes: number | null
}

export function entryRate(results: Pick<DashResult, "enteredAt">[], remaining: number, status: string, now: Date): EntryRate | null {
  if (results.length === 0) return null
  const times = results.map((result) => result.enteredAt.getTime()).sort((a, b) => a - b)
  const start = times[0]
  const end = Math.max(status === "ACTIVE" ? now.getTime() : times[times.length - 1], start + 1)
  const spanMinutes = (end - start) / MINUTE
  const bucketMinutes = BUCKET_MINUTES.find((size) => spanMinutes / size <= 48) ?? 1440
  const bucketMs = bucketMinutes * MINUTE
  const first = Math.floor(start / bucketMs) * bucketMs
  const count = Math.floor((end - first) / bucketMs) + 1
  const buckets = Array.from({ length: count }, (_, index) => ({ start: new Date(first + index * bucketMs), count: 0 }))
  for (const time of times) buckets[Math.min(count - 1, Math.floor((time - first) / bucketMs))].count++
  const hourAgo = end - 60 * MINUTE
  const lastHour = times.filter((time) => time > hourAgo).length
  return {
    bucketMinutes,
    buckets,
    total: times.length,
    lastHour,
    remaining,
    etaMinutes: status === "ACTIVE" && remaining > 0 && lastHour > 0 ? Math.round((remaining / lastHour) * 60) : null,
  }
}

// ─── Kohtunike aktiivsus ─────────────────────────────────────────────────────
export type JudgeSourceInput = {
  tokens: { id: string; name: string; type: string; elementId: string | null; lastUsedAt: Date | null }[]
  users: { id: string; name: string }[]
  assignments: { userId: string; elementId: string }[]
}

export type JudgeRow = {
  key: string
  name: string
  kind: "TOKEN" | "USER"
  elements: ElementRef[]
  entries: number
  lastEntryAt: Date | null
  minutesAgo: number | null
  lastOpenedAt: Date | null
}

export type JudgeActivity = { judges: JudgeRow[]; silentElements: ElementRef[] }

export function judgeActivity(elements: DashElement[], results: DashResult[], sources: JudgeSourceInput, now: Date): JudgeActivity {
  const elementById = new Map(elements.map((element) => [element.id, element]))
  type Acc = { entries: number; last: Date | null; elementIds: Set<string> }
  const acc = new Map<string, Acc>()
  const touch = (key: string, elementId: string, at: Date) => {
    const current = acc.get(key) ?? { entries: 0, last: null, elementIds: new Set<string>() }
    current.entries++
    current.elementIds.add(elementId)
    if (!current.last || at > current.last) current.last = at
    acc.set(key, current)
  }
  for (const result of results) {
    const at = result.updatedAt > result.enteredAt ? result.updatedAt : result.enteredAt
    if (result.enteredByTokenId) touch(`token:${result.enteredByTokenId}`, result.elementId, at)
    else if (result.enteredByUserId) touch(`user:${result.enteredByUserId}`, result.elementId, at)
  }
  const elementRefs = (ids: Iterable<string>) => [...ids].flatMap((id) => (elementById.has(id) ? [ref(elementById.get(id)!)] : []))
    .sort((a, b) => (elementById.get(a.id)!.order - elementById.get(b.id)!.order))

  const judges: JudgeRow[] = []
  for (const token of sources.tokens.filter((token) => token.type === "JUDGE" || acc.has(`token:${token.id}`))) {
    const data = acc.get(`token:${token.id}`)
    const assigned = token.elementId ? [token.elementId] : []
    judges.push({
      key: `token:${token.id}`,
      name: token.name,
      kind: "TOKEN",
      elements: elementRefs(new Set([...assigned, ...(data?.elementIds ?? [])])),
      entries: data?.entries ?? 0,
      lastEntryAt: data?.last ?? null,
      minutesAgo: data?.last ? minutesBetween(data.last, now) : null,
      lastOpenedAt: token.lastUsedAt,
    })
  }
  const userIds = new Set([...sources.assignments.map((assignment) => assignment.userId), ...[...acc.keys()].filter((key) => key.startsWith("user:")).map((key) => key.slice(5))])
  for (const userId of userIds) {
    const data = acc.get(`user:${userId}`)
    const assigned = sources.assignments.filter((assignment) => assignment.userId === userId).map((assignment) => assignment.elementId)
    judges.push({
      key: `user:${userId}`,
      name: sources.users.find((user) => user.id === userId)?.name ?? "Tundmatu kasutaja",
      kind: "USER",
      elements: elementRefs(new Set([...assigned, ...(data?.elementIds ?? [])])),
      entries: data?.entries ?? 0,
      lastEntryAt: data?.last ?? null,
      minutesAgo: data?.last ? minutesBetween(data.last, now) : null,
      lastOpenedAt: null,
    })
  }
  judges.sort((a, b) => (a.lastEntryAt ? 0 : 1) - (b.lastEntryAt ? 0 : 1) || (a.minutesAgo ?? 0) - (b.minutesAgo ?? 0) || a.name.localeCompare(b.name, "et"))

  const withResults = new Set(results.map((result) => result.elementId))
  const silentElements = elements
    .filter((element) => !element.isCancelled && TRACKED_ELEMENT_TYPES.includes(element.type) && !withResults.has(element.id))
    .sort((a, b) => a.order - b.order)
    .map(ref)
  return { judges, silentElements }
}

// ─── Katkestamised ja staatused ──────────────────────────────────────────────
type TeamRef = { id: string; code: string; name: string; class: string | null }
const teamRef = (team: DashTeam): TeamRef => ({ id: team.id, code: team.code, name: team.name, class: team.class })

export type Withdrawals = {
  counts: { inComp: number; horsConcours: number; dnf: number; dns: number; dq: number }
  dnf: { team: TeamRef; from: ElementRef | null; reason: string | null }[]
  dq: { team: TeamRef; from: ElementRef | null }[]
  dns: TeamRef[]
  horsConcours: { team: TeamRef; from: ElementRef | null }[]
  members: { team: TeamRef; description: string; element: ElementRef | null; time: string | null; reason: string | null }[]
}

export function withdrawals(teams: DashTeam[], elements: DashElement[], miscEntries: DashMiscEntry[]): Withdrawals {
  const byOrder = new Map(elements.map((element) => [element.order, element]))
  const byId = new Map(elements.map((element) => [element.id, element]))
  const at = (order: number | null) => (order != null && byOrder.has(order) ? ref(byOrder.get(order)!) : null)
  const sorted = [...teams].sort((a, b) => a.code.localeCompare(b.code, "et", { numeric: true }))
  const isHc = (team: DashTeam) => team.isHorsDeCompetition || team.hcFromElementOrder != null
  const abandonmentIds = new Set(elements.filter((element) => element.type === "ABANDONMENT").map((element) => element.id))
  const teamById = new Map(teams.map((team) => [team.id, team]))
  return {
    counts: {
      inComp: teams.filter((team) => !isHc(team) && team.dnfFromElementOrder == null && !team.dnsFlag).length,
      horsConcours: teams.filter(isHc).length,
      dnf: teams.filter((team) => team.dnfFromElementOrder != null).length,
      dns: teams.filter((team) => team.dnsFlag).length,
      dq: teams.filter((team) => team.dqFromElementOrder != null).length,
    },
    dnf: sorted.filter((team) => team.dnfFromElementOrder != null).map((team) => ({ team: teamRef(team), from: at(team.dnfFromElementOrder), reason: team.dnfReason })),
    dq: sorted.filter((team) => team.dqFromElementOrder != null).map((team) => ({ team: teamRef(team), from: at(team.dqFromElementOrder) })),
    dns: sorted.filter((team) => team.dnsFlag).map(teamRef),
    horsConcours: sorted.filter(isHc).map((team) => ({ team: teamRef(team), from: at(team.hcFromElementOrder) })),
    members: miscEntries
      .filter((entry) => abandonmentIds.has(entry.elementId) && teamById.has(entry.teamId))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((entry) => ({
        team: teamRef(teamById.get(entry.teamId)!),
        description: entry.description,
        element: entry.abandonElementId && byId.has(entry.abandonElementId) ? ref(byId.get(entry.abandonElementId)!) : null,
        time: entry.abandonTime,
        reason: entry.reason,
      })),
  }
}
