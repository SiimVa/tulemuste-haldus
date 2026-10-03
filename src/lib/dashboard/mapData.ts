import { georeference, scaleBarMeters, schematicLayout, type ControlPoint, type Georeference } from "../geo/georef"

export type MapLocation = {
  mapX: number | null
  mapY: number | null
  mgrs: string | null
  latitude: number | null
  longitude: number | null
}

export type MapMarker = MapLocation & { id: string; label: string }

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)
const unit = (value: unknown) => finite(value) && value >= 0 && value <= 1

// Salvestatud lisamärkide JSON kehtivaks.
export function parseMapMarkers(value: unknown): MapMarker[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 50).flatMap((item): MapMarker[] => {
    if (!item || typeof item !== "object") return []
    const raw = item as Record<string, unknown>
    const id = typeof raw.id === "string" && /^[a-z0-9-]{1,40}$/i.test(raw.id) ? raw.id : null
    const label = typeof raw.label === "string" ? raw.label.trim().slice(0, 60) : ""
    if (!id || !label) return []
    const hasXY = unit(raw.mapX) && unit(raw.mapY)
    const hasGeo = finite(raw.latitude) && finite(raw.longitude) && Math.abs(raw.latitude) <= 90 && Math.abs(raw.longitude) <= 180
    return [{
      id,
      label,
      mapX: hasXY ? raw.mapX as number : null,
      mapY: hasXY ? raw.mapY as number : null,
      mgrs: hasGeo && typeof raw.mgrs === "string" ? raw.mgrs.slice(0, 40) : null,
      latitude: hasGeo ? raw.latitude as number : null,
      longitude: hasGeo ? raw.longitude as number : null,
    }]
  })
}

type Located = MapLocation & { id: string }

export type MapGeometry = {
  mode: "IMAGE" | "SCHEMATIC"
  // Kõrgus laiuse suhtes.
  aspect: number
  positions: Map<string, { mapX: number; mapY: number; source: "MANUAL" | "COORDINATES" }>
  scaleBar: { meters: number; fraction: number } | null
  georef: (Pick<Georeference, "rmsMeters" | "residuals" | "metersPerPixel"> & { controlPointIds: string[] }) | null
}

export function controlPoints(items: Located[]): ControlPoint[] {
  return items.flatMap((item) => (
    finite(item.mapX) && finite(item.mapY) && finite(item.latitude) && finite(item.longitude)
      ? [{ id: item.id, mapX: item.mapX, mapY: item.mapY, latitude: item.latitude, longitude: item.longitude }]
      : []
  ))
}

export function imageGeoreference(image: { width: number; height: number }, items: Located[]) {
  return georeference(image, controlPoints(items))
}

// Asukoht kaardipildil: käsitsi märgitud koht või koordinaadist arvutatud koht,
// kui pilt on vähemalt kahe punkti abil koordinaatidega seotud.
export function mapGeometry(image: { width: number; height: number } | null, items: Located[]): MapGeometry | null {
  const positions = new Map<string, { mapX: number; mapY: number; source: "MANUAL" | "COORDINATES" }>()
  if (image && image.width > 0 && image.height > 0) {
    const georef = imageGeoreference(image, items)
    for (const item of items) {
      if (finite(item.mapX) && finite(item.mapY)) positions.set(item.id, { mapX: item.mapX, mapY: item.mapY, source: "MANUAL" })
      else if (georef && finite(item.latitude) && finite(item.longitude)) {
        const point = georef.toImage({ latitude: item.latitude, longitude: item.longitude })
        // Pildist kaugele jäävaid punkte ei joonistata.
        if (point.mapX >= -0.05 && point.mapX <= 1.05 && point.mapY >= -0.05 && point.mapY <= 1.05)
          positions.set(item.id, { ...point, source: "COORDINATES" })
      }
    }
    const widthMeters = georef ? georef.metersPerPixel * image.width : null
    const meters = widthMeters ? scaleBarMeters(widthMeters) : null
    return {
      mode: "IMAGE",
      aspect: image.height / image.width,
      positions,
      scaleBar: widthMeters && meters ? { meters, fraction: meters / widthMeters } : null,
      georef: georef ? {
        rmsMeters: georef.rmsMeters,
        residuals: georef.residuals,
        metersPerPixel: georef.metersPerPixel,
        controlPointIds: controlPoints(items).map((point) => point.id),
      } : null,
    }
  }
  const geo = items.flatMap((item) => (finite(item.latitude) && finite(item.longitude) ? [{ id: item.id, latitude: item.latitude, longitude: item.longitude }] : []))
  const layout = schematicLayout(geo)
  if (!layout) return null
  for (const [id, position] of layout.positions) positions.set(id, { ...position, source: "COORDINATES" })
  const meters = scaleBarMeters(layout.widthMeters)
  return { mode: "SCHEMATIC", aspect: layout.aspect, positions, scaleBar: { meters, fraction: meters / layout.widthMeters }, georef: null }
}

// Värviskaala 0 (halb, punane) … 1 (hea, roheline).
export function scoreColor(score: number | null): string {
  if (score == null) return "#9ca3af"
  const clamped = Math.max(0, Math.min(1, score))
  const hue = Math.round(clamped * 120)
  return `hsl(${hue} 70% 45%)`
}
