import { resultExceptionKind, resultKeepsValues } from "../exceptionKinds"
import type { StandingRow } from "./standings"
import { ROUTE_ELEMENT_TYPES, round2, type DashElement, type DashPenalty, type DashResult, type DashScore, type ScoringMode } from "./types"

type ElementRef = { id: string; code: string; name: string }
type TeamRef = { id: string; code: string; name: string; class: string | null }
const ref = (element: DashElement): ElementRef => ({ id: element.id, code: element.code, name: element.name })
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length

function routeElements(elements: DashElement[]) {
  return elements.filter((element) => !element.isCancelled && ROUTE_ELEMENT_TYPES.includes(element.type)).sort((a, b) => a.order - b.order)
}

// Analüüs arvestab pingereas osalevaid võistkondi (arvestusvälised ja
// katkestanud jäävad välja), et võrrelda ühtviisi hinnatud tulemusi.
function elementScores(standings: StandingRow[], elementId: string) {
  return standings.flatMap((row) => (Number.isFinite(row.byElement[elementId]) ? [{ row, points: row.byElement[elementId] }] : []))
}

// ─── Raskusaste ──────────────────────────────────────────────────────────────
export type DifficultyRow = ElementRef & {
  n: number
  average: number
  best: number
  averageLoss: number
  maxValue: number | null
  lossPct: number | null
  // Erandiga (ei läbinud, ei sooritanud, muu) ja ebaõnnestunud eraldi.
  notDonePct: number | null
  failedPct: number | null
}

export function difficultyRows(
  elements: DashElement[],
  standings: StandingRow[],
  results: DashResult[],
  scoringMode: ScoringMode,
  defaults: { kpMax: number; pkMax: number }
): DifficultyRow[] {
  const eligible = new Set(standings.map((row) => row.team.id))
  return routeElements(elements).flatMap((element) => {
    const scores = elementScores(standings, element.id).map((item) => item.points)
    if (scores.length === 0) return []
    const best = scoringMode === "PLUS" ? Math.max(...scores) : Math.min(...scores)
    const averageLoss = mean(scores.map((points) => Math.abs(points - best)))
    const maxValue = element.maxValue ?? (element.type === "PENALTY_BOX" ? defaults.pkMax : defaults.kpMax)
    const elementResults = results.filter((result) => result.elementId === element.id && eligible.has(result.teamId))
    const kinds = elementResults.map((result) => resultExceptionKind(result.exceptionLabel, element.exceptions))
    const notDone = kinds.filter((kind) => kind != null && kind !== "FAILED").length
    const failed = kinds.filter((kind) => kind === "FAILED").length
    return [{
      ...ref(element),
      n: scores.length,
      average: round2(mean(scores)),
      best: round2(best),
      averageLoss: round2(averageLoss),
      maxValue: maxValue > 0 ? maxValue : null,
      lossPct: maxValue > 0 ? round2(Math.min(100, (averageLoss / maxValue) * 100)) : null,
      notDonePct: elementResults.length ? round2((notDone / elementResults.length) * 100) : null,
      failedPct: elementResults.length ? round2((failed / elementResults.length) * 100) : null,
    }]
  }).sort((a, b) => (b.lossPct ?? -1) - (a.lossPct ?? -1) || b.averageLoss - a.averageLoss)
}

// ─── Eristusvõime ────────────────────────────────────────────────────────────
function ranksOf(values: number[]): number[] {
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value)
  const ranks = new Array<number>(values.length)
  for (let start = 0; start < order.length;) {
    let end = start
    while (end + 1 < order.length && order[end + 1].value === order[start].value) end++
    const average = (start + end) / 2 + 1
    for (let i = start; i <= end; i++) ranks[order[i].index] = average
    start = end + 1
  }
  return ranks
}

