import type { GeoPoint } from "./mgrs"

const EARTH_RADIUS = 6_371_008.8
const RAD = Math.PI / 180

// Kohalik tasapinnaline projektsioon (meetrid itta ja põhja). Mõne kilomeetri
// suurusel võistlusalal on viga alla meetri.
export type LocalProjection = {
  toXY(point: GeoPoint): { x: number; y: number }
  fromXY(x: number, y: number): GeoPoint
}

export function localProjection(points: GeoPoint[]): LocalProjection {
  const latitude0 = points.reduce((sum, point) => sum + point.latitude, 0) / points.length
  const longitude0 = points.reduce((sum, point) => sum + point.longitude, 0) / points.length
  const cos = Math.cos(latitude0 * RAD)
  return {
    toXY: (point) => ({
      x: EARTH_RADIUS * (point.longitude - longitude0) * RAD * cos,
      y: EARTH_RADIUS * (point.latitude - latitude0) * RAD,
    }),
    fromXY: (x, y) => ({
      latitude: latitude0 + y / EARTH_RADIUS / RAD,
      longitude: longitude0 + x / (EARTH_RADIUS * cos) / RAD,
    }),
  }
}

// Sarnasusteisendus (nihe, pööre, mõõtkava) tasapinna (x itta, y põhja) ja
// pildi (u paremale, v alla) vahel. Pildi telg v on y-ga vastupidine, seega
// sobitatakse y' = −y suhtes ilma peegelduseta.
export type Similarity = { a: number; b: number; c: number; d: number }

export function fitSimilarity(pairs: { x: number; y: number; u: number; v: number }[]): Similarity | null {
  if (pairs.length < 2) return null
  const n = pairs.length
  const sx = pairs.reduce((sum, p) => sum + p.x, 0) / n
  const sy = pairs.reduce((sum, p) => sum - p.y, 0) / n
  const su = pairs.reduce((sum, p) => sum + p.u, 0) / n
  const sv = pairs.reduce((sum, p) => sum + p.v, 0) / n
  let numeratorA = 0, numeratorB = 0, denominator = 0
  for (const p of pairs) {
    const x = p.x - sx, y = -p.y - sy, u = p.u - su, v = p.v - sv
    numeratorA += x * u + y * v
    numeratorB += x * v - y * u
    denominator += x * x + y * y
  }
  if (denominator < 1e-9) return null
  const a = numeratorA / denominator
  const b = numeratorB / denominator
  if (Math.hypot(a, b) < 1e-12) return null
  return { a, b, c: su - a * sx + b * sy, d: sv - b * sx - a * sy }
}

export function applySimilarity(t: Similarity, x: number, y: number) {
  return { u: t.a * x - t.b * -y + t.c, v: t.b * x + t.a * -y + t.d }
}

export function invertSimilarity(t: Similarity, u: number, v: number) {
  const scale = t.a * t.a + t.b * t.b
  const du = u - t.c, dv = v - t.d
  return { x: (t.a * du + t.b * dv) / scale, y: -((-t.b * du + t.a * dv) / scale) }
}

export type ControlPoint = GeoPoint & { id: string; mapX: number; mapY: number }

export type Georeference = {
  toImage(point: GeoPoint): { mapX: number; mapY: number }
  fromImage(mapX: number, mapY: number): GeoPoint
  metersPerPixel: number
  // Ruutkeskmine viga meetrites; kahe punkti korral alati 0.
  rmsMeters: number
  residuals: { id: string; meters: number }[]
}

// Seob kaardipildi koordinaatidega punktide abil, millel on nii pildil märgitud
// koht kui ka koordinaat. Vaja on vähemalt kahte eri kohta.
export function georeference(image: { width: number; height: number }, controlPoints: ControlPoint[]): Georeference | null {
  if (controlPoints.length < 2 || image.width <= 0 || image.height <= 0) return null
  const projection = localProjection(controlPoints)
  const pairs = controlPoints.map((point) => ({ ...projection.toXY(point), u: point.mapX * image.width, v: point.mapY * image.height }))
  const transform = fitSimilarity(pairs)
  if (!transform) return null
  const pixelsPerMeter = Math.hypot(transform.a, transform.b)
  const residuals = controlPoints.map((point, index) => {
    const predicted = applySimilarity(transform, pairs[index].x, pairs[index].y)
    return { id: point.id, meters: Math.hypot(predicted.u - pairs[index].u, predicted.v - pairs[index].v) / pixelsPerMeter }
  })
  return {
    toImage(point) {
      const { x, y } = projection.toXY(point)
      const { u, v } = applySimilarity(transform, x, y)
      return { mapX: u / image.width, mapY: v / image.height }
    },
    fromImage(mapX, mapY) {
      const { x, y } = invertSimilarity(transform, mapX * image.width, mapY * image.height)
      return projection.fromXY(x, y)
    },
    metersPerPixel: 1 / pixelsPerMeter,
    rmsMeters: Math.sqrt(residuals.reduce((sum, item) => sum + item.meters ** 2, 0) / residuals.length),
    residuals,
  }
}

// Ilma kaardipildita skeem: punktid mahutatakse ruutu, põhi on üleval.
export type Schematic = {
  positions: Map<string, { mapX: number; mapY: number }>
  // Skeemi kõrgus laiuse suhtes ja meetrite arv skeemi laiuse kohta.
  aspect: number
  widthMeters: number
}

export function schematicLayout(points: (GeoPoint & { id: string })[]): Schematic | null {
  if (points.length === 0) return null
  const projection = localProjection(points)
  const xy = points.map((point) => ({ id: point.id, ...projection.toXY(point) }))
  const minX = Math.min(...xy.map((p) => p.x)), maxX = Math.max(...xy.map((p) => p.x))
  const minY = Math.min(...xy.map((p) => p.y)), maxY = Math.max(...xy.map((p) => p.y))
  // Vähemalt 200 m ja 10% varu igast servast.
  const span = Math.max(maxX - minX, maxY - minY, 200)
  const pad = span * 0.1
  const width = Math.max(maxX - minX, 200) + 2 * pad
  const height = Math.max(maxY - minY, 200) + 2 * pad
  const left = (minX + maxX) / 2 - width / 2
  const top = (minY + maxY) / 2 + height / 2
  return {
    positions: new Map(xy.map((p) => [p.id, { mapX: (p.x - left) / width, mapY: (top - p.y) / height }])),
    aspect: height / width,
    widthMeters: width,
  }
}

// Mõõtkavariba pikkus: ümar arv meetreid, mis võtab umbes viiendiku laiusest.
export function scaleBarMeters(widthMeters: number): number {
  const target = widthMeters / 5
  const steps = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 50000]
  return steps.reduce((best, step) => (Math.abs(step - target) < Math.abs(best - target) ? step : best), steps[0])
}
