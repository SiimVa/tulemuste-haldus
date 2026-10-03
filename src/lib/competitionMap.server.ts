import "server-only"

import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { parseMgrs } from "@/lib/geo/mgrs"
import { parseMapMarkers, type MapMarker } from "@/lib/dashboard/mapData"

export const MAX_MAP_IMAGE_BYTES = 10 * 1024 * 1024

export type LocationUpdate = {
  id: string
  // null eemaldab käsitsi märgitud koha; undefined jätab muutmata.
  mapX?: number | null
  mapY?: number | null
  // Tühi string või null eemaldab koordinaadi.
  mgrs?: string | null
}

export class MapLocationError extends Error {}

const unit = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1

export function locationUpdateData(update: LocationUpdate, label: string): Prisma.ScoringElementUpdateInput {
  const data: Prisma.ScoringElementUpdateInput = {}
  if (update.mapX !== undefined || update.mapY !== undefined) {
    if (update.mapX === null && update.mapY === null) {
      data.mapX = null
      data.mapY = null
    } else if (unit(update.mapX) && unit(update.mapY)) {
      data.mapX = update.mapX
      data.mapY = update.mapY
    } else {
      throw new MapLocationError(`${label}: kaardil märgitud koht on vigane.`)
    }
  }
  if (update.mgrs !== undefined) {
    const raw = (update.mgrs ?? "").trim()
    if (!raw) {
      data.mgrs = null
      data.latitude = null
      data.longitude = null
    } else {
      const parsed = parseMgrs(raw)
      if (!parsed) throw new MapLocationError(`${label}: MGRS-koordinaat „${raw.slice(0, 40)}” on vigane.`)
      data.mgrs = parsed.mgrs
      data.latitude = parsed.latitude
      data.longitude = parsed.longitude
    }
  }
  return data
}

// Uuendab elementide asukohad ühe tehinguna; võõra võistluse element katkestab kõik.
export async function updateElementLocations(competitionId: string, updates: LocationUpdate[]) {
  if (updates.length === 0) return 0
  const elements = await prisma.scoringElement.findMany({
    where: { competitionId, id: { in: updates.map((update) => update.id) } },
    select: { id: true, code: true },
  })
  const codeById = new Map(elements.map((element) => [element.id, element.code]))
  const writes = updates.map((update) => {
    const code = codeById.get(update.id)
    if (!code) throw new MapLocationError("Elementi ei leitud.")
    return { id: update.id, data: locationUpdateData(update, code) }
  })
  await prisma.$transaction(writes.map((write) => prisma.scoringElement.update({ where: { id: write.id }, data: write.data })))
  return writes.length
}

// Märgid salvestatakse tervikuna; MGRS teisendatakse koordinaatideks.
export function normalizeMarkers(input: unknown): MapMarker[] {
  if (!Array.isArray(input)) throw new MapLocationError("Märkide nimekiri on vigane.")
  if (input.length > 50) throw new MapLocationError("Märke saab olla kuni 50.")
  const markers = input.map((item) => {
    const raw = (item && typeof item === "object" ? item : {}) as Record<string, unknown>
    const label = typeof raw.label === "string" ? raw.label.trim() : ""
    if (!label || label.length > 60) throw new MapLocationError("Märgi nimi peab olema 1–60 tähemärki.")
    const mgrsText = typeof raw.mgrs === "string" ? raw.mgrs.trim() : ""
    const parsed = mgrsText ? parseMgrs(mgrsText) : null
    if (mgrsText && !parsed) throw new MapLocationError(`${label}: MGRS-koordinaat on vigane.`)
    return {
      id: raw.id,
      label,
      mapX: unit(raw.mapX) && unit(raw.mapY) ? raw.mapX : null,
      mapY: unit(raw.mapX) && unit(raw.mapY) ? raw.mapY : null,
      mgrs: parsed?.mgrs ?? null,
      latitude: parsed?.latitude ?? null,
      longitude: parsed?.longitude ?? null,
    }
  })
  const valid = parseMapMarkers(markers)
  if (valid.length !== markers.length) throw new MapLocationError("Märgi tunnus on vigane.")
  if (new Set(valid.map((marker) => marker.id)).size !== valid.length) throw new MapLocationError("Märgi tunnus kordub.")
  return valid
}

export async function saveMarkers(competitionId: string, markers: MapMarker[]) {
  await prisma.competitionMap.upsert({
    where: { competitionId },
    create: { competitionId, markers: markers as unknown as Prisma.InputJsonValue },
    update: { markers: markers as unknown as Prisma.InputJsonValue },
  })
}

export type MapEditorData = {
  image: { width: number; height: number; name: string | null; updatedAt: Date } | null
  markers: MapMarker[]
  elements: {
    id: string
    code: string
    name: string
    type: string
    isCancelled: boolean
    mapX: number | null
    mapY: number | null
    mgrs: string | null
    latitude: number | null
    longitude: number | null
  }[]
}

export async function loadMapEditorData(competitionId: string): Promise<MapEditorData> {
  const [map, elements] = await Promise.all([
    prisma.competitionMap.findUnique({
      where: { competitionId },
      select: { imageType: true, imageWidth: true, imageHeight: true, imageName: true, imageUpdatedAt: true, markers: true },
    }),
    prisma.scoringElement.findMany({
      where: { competitionId },
      orderBy: { order: "asc" },
      select: { id: true, code: true, name: true, type: true, isCancelled: true, mapX: true, mapY: true, mgrs: true, latitude: true, longitude: true },
    }),
  ])
  return {
    image: map?.imageType && map.imageWidth && map.imageHeight && map.imageUpdatedAt
      ? { width: map.imageWidth, height: map.imageHeight, name: map.imageName, updatedAt: map.imageUpdatedAt }
      : null,
    markers: parseMapMarkers(map?.markers ?? []),
    elements,
  }
}
