// Calendar-day aggregates use UTC consistently in storage, comparisons and UI.
export const DAY_MS = 86_400_000
export type DailyRegistration = {
  day: string
  submitted: number
  active: number
  confirmed: number
  withdrawn: number
  rejected: number
}
export type RegistrationStatistics = {
  version: 1
  asOf: string
  opensAt: string | null
  closesAt: string | null
  capacity: number | null
  days: DailyRegistration[]
  undatedTeams: number
  incompleteHistories: number
}
type Application = {
  submittedAt: Date | null
  status: string
  events: { createdAt: Date; toStatus: string; fromStatus?: string | null }[]
}
const active = (status: string) => ["PENDING_REVIEW", "CHANGES_REQUESTED", "CONFIRMED", "WAITLISTED", "SUBMITTED", "APPROVED"].includes(status)
const confirmed = (status: string) => ["CONFIRMED", "APPROVED"].includes(status)
export const utcDay = (value: Date | string) => new Date(value).toISOString().slice(0, 10)
const emptyDay = (day: string): DailyRegistration => ({ day, submitted: 0, active: 0, confirmed: 0, withdrawn: 0, rejected: 0 })

export function buildRegistrationStatistics(input: {
  applications: Application[]
  opensAt: Date | null
  closesAt: Date | null
  capacity: number | null
  undatedTeams?: number
}, now = new Date()): RegistrationStatistics {
  const changes = new Map<string, DailyRegistration>()
  const bucket = (date: Date) => {
    const day = utcDay(date)
    if (!changes.has(day)) changes.set(day, emptyDay(day))
    return changes.get(day)!
  }
  let incompleteHistories = 0
  for (const app of input.applications) {
    if (!app.submittedAt || app.submittedAt > now) continue
    const events = app.events.filter(e => e.createdAt <= now)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    if (!events.length || events[0].fromStatus != null || events[events.length - 1].toStatus !== app.status) incompleteHistories++
    // Older records without an event log still provide a submission count.
    let status = events.length && events[0].fromStatus == null
      ? events[0].toStatus : "PENDING_REVIEW"
    const first = bucket(app.submittedAt)
    first.submitted++
    first.active += Number(active(status))
    first.confirmed += Number(confirmed(status))
    first.withdrawn += Number(status === "WITHDRAWN")
    first.rejected += Number(status === "REJECTED")
    for (const event of events) {
      const row = bucket(new Date(Math.max(event.createdAt.getTime(), app.submittedAt.getTime())))
      row.active += Number(active(event.toStatus)) - Number(active(status))
      row.confirmed += Number(confirmed(event.toStatus)) - Number(confirmed(status))
      row.withdrawn += Number(event.toStatus === "WITHDRAWN") - Number(status === "WITHDRAWN")
      row.rejected += Number(event.toStatus === "REJECTED") - Number(status === "REJECTED")
      status = event.toStatus
    }
    // A missing historical transition cannot be dated reliably; reconcile at asOf.
    if (status !== app.status) {
      const row = bucket(now)
      row.active += Number(active(app.status)) - Number(active(status))
      row.confirmed += Number(confirmed(app.status)) - Number(confirmed(status))
      row.withdrawn += Number(app.status === "WITHDRAWN") - Number(status === "WITHDRAWN")
      row.rejected += Number(app.status === "REJECTED") - Number(status === "REJECTED")
    }
  }
  if (input.opensAt && input.opensAt <= now) bucket(input.opensAt)
  bucket(now)
  let totals = emptyDay("")
  const days = [...changes.values()].sort((a, b) => a.day.localeCompare(b.day)).map(row => {
    totals = {
      day: row.day, submitted: totals.submitted + row.submitted,
      active: totals.active + row.active, confirmed: totals.confirmed + row.confirmed,
      withdrawn: totals.withdrawn + row.withdrawn, rejected: totals.rejected + row.rejected,
    }
    return totals
  })
  return { version: 1, asOf: now.toISOString(), opensAt: input.opensAt?.toISOString() ?? null,
    closesAt: input.closesAt?.toISOString() ?? null, capacity: input.capacity,
    days, undatedTeams: input.undatedTeams ?? 0, incompleteHistories }
}

export function parseRegistrationStatistics(value: string | null): RegistrationStatistics | null {
  if (!value) return null
  try {
    const data = JSON.parse(value) as RegistrationStatistics
    const validDate = (v: unknown) => typeof v === "string" && Number.isFinite(Date.parse(v))
    if (data.version !== 1 || !validDate(data.asOf) ||
      !(data.opensAt === null || validDate(data.opensAt)) || !(data.closesAt === null || validDate(data.closesAt)) ||
      !(data.capacity === null || Number.isInteger(data.capacity) && data.capacity >= 0) ||
      !Number.isInteger(data.incompleteHistories) || data.incompleteHistories < 0 || !Number.isInteger(data.undatedTeams) || data.undatedTeams < 0 || !Array.isArray(data.days) || !data.days.length) return null
    if (!data.days.every((d, i) => /^\d{4}-\d{2}-\d{2}$/.test(d.day) && validDate(d.day) &&
      [d.submitted, d.active, d.confirmed, d.withdrawn, d.rejected].every(n => Number.isInteger(n) && n >= 0) &&
      (i === 0 || d.day > data.days[i - 1].day))) return null
    return data
  } catch { return null }
}