function pearson(x: number[], y: number[]): number | null {
  if (x.length < 3) return null
  const mx = mean(x), my = mean(y)
  let sxy = 0, sxx = 0, syy = 0
  for (let i = 0; i < x.length; i++) {
    sxy += (x[i] - mx) * (y[i] - my)
    sxx += (x[i] - mx) ** 2
    syy += (y[i] - my) ** 2
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null
}

export function spearman(x: number[], y: number[]): number | null {
  return pearson(ranksOf(x), ranksOf(y))
}

export type DiscriminationRow = ElementRef & {
  n: number
  stdDev: number
  range: number
  // Seos ülejäänud tulemusega (−1…1): positiivne tähendab, et KP-s hästi
  // esinenud võistkonnad olid ka ülejäänud võistlusel eespool.
  correlation: number | null
}

export function discriminationRows(elements: DashElement[], standings: StandingRow[]): DiscriminationRow[] {
  return routeElements(elements).flatMap((element) => {
    const items = elementScores(standings, element.id)
    if (items.length === 0) return []
    const points = items.map((item) => item.points)
    const average = mean(points)
    const stdDev = Math.sqrt(mean(points.map((value) => (value - average) ** 2)))
    // Element ise on kogusummas, seega võrreldakse ülejäänud summaga.
    const correlation = spearman(points, items.map((item) => item.row.total - item.points))
    return [{
      ...ref(element),
      n: items.length,
      stdDev: round2(stdDev),
      range: round2(Math.max(...points) - Math.min(...points)),
      correlation: correlation == null ? null : round2(correlation),
    }]
  }).sort((a, b) => b.stdDev - a.stdDev)
}

// ─── Klasside võrdlus ────────────────────────────────────────────────────────
export type ClassComparison = {
  classes: string[]
  rows: (ElementRef & { averages: (number | null)[]; counts: number[]; bestClass: string | null })[]
  totals: (number | null)[]
}

export function classComparison(elements: DashElement[], standings: StandingRow[], classes: string[], scoringMode: ScoringMode): ClassComparison {
  const used = classes.filter((name) => standings.some((row) => row.team.class === name))
  const better = (a: number, b: number) => (scoringMode === "PLUS" ? a > b : a < b)
  const rows = routeElements(elements).flatMap((element) => {
    const averages: (number | null)[] = []
    const counts: number[] = []
    for (const name of used) {
      const points = elementScores(standings.filter((row) => row.team.class === name), element.id).map((item) => item.points)
      averages.push(points.length ? round2(mean(points)) : null)
      counts.push(points.length)
    }
    if (counts.every((count) => count === 0)) return []
    let bestClass: string | null = null
    let bestValue: number | null = null
    for (let index = 0; index < used.length; index++) {
      const value = averages[index]
      if (value == null) continue
      if (bestValue == null || better(value, bestValue)) { bestValue = value; bestClass = used[index] }
      else if (value === bestValue) bestClass = null
    }
    return [{ ...ref(element), averages, counts, bestClass }]
  })
  const totals = used.map((name) => {
    const values = standings.filter((row) => row.team.class === name).map((row) => row.total)
    return values.length ? round2(mean(values)) : null
  })
  return { classes: used, rows, totals }
}

// ─── Ajakulu KP-s ────────────────────────────────────────────────────────────
// Kestus on kujul h:mm:ss, m:ss või ss (nagu kestuse sisestusväljal).
export function timeToSeconds(value: unknown): number | null {
  const raw = String(value ?? "").trim()
  if (!/^\d{1,3}(:\d{1,2}){0,2}$/.test(raw)) return null
  const parts = raw.split(":").map(Number)
  return parts.reduce((total, part) => total * 60 + part, 0)
}

// Ajavahemiku algus ja lõpp on kellaajad: HH:MM või HH:MM:SS.
export function clockToSeconds(value: unknown): number | null {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(value ?? "").trim())
  if (!match) return null
  const [hours, minutes, seconds] = [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)]
  if (hours > 23 || minutes > 59 || seconds > 59) return null
  return hours * 3600 + minutes * 60 + seconds
}

export type TimeSpentRow = ElementRef & {
  fieldLabel: string
  kind: "RANGE" | "DURATION"
  n: number
  averageSeconds: number
  medianSeconds: number
  fastest: { team: TeamRef; seconds: number }
  slowest: { team: TeamRef; seconds: number }
  peakConcurrent: number | null
  peakAtSeconds: number | null
}

