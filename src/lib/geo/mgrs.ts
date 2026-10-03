import { forward, toPoint } from "mgrs"

export type GeoPoint = { latitude: number; longitude: number }
export type ParsedMgrs = GeoPoint & { mgrs: string; precisionMeters: number }

// Tsoon (1–60), laiusvöö täht, 100 km ruudu tähed ja 0–10 numbrit.
const MGRS_PATTERN = /^(\d{1,2})([C-HJ-NP-X])([A-HJ-NP-Z]{2})(\d*)$/

// Loeb MGRS-koordinaadi, nt „35VLF 70000 89000”, „35V LF 700 890” või
// „35vlf7000089000”. Tagastab ruudu keskpunkti WGS84 koordinaadid.
export function parseMgrs(input: string): ParsedMgrs | null {
  const compact = input.replace(/\s+/g, "").toUpperCase()
  const match = MGRS_PATTERN.exec(compact)
  if (!match) return null
  const [, zone, band, square, digits] = match
  const zoneNumber = Number(zone)
  if (zoneNumber < 1 || zoneNumber > 60 || digits.length % 2 !== 0 || digits.length > 10) return null
  try {
    const [longitude, latitude] = toPoint(compact)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
    // Kontroll: teisendus tagasi peab andma sama 100 km ruudu.
    const check = forward([longitude, latitude], 0)
    if (check !== `${zoneNumber}${band}${square}`) return null
    const half = digits.length / 2
    return {
      latitude,
      longitude,
      mgrs: formatMgrsParts(`${zoneNumber}${band}${square}`, digits.slice(0, half), digits.slice(half)),
      precisionMeters: 10 ** (5 - half),
    }
  } catch {
    return null
  }
}

function formatMgrsParts(gridSquare: string, easting: string, northing: string) {
  return easting ? `${gridSquare} ${easting} ${northing}` : gridSquare
}

// WGS84 → MGRS (vaikimisi 1 m täpsusega), nt „35VLF 71647 90919”.
export function formatMgrs(point: GeoPoint, digits = 5): string {
  const compact = forward([point.longitude, point.latitude], digits)
  const match = MGRS_PATTERN.exec(compact)
  if (!match) return compact
  const [, zone, band, square, numbers] = match
  const half = numbers.length / 2
  return formatMgrsParts(`${zone}${band}${square}`, numbers.slice(0, half), numbers.slice(half))
}
