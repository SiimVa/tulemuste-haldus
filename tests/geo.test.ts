import assert from "node:assert/strict"
import test from "node:test"
import { formatMgrs, parseMgrs } from "../src/lib/geo/mgrs"
import { georeference, localProjection, scaleBarMeters, schematicLayout } from "../src/lib/geo/georef"
import { mapGeometry, parseMapMarkers, scoreColor } from "../src/lib/dashboard/mapData"
import { readImageInfo } from "../src/lib/imageSize"
import { applyFrozenElementStatus, applyFrozenTeamStatus, parseFreezeSnapshot } from "../src/lib/leaderboardFreeze"
import { parseMapImportRows } from "../src/lib/mapTemplate"

test("MGRS coordinates are parsed, normalised and validated", () => {
  const parsed = parseMgrs("35VLF 70000 89000")!
  assert.equal(parsed.mgrs, "35VLF 70000 89000")
  assert.equal(parsed.precisionMeters, 1)
  assert.ok(Math.abs(parsed.latitude - 59.419477) < 1e-5)
  assert.ok(Math.abs(parsed.longitude - 24.709045) < 1e-5)
  const coarse = parseMgrs(" 35v lf 700 890 ")!
  assert.equal(coarse.mgrs, "35VLF 700 890")
  assert.equal(coarse.precisionMeters, 100)
  for (const invalid of ["", "foo", "35VLF 7000 890", "35ULF7000089000", "61VLF7000089000", "35VLF 1234567 1234567"]) assert.equal(parseMgrs(invalid), null, invalid)
  const point = { latitude: 59.4372, longitude: 24.7369 }
  assert.equal(formatMgrs(point), "35VLF 71647 90919")
  const back = parseMgrs(formatMgrs(point))!
  assert.ok(Math.abs(back.latitude - point.latitude) * 111_000 < 1)
})

const p1 = { id: "p1", latitude: 59.40, longitude: 24.70 }
const p2 = { id: "p2", latitude: 59.42, longitude: 24.75 }
const p3 = { id: "p3", latitude: 59.41, longitude: 24.72 }
const p4 = { id: "p4", latitude: 59.43, longitude: 24.69 }
const image = { width: 2000, height: 1500 }
// Tõeline kaart: 0,5 px meetri kohta, pööratud 10°.
const truth = localProjection([p1, p2, p3, p4])
function onImage(point: { latitude: number; longitude: number }) {
  const { x, y } = truth.toXY(point)
  const angle = (10 * Math.PI) / 180
  const xr = x * Math.cos(angle) - y * Math.sin(angle)
  const yr = x * Math.sin(angle) + y * Math.cos(angle)
  return { mapX: (1000 + 0.5 * xr) / image.width, mapY: (750 - 0.5 * yr) / image.height }
}

test("a map image is georeferenced from two control points and reports residuals", () => {
  const georef = georeference(image, [{ ...p1, ...onImage(p1) }, { ...p2, ...onImage(p2) }])!
  const predicted = georef.toImage(p3)
  const expected = onImage(p3)
  assert.ok(Math.abs(predicted.mapX - expected.mapX) * image.width < 0.5)
  assert.ok(Math.abs(predicted.mapY - expected.mapY) * image.height < 0.5)
  const back = georef.fromImage(expected.mapX, expected.mapY)
  assert.ok(Math.abs(back.latitude - p3.latitude) * 111_000 < 1)
  assert.ok(Math.abs(back.longitude - p3.longitude) * 111_000 * Math.cos((59.41 * Math.PI) / 180) < 1)
  assert.ok(Math.abs(georef.metersPerPixel - 2) < 0.01)
  assert.ok(georef.rmsMeters < 1e-6)

  const shifted = onImage(p4)
  const noisy = georeference(image, [{ ...p1, ...onImage(p1) }, { ...p2, ...onImage(p2) }, { ...p4, mapX: shifted.mapX + 100 / image.width, mapY: shifted.mapY }])!
  assert.ok(noisy.rmsMeters > 50)
  const worst = [...noisy.residuals].sort((a, b) => b.meters - a.meters)[0]
  assert.equal(worst.id, "p4")
  assert.equal(georeference(image, [{ ...p1, ...onImage(p1) }]), null)
  assert.equal(georeference(image, [{ ...p1, ...onImage(p1) }, { ...p1, id: "same", ...onImage(p1) }]), null)
})