export function registrationAt(stats: RegistrationStatistics, date: Date): DailyRegistration {
  const day = utcDay(date)
  return [...stats.days].reverse().find(row => row.day <= day) ?? emptyDay(day)
}
export type Forecast = { estimate: number; low: number; high: number; participants: number; explanation: string }
function prediction(estimate: number, low: number, high: number, capacity: number | null, explanation: string): Forecast {
  const count = Math.max(0, Math.round(estimate))
  return { estimate: count, low: Math.max(0, Math.floor(low)), high: Math.max(count, Math.ceil(high)),
    participants: capacity === null ? count : Math.min(count, capacity), explanation }
}
export function tempoForecast(stats: RegistrationStatistics, now = new Date()): { forecast: Forecast | null; reason: string; rate: number; remaining: number } {
  const current = stats.days[stats.days.length - 1]
  const closes = stats.closesAt ? new Date(stats.closesAt) : null
  const remaining = closes ? Math.max(0, (closes.getTime() - now.getTime()) / DAY_MS) : 0
  const start = stats.opensAt ? new Date(stats.opensAt) : new Date(stats.days[0].day)
  const elapsed = (new Date(utcDay(now)).getTime() - new Date(utcDay(start)).getTime()) / DAY_MS
  const base = { forecast: null, rate: 0, remaining }
  if (!closes) return { ...base, reason: "Määra registreerimise lõpptähtaeg." }
  if (remaining === 0) return { ...base, reason: "Registreerimise tähtaeg on möödunud." }
  if (elapsed < 3 || current.submitted < 5) return { ...base, reason: "Prognoos vajab vähemalt 3 päeva ajalugu ja 5 esitatud avaldust." }
  // Exclude the incomplete current UTC day from both rate windows.
  const today = new Date(utcDay(now)).getTime()
  const yesterday = registrationAt(stats, new Date(today - DAY_MS))
  const windowRate = (length: number) => {
    const days = Math.min(length, elapsed)
    const before = registrationAt(stats, new Date(today - (days + 1) * DAY_MS))
    return (yesterday.active - before.active) / days
  }
  const short = windowRate(7), long = windowRate(14)
  const rate = 0.65 * short + 0.35 * long
  const estimate = current.active + rate * remaining
  // Scenario bounds, deliberately not labelled as a statistical confidence interval.
  const spread = Math.max(2, Math.abs(short - long) * remaining, Math.sqrt(Math.max(1, current.submitted)) * Math.sqrt(remaining / Math.max(1, elapsed)))
  return { rate, remaining, reason: "", forecast: prediction(estimate, estimate - spread, estimate + spread, stats.capacity,
    "Viimase 7 täispäeva netotempo kaal 65%, kuni 14 täispäeva kaal 35%. Netotempo sisaldab loobumisi ja tagasilükkamisi. Vahemik on stsenaariumihinnang, mitte statistiline usaldusvahemik.") }
}

export function historicalForecast(stats: RegistrationStatistics, references: RegistrationStatistics[], now = new Date()): { forecast: Forecast | null; used: number; reason: string } {
  const remaining = stats.closesAt ? (new Date(stats.closesAt).getTime() - now.getTime()) / DAY_MS : 0
  const current = stats.days[stats.days.length - 1].active
  if (remaining <= 0 || current < 1) return { forecast: null, used: 0, reason: "Vaja on tulevast lõpptähtaega ja vähemalt üht aktiivset registreeringut." }
  const estimates = references.flatMap(ref => {
    if (!ref.closesAt || ref.undatedTeams > 0 || ref.incompleteHistories > 0) return []
    const end = new Date(ref.closesAt)
    if (end > now || new Date(ref.asOf) < end) return []
    const equivalent = new Date(end.getTime() - remaining * DAY_MS)
    if (ref.opensAt && equivalent < new Date(ref.opensAt)) return []
    const then = registrationAt(ref, equivalent).active
    const final = registrationAt(ref, end).active
    if (then < 3 || final < 1) return []
    return [current * final / then]
  }).sort((a, b) => a - b)
  if (!estimates.length) return { forecast: null, used: 0, reason: "Vali lõppenud võistlused, millel oli samal ajal enne tähtaega vähemalt 3 aktiivset registreeringut ja olemas täielik registreerimisajalugu." }
  const middle = Math.floor(estimates.length / 2)
  const estimate = estimates.length % 2 ? estimates[middle] : (estimates[middle - 1] + estimates[middle]) / 2
  const margin = Math.max(2, estimate * (estimates.length === 1 ? 0.25 : 0.1))
  return { used: estimates.length, reason: "", forecast: prediction(estimate, Math.min(...estimates) - margin, Math.max(...estimates) + margin, stats.capacity,
    `Võrdleb aktiivsete registreeringute arvu sama palju päevi enne tähtaega ning tähtajal. Kasutab ${estimates.length} võistluse hinnangute mediaani. Vahemik kirjeldab stsenaariume; ühe võrdluse korral on hinnang eriti ebakindel.`) }
}