export function timeSpentRows(elements: DashElement[], results: DashResult[], teams: TeamRef[]): TimeSpentRow[] {
  const teamById = new Map(teams.map((team) => [team.id, team]))
  return elements.filter((element) => !element.isCancelled).sort((a, b) => a.order - b.order).flatMap((element) => {
    const field = element.inputFields.find((item) => item.type === "TIME_RANGE")
      ?? element.inputFields.find((item) => item.type === "TIME" && item.rankingPriority != null)
      ?? element.inputFields.find((item) => item.type === "TIME")
    if (!field) return []
    const durations: { team: TeamRef; seconds: number }[] = []
    const intervals: [number, number][] = []
    for (const result of results) {
      // Ebaõnnestunud tegid ülesande, seega nende aeg loeb.
      if (result.elementId !== element.id || !resultKeepsValues(result, element.exceptions)) continue
      const team = teamById.get(result.teamId)
      if (!team) continue
      if (field.type === "TIME_RANGE") {
        const start = clockToSeconds(result.values[`${field.name}_start`])
        const end = clockToSeconds(result.values[`${field.name}_end`])
        if (start == null || end == null) continue
        const seconds = end >= start ? end - start : end + 86_400 - start
        if (seconds <= 0) continue
        durations.push({ team, seconds })
        intervals.push([start, start + seconds])
      } else {
        const seconds = timeToSeconds(result.values[field.name])
        if (seconds == null || seconds <= 0) continue
        durations.push({ team, seconds })
      }
    }
    if (durations.length === 0) return []
    const sorted = [...durations].sort((a, b) => a.seconds - b.seconds)
    const middle = Math.floor(sorted.length / 2)
    let peakConcurrent: number | null = null
    let peakAtSeconds: number | null = null
    if (field.type === "TIME_RANGE") {
      // Lõpp enne algust samal hetkel: lahkuja ei kattu saabujaga.
      const events = intervals.flatMap(([start, end]) => [[start, 1], [end, -1]] as [number, number][])
        .sort((a, b) => a[0] - b[0] || a[1] - b[1])
      let current = 0
      peakConcurrent = 0
      for (const [time, delta] of events) {
        current += delta
        if (current > peakConcurrent) { peakConcurrent = current; peakAtSeconds = time % 86_400 }
      }
    }
    return [{
      ...ref(element),
      fieldLabel: field.label,
      kind: field.type === "TIME_RANGE" ? "RANGE" as const : "DURATION" as const,
      n: durations.length,
      averageSeconds: Math.round(mean(durations.map((item) => item.seconds))),
      medianSeconds: sorted.length % 2 ? sorted[middle].seconds : Math.round((sorted[middle - 1].seconds + sorted[middle].seconds) / 2),
      fastest: sorted[0],
      slowest: sorted[sorted.length - 1],
      peakConcurrent,
      peakAtSeconds,
    }]
  })
}

// ─── Karistused ──────────────────────────────────────────────────────────────
export const PENALTY_ELEMENT_TYPES = ["COUNTER_ACTION", "EQUIPMENT_CHECK", "LATENESS"]

export type PenaltySummary = {
  elements: (ElementRef & {
    type: string
    teamsAffected: number
    totalPoints: number
    fields: { label: string; total: number; teams: number }[]
  })[]
  manual: { count: number; teams: number; totalPoints: number; byDescription: { description: string; count: number; points: number }[] }
}

export function penaltySummary(elements: DashElement[], scores: DashScore[], results: DashResult[], penalties: DashPenalty[]): PenaltySummary {
  const summaries = elements
    .filter((element) => !element.isCancelled && PENALTY_ELEMENT_TYPES.includes(element.type))
    .sort((a, b) => a.order - b.order)
    .map((element) => {
      const elementScores = scores.filter((score) => score.elementId === element.id && Math.abs(score.points) > 0)
      const elementResults = results.filter((result) => result.elementId === element.id)
      return {
        ...ref(element),
        type: element.type,
        teamsAffected: elementScores.length,
        totalPoints: round2(elementScores.reduce((sum, score) => sum + Math.abs(score.points), 0)),
        fields: element.inputFields.filter((field) => field.type === "NUMBER").map((field) => {
          const values = elementResults.map((result) => Number(String(result.values[field.name] ?? "").replace(",", "."))).filter((value) => Number.isFinite(value) && value > 0)
          return { label: field.label, total: round2(values.reduce((sum, value) => sum + value, 0)), teams: values.length }
        }),
      }
    })
  const groups = new Map<string, { description: string; count: number; points: number }>()
  for (const penalty of penalties) {
    const description = penalty.description.trim() || "Kirjelduseta"
    const key = description.toLocaleLowerCase("et")
    const group = groups.get(key) ?? { description, count: 0, points: 0 }
    group.count++
    group.points = round2(group.points + penalty.points)
    groups.set(key, group)
  }
  return {
    elements: summaries,
    manual: {
      count: penalties.length,
      teams: new Set(penalties.map((penalty) => penalty.teamId)).size,
      totalPoints: round2(penalties.reduce((sum, penalty) => sum + penalty.points, 0)),
      byDescription: [...groups.values()].sort((a, b) => b.count - a.count || b.points - a.points).slice(0, 10),
    },
  }
}
