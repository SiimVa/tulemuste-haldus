// Korraldaja kokkuvõte registreerimise ja mandaadi sündmustest. Puhas loogika:
// ajastus ja kirja read. Andmebaasi osa on organizerDigest.server.ts-is.

import { mandateProgress, type MandateWorkflowStatus } from "./registrationDashboard"

export const ORGANIZER_DIGEST_TYPE = "ORGANIZER_DIGEST"

export const DIGEST_INTERVALS = ["IMMEDIATE", "HOURLY", "DAILY", "WEEKLY"] as const
export type DigestInterval = (typeof DIGEST_INTERVALS)[number]

export const DIGEST_INTERVAL_LABELS: Record<DigestInterval, string> = {
  IMMEDIATE: "Kohe (kuni 5 min jooksul)",
  HOURLY: "Kord tunnis",
  DAILY: "Kord päevas kell 8",
  WEEKLY: "Kord nädalas esmaspäeval kell 8",
}

export function isDigestInterval(value: unknown): value is DigestInterval {
  return typeof value === "string" && (DIGEST_INTERVALS as readonly string[]).includes(value)
}

// ─── Ajastus ────────────────────────────────────────────────────────────────
// Päeva- ja nädalakokkuvõte saadetakse Eesti aja järgi kell 8.

const TIME_ZONE = "Europe/Tallinn"
const DIGEST_HOUR = 8
const HOUR_MS = 60 * 60 * 1000

const zonedFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  hourCycle: "h23",
  year: "numeric", month: "numeric", day: "numeric",
  hour: "numeric", minute: "numeric", second: "numeric",
})

function zonedParts(date: Date) {
  const parts = Object.fromEntries(zonedFormat.formatToParts(date).map((part) => [part.type, part.value]))
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second),
  }
}

// Kui palju on Tallinna kell antud hetkel UTC-st ees.
function zoneOffsetMs(date: Date) {
  const p = zonedParts(date)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUtc - Math.floor(date.getTime() / 1000) * 1000
}

// Tallinna seinakella aeg → UTC hetk. Kuupäev võib üle kuu piiri minna
// (Date.UTC normaliseerib).
function tallinnTime(year: number, month: number, day: number, hour: number): Date {
  const guess = Date.UTC(year, month - 1, day, hour)
  const first = guess - zoneOffsetMs(new Date(guess))
  return new Date(guess - zoneOffsetMs(new Date(first)))
}

// Järgmine saatmisaeg rangelt pärast hetke `after`.
export function nextDigestAt(interval: DigestInterval, after: Date): Date {
  if (interval === "IMMEDIATE") return after
  if (interval === "HOURLY") return new Date((Math.floor(after.getTime() / HOUR_MS) + 1) * HOUR_MS)

  const today = zonedParts(after)
  // Date.UTC kaudu nädalapäev: 0 = pühapäev … 6 = laupäev.
  const weekday = new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay()
  const startOffset = interval === "WEEKLY" ? -((weekday + 6) % 7) : 0
  const stepDays = interval === "WEEKLY" ? 7 : 1
  let candidate = tallinnTime(today.year, today.month, today.day + startOffset, DIGEST_HOUR)
  for (let step = 1; candidate.getTime() <= after.getTime(); step++) {
    candidate = tallinnTime(today.year, today.month, today.day + startOffset + step * stepDays, DIGEST_HOUR)
  }
  return candidate
}

// ─── Kirja sisu ─────────────────────────────────────────────────────────────

export type DigestApplicationEvent = {
  applicationId: string
  teamName: string
  fromStatus: string | null
  toStatus: string
  actorId: string | null
  createdAt: Date
}

export type DigestTeamSubmission = {
  teamName: string
  status: string
  automatic: boolean
}

export type DigestInput = {
  competitionName: string
  subscriberId: string
  registration: boolean
  mandate: boolean
  applicationEvents: DigestApplicationEvent[]
  // Vanemas töövoos (avalduseta) esitatud registreeringud.
  teamRegistrations: DigestTeamSubmission[]
  mandateSubmissions: DigestTeamSubmission[]
  applicationStatuses: string[]
  teamMandateStatuses: string[]
}

