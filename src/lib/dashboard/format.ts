// Töölaua arvude ja aegade eestikeelne vormindus. Serveris renderdatud ajad
// näidatakse alati Eesti ajas, sest server võib töötada UTC-s.

const TIME_ZONE = "Europe/Tallinn"

export function formatNumber(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "–"
  return value.toLocaleString("et-EE", { minimumFractionDigits: 0, maximumFractionDigits: digits })
}

export function formatPercent(value: number | null | undefined, digits = 0): string {
  return value == null ? "–" : `${formatNumber(value, digits)}%`
}

export function formatMinutes(minutes: number | null | undefined): string {
  if (minutes == null) return "–"
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours < 48) return rest ? `${hours} h ${rest} min` : `${hours} h`
  return `${Math.floor(hours / 24)} p ${hours % 24} h`
}

export function formatClock(date: Date | null | undefined): string {
  if (!date) return "–"
  return date.toLocaleTimeString("et-EE", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit" })
}

export function formatDateTime(date: Date | null | undefined): string {
  if (!date) return "–"
  return date.toLocaleString("et-EE", { timeZone: TIME_ZONE, day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "–"
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = Math.floor(seconds % 60)
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`
    : `${minutes}:${String(rest).padStart(2, "0")}`
}

export function formatSecondsOfDay(seconds: number | null | undefined): string {
  if (seconds == null) return "–"
  return `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}`
}

export function pointsUnit(scoringMode: "PENALTY" | "PLUS") {
  return scoringMode === "PLUS" ? "p" : "karistuspunkti"
}