test("schematic layout keeps north up and picks a round scale bar", () => {
  const layout = schematicLayout([p1, p2, p3])!
  assert.ok(layout.positions.get("p2")!.mapY < layout.positions.get("p1")!.mapY)
  assert.ok(layout.positions.get("p2")!.mapX > layout.positions.get("p1")!.mapX)
  for (const position of layout.positions.values()) assert.ok(position.mapX > 0 && position.mapX < 1 && position.mapY > 0 && position.mapY < 1)
  assert.equal(scaleBarMeters(5000), 1000)
  assert.equal(scaleBarMeters(260), 50)
  assert.equal(schematicLayout([]), null)
})

test("map geometry combines manual positions, coordinates and markers", () => {
  const items = [
    { id: "e1", ...onImage(p1), mgrs: null, latitude: p1.latitude, longitude: p1.longitude },
    { id: "e2", ...onImage(p2), mgrs: null, latitude: p2.latitude, longitude: p2.longitude },
    { id: "e3", mapX: null, mapY: null, mgrs: null, latitude: p3.latitude, longitude: p3.longitude },
    { id: "e4", mapX: 0.2, mapY: 0.3, mgrs: null, latitude: null, longitude: null },
    { id: "far", mapX: null, mapY: null, mgrs: null, latitude: 58.0, longitude: 26.0 },
  ]
  const geometry = mapGeometry(image, items)!
  assert.equal(geometry.mode, "IMAGE")
  assert.equal(geometry.positions.get("e3")!.source, "COORDINATES")
  assert.equal(geometry.positions.get("e4")!.source, "MANUAL")
  assert.equal(geometry.positions.has("far"), false)
  assert.deepEqual(geometry.georef!.controlPointIds, ["e1", "e2"])
  assert.ok(geometry.scaleBar && geometry.scaleBar.meters === 1000)

  const withoutGeo = mapGeometry(image, [items[3]])!
  assert.equal(withoutGeo.georef, null)
  assert.equal(withoutGeo.scaleBar, null)
  const schematic = mapGeometry(null, items)!
  assert.equal(schematic.mode, "SCHEMATIC")
  assert.equal(schematic.positions.has("e4"), false)
  assert.equal(mapGeometry(null, [items[3]]), null)
  assert.equal(scoreColor(null), "#9ca3af")
  assert.equal(scoreColor(1), "hsl(120 70% 45%)")
})

test("map markers are validated", () => {
  const markers = parseMapMarkers([
    { id: "start-kt", label: " KT start ", mapX: 0.5, mapY: 0.2 },
    { id: "bad id!", label: "x" },
    { id: "nolabel", label: "" },
    { id: "geo", label: "Finiš", latitude: 59.4, longitude: 24.7, mgrs: "35VLF 1 2", mapX: 2, mapY: 0.5 },
    "junk",
  ])
  assert.deepEqual(markers, [
    { id: "start-kt", label: "KT start", mapX: 0.5, mapY: 0.2, mgrs: null, latitude: null, longitude: null },
    { id: "geo", label: "Finiš", mapX: null, mapY: null, mgrs: "35VLF 1 2", latitude: 59.4, longitude: 24.7 },
  ])
  assert.deepEqual(parseMapMarkers("nope"), [])
})

function bytes(...parts: (number[] | string)[]) {
  return new Uint8Array(parts.flatMap((part) => (typeof part === "string" ? [...part].map((char) => char.charCodeAt(0)) : part)))
}

