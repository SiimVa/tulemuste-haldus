export type AthletePointsMode = "HIDDEN" | "EXACT" | "RANGE"
export type RangeBucket = { maxPct: number; label: string }

export const DEFAULT_RANGES: RangeBucket[] = [
  { maxPct: 33, label: "Nõrk" },
  { maxPct: 66, label: "Keskmine" },
  { maxPct: 100, label: "Hea" },
]

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export function parseRanges(json: string | null | undefined): RangeBucket[] {
  try {
    const arr = JSON.parse(json ?? "[]")
    if (Array.isArray(arr) && arr.length > 0) {
      return arr
        .map((b) => ({ maxPct: Number(b.maxPct), label: String(b.label ?? "") }))
        .filter((b) => !isNaN(b.maxPct))
        .sort((a, b) => a.maxPct - b.maxPct)
    }
  } catch {}
  return DEFAULT_RANGES
}

// Vormindab punktid sportlasele vastavalt režiimile. Tagastab null kui peidetud.
// scoringMode arvestab, et karistussüsteemis on väiksem skoor parem.
export function formatAthletePoints(
  score: number,
  maxValue: number,
  mode: AthletePointsMode,
  ranges: RangeBucket[],
  scoringMode: "PENALTY" | "PLUS"
): string | null {
  if (mode === "HIDDEN") return null
  if (mode === "EXACT") return `${round1(score)}p`

  // RANGE — protsendipõhised vahemikud
  if (!maxValue || maxValue <= 0 || ranges.length === 0) return `${round1(score)}p`
  // Sooritus 0–1 (suurem = parem) sõltumata punktisüsteemist
  const raw = score / maxValue
  const perfPct = Math.max(0, Math.min(100, (scoringMode === "PLUS" ? raw : 1 - raw) * 100))
  const sorted = [...ranges].sort((a, b) => a.maxPct - b.maxPct)
  let prevPct = 0
  for (let i = 0; i < sorted.length; i++) {
    const b = sorted[i]
    const isLast = i === sorted.length - 1
    if (perfPct <= b.maxPct || isLast) {
      // Numbriline vahemik tegelikes punktides
      let lo: number, hi: number
      if (scoringMode === "PLUS") {
        lo = (prevPct / 100) * maxValue
        hi = (b.maxPct / 100) * maxValue
      } else {
        // Karistus: sooritus [prevPct, maxPct] ↔ karistus [(1-maxPct)·max, (1-prevPct)·max]
        lo = (1 - b.maxPct / 100) * maxValue
        hi = (1 - prevPct / 100) * maxValue
      }
      const loR = round1(Math.min(lo, hi))
      const hiR = round1(Math.max(lo, hi))
      return b.label ? `${b.label} (${loR}–${hiR}p)` : `${loR}–${hiR}p`
    }
    prevPct = b.maxPct
  }
  return `${round1(score)}p`
}