const APPLICATION_STATUS_LABELS: Record<string, string> = {
  PENDING_REVIEW: "ootab ülevaatust",
  CHANGES_REQUESTED: "vajab täiendamist",
  CONFIRMED: "kinnitatud",
  WAITLISTED: "ootenimekirjas",
  REJECTED: "tagasi lükatud",
  WITHDRAWN: "tagasi võetud",
}

const isNew = (status: string | null) => status === null || status === "DRAFT"

// Ühe avalduse perioodi sündmused koondatakse üheks reaks: algne ja lõplik
// olek. Korraldaja enda otsuseid ja olekut mittemuutvaid muudatusi ei näidata.
function applicationLine(events: DigestApplicationEvent[], subscriberId: string): string | null {
  const first = events[0]
  const last = events[events.length - 1]
  const from = first.fromStatus
  const to = last.toStatus
  const name = `„${last.teamName}”`
  if (isNew(from)) {
    if (to === "WITHDRAWN") return `${name} registreeris ja võttis registreeringu tagasi`
    return `Uus registreering: ${name} (${APPLICATION_STATUS_LABELS[to] ?? to})`
  }
  if (from === to) return null
  if (to === "WITHDRAWN") return `${name} võttis registreeringu tagasi`
  if (from === "WAITLISTED" && to === "CONFIRMED") return `${name} sai ootenimekirjast koha`
  if (from === "CHANGES_REQUESTED") return `${name} esitas parandatud registreeringu (${APPLICATION_STATUS_LABELS[to] ?? to})`
  if (last.actorId === subscriberId) return null
  return `${name}: ${APPLICATION_STATUS_LABELS[to] ?? to}`
}

function registrationLines(input: DigestInput): string[] {
  const byApplication = new Map<string, DigestApplicationEvent[]>()
  for (const event of [...input.applicationEvents].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    const list = byApplication.get(event.applicationId) ?? []
    list.push(event)
    byApplication.set(event.applicationId, list)
  }
  const lines = [...byApplication.values()]
    .map((events) => applicationLine(events, input.subscriberId))
    .filter((line): line is string => line !== null)
  for (const team of input.teamRegistrations) {
    lines.push(team.automatic
      ? `„${team.teamName}” registreeris ja kinnitati automaatselt`
      : `„${team.teamName}” esitas registreeringu (ootab kinnitust)`)
  }
  return lines
}

function mandateLines(input: DigestInput): string[] {
  return input.mandateSubmissions.map((team) => team.automatic
    ? `„${team.teamName}” esitas mandaadi (kinnitati automaatselt)`
    : `„${team.teamName}” esitas mandaadi (ootab kinnitust)`)
}

function registrationSummary(statuses: string[]): string {
  const count = (status: string) => statuses.filter((item) => item === status).length
  return `Registreerimise seis: ${count("CONFIRMED")} registreeritud, ${count("PENDING_REVIEW")} ootab ülevaatust, ${count("WAITLISTED")} ootenimekirjas.`
}

function mandateSummary(statuses: string[]): string {
  const progress = mandateProgress(statuses.map((status) => ({ mandateStatus: status as MandateWorkflowStatus })))
  return `Mandaadi seis: ${progress.done}/${progress.total} võistkonda on mandaadi esitanud (${progress.approved} kinnitatud, ${progress.submitted} ootab kinnitust, ${progress.changesRequested} vajab parandamist).`
}

export type DigestContent = { title: string; lines: string[] }

// Tagastab null, kui tellitud teemadel uusi sündmusi pole: tühja kirja ei saadeta.
export function buildOrganizerDigest(input: DigestInput): DigestContent | null {
  const registration = input.registration ? registrationLines(input) : []
  const mandate = input.mandate ? mandateLines(input) : []
  if (registration.length === 0 && mandate.length === 0) return null

  const lines: string[] = [...registration, ...mandate]
  if (input.registration && input.applicationStatuses.length > 0) lines.push(registrationSummary(input.applicationStatuses))
  if (input.mandate && input.teamMandateStatuses.length > 0) lines.push(mandateSummary(input.teamMandateStatuses))

  const topic = input.registration && input.mandate
    ? "Registreerimine ja mandaat"
    : input.registration ? "Registreerimine" : "Mandaat"
  const count = registration.length + mandate.length
  return { title: `${topic}: ${count} ${count === 1 ? "uus sündmus" : "uut sündmust"}`, lines }
}