test("image info is read from PNG, JPEG and WebP headers only", () => {
  const png = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13], "IHDR", [0, 0, 2, 0x80, 0, 0, 1, 0xe0, 8, 6, 0, 0, 0])
  assert.deepEqual(readImageInfo(png), { type: "image/png", width: 640, height: 480 })
  const jpeg = bytes([0xff, 0xd8, 0xff, 0xe0, 0, 16], "JFIF", [0, 1, 1, 0, 0, 1, 0, 1, 0, 0], [0xff, 0xc0, 0, 17, 8, 1, 0xe0, 2, 0x80, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1])
  assert.deepEqual(readImageInfo(jpeg), { type: "image/jpeg", width: 640, height: 480 })
  const vp8x = bytes("RIFF", [0, 0, 0, 0], "WEBP", "VP8X", [10, 0, 0, 0, 0, 0, 0, 0], [0x7f, 2, 0], [0xdf, 1, 0], [0, 0])
  assert.deepEqual(readImageInfo(vp8x), { type: "image/webp", width: 640, height: 480 })
  const vp8l = bytes("RIFF", [0, 0, 0, 0], "WEBP", "VP8L", [5, 0, 0, 0], [0x2f, 0x7f, 0xc2, 0x77, 0x00], new Array(10).fill(0))
  assert.deepEqual(readImageInfo(vp8l), { type: "image/webp", width: 640, height: 480 })
  assert.equal(readImageInfo(bytes('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>')), null)
  assert.equal(readImageInfo(png.subarray(0, 20)), null)
  assert.equal(readImageInfo(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13], "IHDR", [0, 0, 0, 0, 0, 0, 1, 0xe0])), null)
})

test("freeze snapshots are parsed defensively and override statuses", () => {
  const takenAt = new Date("2026-05-16T12:00:00Z")
  const snapshot = parseFreezeSnapshot({
    version: 1, takenAt: takenAt.toISOString(),
    scores: [{ elementId: "e", teamId: "t", points: 3 }, { elementId: "e", teamId: "t", points: "x" }],
    penalties: [{ teamId: "t", points: 2, description: "Hilines", enteredAt: takenAt.toISOString() }],
    miscEntries: [{ elementId: "m", teamId: "t", points: 1, description: "Kogu võistkond", elementType: "ABANDONMENT" }],
    teams: [{ id: "t", isHorsDeCompetition: false, hcFromElementOrder: null, dnfFromElementOrder: 2, dnfReason: "Vigastus", dqFromElementOrder: null, dnsFlag: false }],
    elements: [{ id: "e", isCancelled: true }],
  }, takenAt)
  assert.equal(snapshot.scores.length, 1)
  assert.equal(snapshot.miscEntries[0].elementType, "ABANDONMENT")
  type LiveTeam = { id: string; name: string; isHorsDeCompetition: boolean; hcFromElementOrder: number | null; dnfFromElementOrder: number | null; dnfReason: string | null; dqFromElementOrder: number | null; dnsFlag: boolean }
  const live: LiveTeam[] = [
    { id: "t", name: "A", isHorsDeCompetition: false, hcFromElementOrder: null, dnfFromElementOrder: null, dnfReason: null, dqFromElementOrder: null, dnsFlag: false },
    { id: "new", name: "B", isHorsDeCompetition: false, hcFromElementOrder: null, dnfFromElementOrder: null, dnfReason: null, dqFromElementOrder: null, dnsFlag: true },
  ]
  const teams = applyFrozenTeamStatus(live, snapshot)
  assert.equal(teams[0].dnfFromElementOrder, 2)
  assert.equal(teams[0].name, "A")
  assert.equal(teams[1].dnsFlag, true)
  assert.equal(applyFrozenElementStatus([{ id: "e", isCancelled: false }, { id: "f", isCancelled: false }], snapshot)[0].isCancelled, true)
  const broken = parseFreezeSnapshot({ version: 2, scores: [{ elementId: "e", teamId: "t", points: 3 }] }, takenAt)
  assert.deepEqual(broken.scores, [])
  assert.equal(broken.takenAt, takenAt.toISOString())
})

test("map import finds the header row, skips empty coordinates and separates markers", () => {
  const { rows, error } = parseMapImportRows([
    ["Asukohad"],
    ["Tähis", "Nimi", "Tüüp", "MGRS"],
    ["KP1", "Kadad", "KP", " 35VLF 1 2 "],
    ["KP2", "Kimi", "KP", ""],
    ["", "Start KT", "märk", "35VLF 3 4"],
  ])
  assert.equal(error, null)
  assert.deepEqual(rows, [
    { row: 3, kind: "ELEMENT", code: "KP1", mgrs: "35VLF 1 2" },
    { row: 5, kind: "MARKER", label: "Start KT", mgrs: "35VLF 3 4" },
  ])
  assert.match(parseMapImportRows([["Tähis", "Nimi"], ["KP1", "Kadad"]]).error ?? "", /MGRS/)
})
