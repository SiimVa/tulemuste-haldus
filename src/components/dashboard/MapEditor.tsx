"use client"

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { imageGeoreference, mapGeometry, type MapMarker } from "@/lib/dashboard/mapData"
import { formatMgrs } from "@/lib/geo/mgrs"
import { TRACKED_ELEMENT_TYPES } from "@/lib/dashboard/types"

type EditorElement = {
  id: string; code: string; name: string; type: string; isCancelled: boolean
  mapX: number | null; mapY: number | null; mgrs: string | null; latitude: number | null; longitude: number | null
}
type ImageMeta = { width: number; height: number; name: string | null; updatedAt: string }
type Target = { kind: "element" | "marker"; id: string }
type Message = { tone: "ok" | "error"; text: string }

const VIEW_WIDTH = 1000
const clamp = (value: number) => Math.max(0, Math.min(1, value))
const compactMgrs = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, "").toUpperCase()

export function MapEditor({ competitionId, initialImage, initialElements, initialMarkers }: {
  competitionId: string
  initialImage: ImageMeta | null
  initialElements: EditorElement[]
  initialMarkers: MapMarker[]
}) {
  const [image, setImage] = useState(initialImage)
  const [elements, setElements] = useState(initialElements)
  const [markers, setMarkers] = useState(initialMarkers)
  const [placing, setPlacing] = useState<Target | null>(null)
  const [dragging, setDragging] = useState<(Target & { mapX: number; mapY: number; moved: boolean }) | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<Message | null>(null)
  const [importErrors, setImportErrors] = useState<string[]>([])
  const [newMarker, setNewMarker] = useState("")
  const svgRef = useRef<SVGSVGElement>(null)
  const api = `/api/competitions/${competitionId}/map`

  const imageUrl = image ? `${api}/image?v=${Date.parse(image.updatedAt)}` : null
  const items = [...elements, ...markers.map((marker) => ({ ...marker, id: `marker:${marker.id}` }))]
  const geometry = mapGeometry(image ? { width: image.width, height: image.height } : null, items)
  const georef = image ? imageGeoreference({ width: image.width, height: image.height }, items) : null
  const height = Math.round(VIEW_WIDTH * (geometry?.aspect ?? (image ? image.height / image.width : 0.7)))
  const residualById = new Map((geometry?.georef?.residuals ?? []).map((item) => [item.id, item.meters]))

  function positionOf(target: Target) {
    if (dragging && dragging.kind === target.kind && dragging.id === target.id) return { mapX: dragging.mapX, mapY: dragging.mapY, source: "MANUAL" as const }
    return geometry?.positions.get(target.kind === "marker" ? `marker:${target.id}` : target.id) ?? null
  }

  function pointFromEvent(event: { clientX: number; clientY: number }) {
    const svg = svgRef.current
    const matrix = svg?.getScreenCTM()
    if (!svg || !matrix) return null
    const point = svg.createSVGPoint()
    point.x = event.clientX
    point.y = event.clientY
    const local = point.matrixTransform(matrix.inverse())
    return { mapX: clamp(local.x / VIEW_WIDTH), mapY: clamp(local.y / height) }
  }

  async function request(url: string, init: RequestInit): Promise<Record<string, unknown> | null> {
    setBusy(true)
    setMessage(null)
    setImportErrors([])
    try {
      const response = await fetch(url, init)
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        setMessage({ tone: "error", text: typeof body.error === "string" ? body.error : "Salvestamine ebaõnnestus." })
        if (Array.isArray(body.errors)) setImportErrors(body.errors)
        return null
      }
      return body
    } catch {
      setMessage({ tone: "error", text: "Ühendus ebaõnnestus. Proovi uuesti." })
      return null
    } finally {
      setBusy(false)
    }
  }

  function applyLocations(body: Record<string, unknown> | null) {
    if (!body) return false
    if (Array.isArray(body.elements)) setElements((body.elements as EditorElement[]).filter((element) => !element.isCancelled && TRACKED_ELEMENT_TYPES.includes(element.type)))
    if (Array.isArray(body.markers)) setMarkers(body.markers as MapMarker[])
    return true
  }

  async function saveLocations(payload: { elements?: unknown[]; markers?: MapMarker[] }) {
    return applyLocations(await request(`${api}/locations`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    }))
  }

  async function place(target: Target, position: { mapX: number; mapY: number }) {
    const ok = target.kind === "element"
      ? await saveLocations({ elements: [{ id: target.id, mapX: position.mapX, mapY: position.mapY }] })
      : await saveLocations({ markers: markers.map((marker) => (marker.id === target.id ? { ...marker, ...position } : marker)) })
    if (!ok) return
    if (target.kind === "element") {
      const element = elements.find((item) => item.id === target.id)
      const index = elements.findIndex((item) => item.id === target.id)
      const next = [...elements.slice(index + 1), ...elements.slice(0, index)].find((item) => item.mapX == null && ["CHECKPOINT", "PENALTY_BOX"].includes(item.type))
      setPlacing(next ? { kind: "element", id: next.id } : null)
      setMessage({ tone: "ok", text: `${element?.code ?? "KP"} märgitud kaardile.${next ? ` Järgmisena klõpsa kohta, kus asub ${next.code} ${next.name}.` : ""}` })
    } else {
      setPlacing(null)
      setMessage({ tone: "ok", text: "Märk paigutatud." })
    }
  }

  function onMapClick(event: React.MouseEvent<SVGSVGElement>) {
    if (!placing || !image || busy) return
    const position = pointFromEvent(event)
    if (position) void place(placing, position)
  }

  function startDrag(event: ReactPointerEvent<SVGGElement>, target: Target) {
    const position = positionOf(target)
    if (!image || !position || position.source !== "MANUAL" || busy) return
    event.stopPropagation()
    svgRef.current?.setPointerCapture(event.pointerId)
    setDragging({ ...target, mapX: position.mapX, mapY: position.mapY, moved: false })
  }

  function onPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (!dragging) return
    const position = pointFromEvent(event)
    if (position) setDragging({ ...dragging, ...position, moved: true })
  }

  function onPointerUp() {
    if (!dragging) return
    const { moved, mapX, mapY, kind, id } = dragging
    setDragging(null)
    if (moved) void place({ kind, id }, { mapX, mapY })
  }

  async function uploadImage(file: File) {
    const form = new FormData()
    form.append("file", file)
    const body = await request(api, { method: "POST", body: form })
    if (!body) return
    setImage({ width: Number(body.width), height: Number(body.height), name: String(body.name ?? ""), updatedAt: String(body.updatedAt) })
    setMessage({ tone: "ok", text: "Kaart on üles laaditud. Vali KP ja klõpsa selle asukohal kaardil." })
  }

  async function removeImage() {
    if (!window.confirm("Eemalda kaardipilt? Kaardile märgitud kohad kustutatakse, MGRS-koordinaadid jäävad alles.")) return
    if (!await request(api, { method: "DELETE" })) return
    setImage(null)
    setPlacing(null)
    setElements((current) => current.map((element) => ({ ...element, mapX: null, mapY: null })))
    setMarkers((current) => current.map((marker) => ({ ...marker, mapX: null, mapY: null })))
    setMessage({ tone: "ok", text: "Kaardipilt eemaldatud." })
  }

  async function importFile(file: File) {
    setImportErrors([])
    const form = new FormData()
    form.append("file", file)
    const body = await request(`${api}/import`, { method: "POST", body: form })
    if (applyLocations(body)) setMessage({ tone: "ok", text: `Imporditud ${Number(body?.imported ?? 0)} koordinaati.` })
  }

  async function commitMgrs(target: Target, value: string, current: string | null) {
    if (compactMgrs(value) === compactMgrs(current)) return
    if (target.kind === "element") await saveLocations({ elements: [{ id: target.id, mgrs: value.trim() || null }] })
    else await saveLocations({ markers: markers.map((marker) => (marker.id === target.id ? { ...marker, mgrs: value.trim() || null } : marker)) })
  }

  async function addMarker() {
    const label = newMarker.trim()
    if (!label) return
    const id = `m-${Math.random().toString(36).slice(2, 10)}`
    if (await saveLocations({ markers: [...markers, { id, label, mapX: null, mapY: null, mgrs: null, latitude: null, longitude: null }] })) {
      setNewMarker("")
      if (image) {
        setPlacing({ kind: "marker", id })
        setMessage({ tone: "ok", text: `Klõpsa kaardil kohta, kus asub „${label}”.` })
      }
    }
  }

  const placingLabel = placing
    ? placing.kind === "element"
      ? (() => { const element = elements.find((item) => item.id === placing.id); return element ? `${element.code} ${element.name}` : "" })()
      : markers.find((marker) => marker.id === placing.id)?.label ?? ""
    : ""

  function locationStatus(target: Target, hasCoordinates: boolean) {
    const position = positionOf(target)
    const residual = residualById.get(target.kind === "marker" ? `marker:${target.id}` : target.id)
    if (position?.source === "MANUAL") {
      return <span className="text-success">Kaardil{residual != null && residual > 30 && <span className="block text-xs text-danger">Erineb koordinaadist {Math.round(residual)} m</span>}</span>
    }
    if (position) return <span className="text-violet-700">Koordinaadi järgi</span>
    if (hasCoordinates && image) return <span className="text-ink-muted">Koordinaat olemas</span>
    return <span className="text-ink-subtle">Puudub</span>
  }

  function approximateMgrs(target: Target) {
    const position = positionOf(target)
    if (!georef || position?.source !== "MANUAL") return null
    return formatMgrs(georef.fromImage(position.mapX, position.mapY), 4)
  }

  const routeElements = elements.filter((element) => ["CHECKPOINT", "PENALTY_BOX"].includes(element.type))
  const placed = routeElements.filter((element) => positionOf({ kind: "element", id: element.id })).length
  const actionButton = "min-h-9 rounded-lg border border-line px-2.5 text-xs font-medium text-ink hover:bg-canvas disabled:opacity-40"

  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-center gap-3 p-5">
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-ink">Kaardipilt</h2>
          <p className="text-sm text-ink-muted">
            {image ? `${image.name || "Kaart"} · ${image.width} × ${image.height} px` : "PNG, JPEG või WebP, kuni 10 MB. Kaardipildita kuvatakse koordinaatidega KP-d skeemina."}
          </p>
        </div>
        <label className={`${actionButton} inline-flex min-h-11 cursor-pointer items-center px-4 text-sm`}>
          {image ? "Asenda kaart" : "Lae kaart üles"}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={busy}
            onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void uploadImage(file) }} />
        </label>
        {image && <Button type="button" variant="secondary" onClick={removeImage} disabled={busy}>Eemalda kaart</Button>}
      </Card>

      <Card className="flex flex-wrap items-center gap-3 p-5">
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-ink">MGRS-koordinaadid Excelist</h2>
          <p className="text-sm text-ink-muted">Lae alla mall, sisesta KP-de koordinaadid (nt 35VLF 70000 89000) ja impordi fail tagasi. Startide ja finiši märgid saab lisada malli ridadena tüübiga „Märk”.</p>
        </div>
        <a href={`${api}/template`} className={`${actionButton} inline-flex min-h-11 items-center px-4 text-sm`}>Laadi mall alla</a>
        <label className={`${actionButton} inline-flex min-h-11 cursor-pointer items-center px-4 text-sm`}>
          Impordi koordinaadid
          <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" disabled={busy}
            onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void importFile(file) }} />
        </label>
        {importErrors.length > 0 && (
          <ul className="w-full list-disc space-y-0.5 pl-5 text-sm text-danger" role="alert">{importErrors.map((error) => <li key={error}>{error}</li>)}</ul>
        )}
      </Card>

      {message && <p role={message.tone === "error" ? "alert" : "status"} className={`rounded-lg px-4 py-2 text-sm ${message.tone === "error" ? "bg-danger-soft text-danger-hover" : "bg-success-soft text-success"}`}>{message.text}</p>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <Card className="min-w-0 p-3 sm:p-4">
          {placing && image && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-primary-soft px-3 py-2 text-sm text-primary-hover">
              <span className="min-w-0 flex-1">Klõpsa kaardil kohta, kus asub <strong>{placingLabel}</strong>.</span>
              <button type="button" className="font-medium underline" onClick={() => setPlacing(null)}>Lõpeta</button>
            </div>
          )}
          {geometry || image ? (
            <svg ref={svgRef} viewBox={`0 0 ${VIEW_WIDTH} ${height}`} role="img" aria-label="Kaart KP-de asukohtadega"
              className={`h-auto max-h-[80vh] w-full touch-none rounded-lg border border-line bg-canvas ${placing && image ? "cursor-crosshair" : ""}`}
              onClick={onMapClick} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => setDragging(null)}>
              {imageUrl ? <image href={imageUrl} x="0" y="0" width={VIEW_WIDTH} height={height} preserveAspectRatio="none" /> : <rect width={VIEW_WIDTH} height={height} fill="#f8fafc" />}
              {elements.map((element) => {
                const target = { kind: "element" as const, id: element.id }
                const position = positionOf(target)
                if (!position) return null
                const active = placing?.kind === "element" && placing.id === element.id
                return (
                  <g key={element.id} onPointerDown={(event) => startDrag(event, target)} className={position.source === "MANUAL" && image ? "cursor-move" : ""}>
                    <title>{`${element.code} ${element.name}${position.source === "MANUAL" ? " — lohista, et liigutada" : " — koordinaadi järgi"}`}</title>
                    <circle cx={position.mapX * VIEW_WIDTH} cy={position.mapY * height} r={active ? 18 : 13}
                      fill={position.source === "MANUAL" ? "#2563eb" : "#7c3aed"} fillOpacity="0.85" stroke="#ffffff" strokeWidth="3" />
                    <text x={position.mapX * VIEW_WIDTH + 17} y={position.mapY * height + 6} fontSize="20" fontWeight="700" fill="#111827" stroke="#ffffff" strokeWidth="5" paintOrder="stroke">{element.code}</text>
                  </g>
                )
              })}
              {markers.map((marker) => {
                const target = { kind: "marker" as const, id: marker.id }
                const position = positionOf(target)
                if (!position) return null
                const x = position.mapX * VIEW_WIDTH, y = position.mapY * height
                return (
                  <g key={marker.id} onPointerDown={(event) => startDrag(event, target)} className={position.source === "MANUAL" && image ? "cursor-move" : ""}>
                    <title>{marker.label}</title>
                    <path d={`M ${x} ${y - 16} L ${x + 15} ${y + 10} L ${x - 15} ${y + 10} Z`} fill="#ffffff" fillOpacity="0.6" stroke="#dc2626" strokeWidth="5" strokeLinejoin="round" />
                    <text x={x + 20} y={y + 8} fontSize="20" fontWeight="800" fill="#111827" stroke="#ffffff" strokeWidth="5" paintOrder="stroke">{marker.label}</text>
                  </g>
                )
              })}
            </svg>
          ) : (
            <p className="py-16 text-center text-sm text-ink-muted">Lae üles kaardipilt või sisesta KP-dele MGRS-koordinaadid.</p>
          )}
          <p className="mt-2 text-xs text-ink-muted">
            <span className="mr-3"><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-blue-600" />kaardile märgitud</span>
            <span className="mr-3"><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-violet-600" />koordinaadi järgi</span>
            {geometry?.georef
              ? `Kaart on koordinaatidega seotud ${geometry.georef.controlPointIds.length} punkti abil, keskmine erinevus ${Math.round(geometry.georef.rmsMeters)} m.`
              : image ? "Koordinaatidega KP-de automaatseks paigutamiseks märgi kaardile vähemalt kaks KP-d, millel on MGRS-koordinaat." : ""}
          </p>
        </Card>

        <div className="space-y-5">
          <Card className="p-4">
            <h2 className="font-semibold text-ink">KP-d <span className="text-sm font-normal text-ink-muted">({placed}/{routeElements.length} kaardil)</span></h2>
            <ul className="mt-2 divide-y divide-line">
              {elements.map((element) => {
                const target = { kind: "element" as const, id: element.id }
                const position = positionOf(target)
                const approx = element.mgrs ? null : approximateMgrs(target)
                return (
                  <li key={element.id} className="py-2.5 text-sm" data-map-element={element.code}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0"><span className="font-mono text-xs text-ink-subtle">{element.code}</span> <span className="font-medium text-ink">{element.name}</span></span>
                      <span className="shrink-0 text-right text-xs">{locationStatus(target, element.latitude != null)}</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <Input key={`${element.id}:${element.mgrs ?? ""}`} defaultValue={element.mgrs ?? ""} placeholder={approx ? `≈ ${approx}` : "MGRS"}
                        aria-label={`${element.code} MGRS-koordinaat`} className="h-9 min-w-0 flex-1 py-1 font-mono text-xs" disabled={busy}
                        onBlur={(event) => void commitMgrs(target, event.target.value, element.mgrs)}
                        onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur() }} />
                      <button type="button" className={actionButton} disabled={!image || busy} onClick={() => { setPlacing(target); setMessage(null) }}>Märgi kaardile</button>
                      {position?.source === "MANUAL" && (
                        <button type="button" className={actionButton} disabled={busy} onClick={() => void saveLocations({ elements: [{ id: element.id, mapX: null, mapY: null }] })}>Eemalda</button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </Card>

          <Card className="p-4">
            <h2 className="font-semibold text-ink">Märgid</h2>
            <p className="text-xs text-ink-muted">Start, finiš, peakorter või muu oluline koht.</p>
            <form className="mt-2 flex gap-2" onSubmit={(event) => { event.preventDefault(); void addMarker() }}>
              <Input value={newMarker} onChange={(event) => setNewMarker(event.target.value)} maxLength={60} placeholder="nt Start KT" aria-label="Uue märgi nimi" className="h-9 py-1" />
              <Button type="submit" size="sm" disabled={busy || !newMarker.trim()}>Lisa</Button>
            </form>
            <ul className="mt-2 divide-y divide-line">
              {markers.map((marker) => {
                const target = { kind: "marker" as const, id: marker.id }
                return (
                  <li key={marker.id} className="py-2.5 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium text-ink">{marker.label}</span>
                      <span className="shrink-0 text-xs">{locationStatus(target, marker.latitude != null)}</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <Input key={`${marker.id}:${marker.mgrs ?? ""}`} defaultValue={marker.mgrs ?? ""} placeholder="MGRS" aria-label={`${marker.label} MGRS-koordinaat`}
                        className="h-9 min-w-0 flex-1 py-1 font-mono text-xs" disabled={busy}
                        onBlur={(event) => void commitMgrs(target, event.target.value, marker.mgrs)}
                        onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur() }} />
                      <button type="button" className={actionButton} disabled={!image || busy} onClick={() => { setPlacing(target); setMessage(null) }}>Märgi kaardile</button>
                      <button type="button" className={actionButton} disabled={busy} onClick={() => void saveLocations({ markers: markers.filter((item) => item.id !== marker.id) })}>Kustuta</button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  )
}
