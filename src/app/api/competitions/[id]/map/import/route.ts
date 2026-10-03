import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import * as XLSX from "xlsx"
import { auth } from "@/lib/auth"
import { canAccessCompetition } from "@/lib/competitionAccess"
import { withSecurityRoute } from "@/lib/securityRoute.server"
import { parseMgrs } from "@/lib/geo/mgrs"
import { parseMapImportRows } from "@/lib/mapTemplate"
import { TRACKED_ELEMENT_TYPES } from "@/lib/dashboard/types"
import {
  MapLocationError,
  loadMapEditorData,
  normalizeMarkers,
  saveMarkers,
  updateElementLocations,
  type LocationUpdate,
} from "@/lib/competitionMap.server"

const MAX_IMPORT_BYTES = 2 * 1024 * 1024

// Kõik read peavad olema korras, muidu ei muudeta midagi.
async function handlePOST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  if (!await canAccessCompetition(id, { id: session.user.id, role: session.user.role })) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  }
  const form = await req.formData().catch(() => null)
  const file = form?.get("file")
  if (!file || typeof file === "string") return NextResponse.json({ error: "Fail puudub" }, { status: 400 })
  if (file.size > MAX_IMPORT_BYTES) return NextResponse.json({ error: "Fail võib olla kuni 2 MB." }, { status: 413 })

  let table: unknown[][]
  try {
    const buffer = new Uint8Array(await file.arrayBuffer())
    const book = file.name.toLowerCase().endsWith(".csv")
      ? XLSX.read(new TextDecoder("utf-8").decode(buffer), { type: "string" })
      : XLSX.read(buffer, { type: "array" })
    const sheet = book.Sheets[book.SheetNames[0]]
    table = sheet ? XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false }) : []
  } catch {
    return NextResponse.json({ error: "Faili ei õnnestunud lugeda. Kasuta Exceli (.xlsx) või CSV faili." }, { status: 400 })
  }
  if (table.length > 2000) return NextResponse.json({ error: "Failis on liiga palju ridu." }, { status: 400 })
  const { rows, error } = parseMapImportRows(table)
  if (error) return NextResponse.json({ error }, { status: 400 })

  const data = await loadMapEditorData(id)
  const elementByCode = new Map(data.elements.map((element) => [element.code.trim().toLocaleLowerCase("et"), element]))
  const errors: string[] = []
  const updates: LocationUpdate[] = []
  const markers = [...data.markers]
  for (const row of rows) {
    const parsed = parseMgrs(row.mgrs)
    if (!parsed) { errors.push(`Rida ${row.row}: MGRS-koordinaat „${row.mgrs.slice(0, 40)}” on vigane.`); continue }
    if (row.kind === "ELEMENT") {
      const element = elementByCode.get(row.code.toLocaleLowerCase("et"))
      if (!element) { errors.push(`Rida ${row.row}: tähist „${row.code.slice(0, 40)}” ei leitud.`); continue }
      if (!TRACKED_ELEMENT_TYPES.includes(element.type)) { errors.push(`Rida ${row.row}: elemendil ${element.code} pole kaardil asukohta.`); continue }
      updates.push({ id: element.id, mgrs: parsed.mgrs })
    } else {
      if (!row.label) { errors.push(`Rida ${row.row}: märgi nimi puudub.`); continue }
      const existing = markers.find((marker) => marker.label.toLocaleLowerCase("et") === row.label.toLocaleLowerCase("et"))
      if (existing) Object.assign(existing, { mgrs: parsed.mgrs, latitude: parsed.latitude, longitude: parsed.longitude })
      else markers.push({ id: `m-${randomUUID().slice(0, 8)}`, label: row.label, mapX: null, mapY: null, mgrs: parsed.mgrs, latitude: parsed.latitude, longitude: parsed.longitude })
    }
  }
  if (rows.length === 0) return NextResponse.json({ error: "Failis pole ühtegi MGRS-koordinaati." }, { status: 400 })
  if (errors.length) return NextResponse.json({ error: "Import ebaõnnestus.", errors: errors.slice(0, 50) }, { status: 400 })
  try {
    const normalized = normalizeMarkers(markers)
    await updateElementLocations(id, updates)
    await saveMarkers(id, normalized)
  } catch (failure) {
    if (failure instanceof MapLocationError) return NextResponse.json({ error: failure.message }, { status: 400 })
    throw failure
  }
  const updated = await loadMapEditorData(id)
  return NextResponse.json({ imported: rows.length, elements: updated.elements, markers: updated.markers })
}

export const POST = withSecurityRoute("/api/competitions/[id]/map/import", handlePOST)
