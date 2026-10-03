"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input, Select } from "@/components/ui/input"
import {
  DASHBOARD_GROUP_LABELS,
  DASHBOARD_PRESETS,
  DEFAULT_ROUTE_KEY,
  MAP_COLOR_MODES,
  MAP_COLOR_MODE_LABELS,
  ROUTE_MODES,
  ROUTE_MODE_LABELS,
  applyDashboardPreset,
  dashboardWidget,
  type DashboardConfig,
  type DashboardPreset,
  type DashboardThresholds,
  type RouteMode,
} from "@/lib/dashboard/config"

type ElementOption = { id: string; code: string; name: string; type: string }
type RouteDraft = { mode: RouteMode | "INHERIT"; codes: string }

const THRESHOLD_FIELDS: { key: keyof DashboardThresholds; label: string; unit: string; step?: string }[] = [
  { key: "freshnessWarnMinutes", label: "KP vaikne (kollane) pärast", unit: "min" },
  { key: "freshnessAlertMinutes", label: "KP vaikib (punane) pärast", unit: "min" },
  { key: "safetyMinutes", label: "Ohutushoiatus, kui võistkonda pole nähtud", unit: "min" },
  { key: "topCount", label: "Parimate võistkondade arv", unit: "tk" },
  { key: "closeGap", label: "Tihe heitlus, kui vahe on kuni", unit: "p", step: "0.01" },
  { key: "screenRotateSeconds", label: "Ekraanirežiimis vidina vahetus", unit: "s" },
]

function splitCodes(text: string) {
  return text.split(/[\s,;]+/).map((code) => code.trim()).filter(Boolean)
}

export function DashboardSettingsForm({ competitionId, initialConfig, classes, elements }: {
  competitionId: string
  initialConfig: DashboardConfig
  classes: string[]
  elements: ElementOption[]
}) {
  const router = useRouter()
  const [config, setConfig] = useState(initialConfig)
  const [thresholds, setThresholds] = useState<Record<keyof DashboardThresholds, string>>(
    Object.fromEntries(Object.entries(initialConfig.thresholds).map(([key, value]) => [key, String(value)])) as Record<keyof DashboardThresholds, string>
  )
  const codeById = new Map(elements.map((element) => [element.id, element.code]))
  const routeKeys = [DEFAULT_ROUTE_KEY, ...classes]
  const [routes, setRoutes] = useState<Record<string, RouteDraft>>(() => Object.fromEntries(routeKeys.map((key) => {
    const route = initialConfig.routes[key]
    return [key, { mode: route?.mode ?? (key === DEFAULT_ROUTE_KEY ? "ORDER" : "INHERIT"), codes: (route?.elementIds ?? []).map((id) => codeById.get(id) ?? "").filter(Boolean).join(", ") }]
  })))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null)

  const elementByCode = new Map(elements.map((element) => [element.code.toLocaleLowerCase("et"), element]))
  const unknownCodes = (text: string) => splitCodes(text).filter((code) => !elementByCode.has(code.toLocaleLowerCase("et")))

  function updateWidget(index: number, patch: { internal?: boolean; public?: boolean }) {
    setConfig((current) => ({ ...current, widgets: current.widgets.map((widget, i) => (i === index ? { ...widget, ...patch } : widget)) }))
  }
  function move(index: number, delta: number) {
    setConfig((current) => {
      const target = index + delta
      if (target < 0 || target >= current.widgets.length) return current
      const widgets = [...current.widgets]
      ;[widgets[index], widgets[target]] = [widgets[target], widgets[index]]
      return { ...current, widgets }
    })
  }
  function applyPreset(preset: DashboardPreset) {
    setConfig((current) => applyDashboardPreset(current, preset))
    setMessage({ tone: "ok", text: `Eelseade „${DASHBOARD_PRESETS[preset].label}” on valitud. Salvesta, et see jõustuks.` })
  }

  async function save() {
    setMessage(null)
    const routeConfig: DashboardConfig["routes"] = {}
    for (const key of routeKeys) {
      const draft = routes[key]
      // Elementide järjekord on niigi vaikimisi, seda pole vaja salvestada.
      if (!draft || draft.mode === "INHERIT" || (key === DEFAULT_ROUTE_KEY && draft.mode === "ORDER")) continue
      if (draft.mode === "CUSTOM") {
        const unknown = unknownCodes(draft.codes)
        const ids = splitCodes(draft.codes).flatMap((code) => {
          const element = elementByCode.get(code.toLocaleLowerCase("et"))
          return element ? [element.id] : []
        })
        if (unknown.length || ids.length === 0) {
          setMessage({ tone: "error", text: `${key || "Kõik klassid"}: ${unknown.length ? `tundmatu tähis ${unknown.join(", ")}` : "lisa vähemalt üks KP tähis"}.` })
          return
        }
        if (new Set(ids).size !== ids.length) {
          setMessage({ tone: "error", text: `${key || "Kõik klassid"}: KP tähis kordub.` })
          return
        }
        routeConfig[key] = { mode: "CUSTOM", elementIds: ids }
      } else {
        routeConfig[key] = { mode: draft.mode, elementIds: [] }
      }
    }
    const thresholdValues = Object.fromEntries(Object.entries(thresholds).map(([key, value]) => [key, Number(value.replace(",", "."))])) as DashboardThresholds
    if (Object.values(thresholdValues).some((value) => !Number.isFinite(value))) {
      setMessage({ tone: "error", text: "Lävendid peavad olema arvud." })
      return
    }
    setSaving(true)
    try {
      const response = await fetch(`/api/competitions/${competitionId}/dashboard-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...config, thresholds: thresholdValues, routes: routeConfig }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        setMessage({ tone: "error", text: body.error ?? "Salvestamine ebaõnnestus." })
        return
      }
      const saved = body as DashboardConfig
      setConfig(saved)
      setThresholds(Object.fromEntries(Object.entries(saved.thresholds).map(([key, value]) => [key, String(value)])) as Record<keyof DashboardThresholds, string>)
      setMessage({ tone: "ok", text: "Salvestatud." })
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  const sectionTitle = "font-semibold text-ink"
  return (
    <div className="space-y-5">
      <Card className="space-y-3 p-5">
        <h2 className={sectionTitle}>Eelseaded</h2>
        <p className="text-sm text-ink-muted">Eelseade valib vidinad ja tõstab need ettepoole. Seejärel saad üksikuid vidinaid muuta.</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {(Object.keys(DASHBOARD_PRESETS) as DashboardPreset[]).map((preset) => (
            <button key={preset} type="button" onClick={() => applyPreset(preset)}
              className="rounded-lg border border-line bg-surface p-3 text-left hover:border-primary hover:bg-primary-soft">
              <span className="block font-medium text-ink">{DASHBOARD_PRESETS[preset].label}</span>
              <span className="mt-1 block text-xs text-ink-muted">{DASHBOARD_PRESETS[preset].description}</span>
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className={sectionTitle}>Vidinad</h2>
        <p className="mt-1 text-sm text-ink-muted">Järjekord kehtib nii töölaual kui ka avalikus vaates. Osa vidinaid sisaldab isikuandmeid või sisekorralduslikku infot ja on ainult korraldajale.</p>
        <ul className="mt-3 divide-y divide-line">
          {config.widgets.map((setting, index) => {
            const widget = dashboardWidget(setting.id)
            return (
              <li key={setting.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center" data-widget-setting={setting.id}>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">{widget.title} <span className="ml-1 rounded bg-canvas px-1.5 py-0.5 text-xs font-normal text-ink-muted">{DASHBOARD_GROUP_LABELS[widget.group]}</span></p>
                  <p className="text-xs text-ink-muted">{widget.description}</p>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <label className="flex min-h-11 items-center gap-2">
                    <input type="checkbox" checked={setting.internal} onChange={(event) => updateWidget(index, { internal: event.target.checked })} className="h-4 w-4" />
                    Töölaual
                  </label>
                  {widget.publicAllowed ? (
                    <label className="flex min-h-11 items-center gap-2">
                      <input type="checkbox" checked={setting.public} onChange={(event) => updateWidget(index, { public: event.target.checked })} className="h-4 w-4" />
                      Avalikus vaates
                    </label>
                  ) : (
                    <span className="flex min-h-11 items-center text-xs text-ink-subtle">Ainult korraldajale</span>
                  )}
                  <span className="flex gap-1">
                    <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Tõsta „${widget.title}” üles`}
                      className="min-h-11 min-w-11 rounded-lg border border-line text-ink-soft hover:bg-canvas disabled:opacity-30">↑</button>
                    <button type="button" onClick={() => move(index, 1)} disabled={index === config.widgets.length - 1} aria-label={`Tõsta „${widget.title}” alla`}
                      className="min-h-11 min-w-11 rounded-lg border border-line text-ink-soft hover:bg-canvas disabled:opacity-30">↓</button>
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className={sectionTitle}>Lävendid</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {THRESHOLD_FIELDS.map((field) => (
            <label key={field.key} className="text-sm">
              <span className="text-ink-soft">{field.label}</span>
              <span className="mt-1 flex items-center gap-2">
                <Input type="number" inputMode="decimal" step={field.step ?? "1"} value={thresholds[field.key]}
                  onChange={(event) => setThresholds((current) => ({ ...current, [field.key]: event.target.value }))} className="w-28" />
                <span className="text-ink-muted">{field.unit}</span>
              </span>
            </label>
          ))}
        </div>
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className={sectionTitle}>KP-de läbimise järjekord</h2>
        <p className="text-sm text-ink-muted">
          Järjekorra järgi leitakse võistkonna järgmine KP ja vahele jäänud KP-d. Kui klassid liiguvad eri suunas või eri KP-de kaudu, määra järjekord klassiti.
          Vaba järjekorra korral (nt rogain) märgi finiš, et lõpetanud võistkonnad ei tekitaks ohutushoiatust.
        </p>
        <div className="space-y-3">
          {routeKeys.map((key) => {
            const draft = routes[key]
            const unknown = draft.mode === "CUSTOM" ? unknownCodes(draft.codes) : []
            return (
              <div key={key || "default"} className="grid gap-2 sm:grid-cols-[10rem_14rem_minmax(0,1fr)] sm:items-center">
                <span className="text-sm font-medium text-ink">{key || "Kõik klassid"}</span>
                <Select aria-label={`${key || "Kõik klassid"}: järjekord`} value={draft.mode}
                  onChange={(event) => setRoutes((current) => ({ ...current, [key]: { ...current[key], mode: event.target.value as RouteDraft["mode"] } }))}>
                  {key !== DEFAULT_ROUTE_KEY && <option value="INHERIT">Nagu kõik klassid</option>}
                  {ROUTE_MODES.map((mode) => <option key={mode} value={mode}>{ROUTE_MODE_LABELS[mode]}</option>)}
                </Select>
                {draft.mode === "CUSTOM" ? (
                  <div>
                    <Input aria-label={`${key || "Kõik klassid"}: KP-de tähised järjekorras`} placeholder="nt KP10, KP11, KP1, KP2" value={draft.codes}
                      onChange={(event) => setRoutes((current) => ({ ...current, [key]: { ...current[key], codes: event.target.value } }))} />
                    {unknown.length > 0 && <p className="mt-1 text-xs text-danger">Tundmatu tähis: {unknown.join(", ")}</p>}
                  </div>
                ) : <span />}
              </div>
            )
          })}
        </div>
        <label className="block text-sm">
          <span className="block text-ink-soft">Finiš (lõpetanuks loetakse võistkond, kelle tulemus siin on)</span>
          <Select className="mt-1 block sm:w-96" value={config.finishElementId ?? ""}
            onChange={(event) => setConfig((current) => ({ ...current, finishElementId: event.target.value || null }))}>
            <option value="">Järjestatud raja viimane KP</option>
            {elements.map((element) => <option key={element.id} value={element.id}>{element.code} {element.name}</option>)}
          </Select>
        </label>
      </Card>

      <Card className="space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={sectionTitle}>Kaart</h2>
          <Link href={`/dashboard/competitions/${competitionId}/map`} className="text-sm text-primary hover:underline">Kaardipilt ja KP-de asukohad →</Link>
        </div>
        <label className="block text-sm">
          <span className="block text-ink-soft">Mullide värv</span>
          <Select className="mt-1 block sm:w-64" value={config.mapColorMode}
            onChange={(event) => setConfig((current) => ({ ...current, mapColorMode: event.target.value as DashboardConfig["mapColorMode"] }))}>
            {MAP_COLOR_MODES.map((mode) => <option key={mode} value={mode}>{MAP_COLOR_MODE_LABELS[mode]}</option>)}
          </Select>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4" checked={config.mapPublicWhileActive}
            onChange={(event) => setConfig((current) => ({ ...current, mapPublicWhileActive: event.target.checked }))} />
          <span>
            Näita avalikku kaarti ka enne võistluse lõppu
            <span className="block text-xs text-ink-muted">Kaart näitab KP-de asukohti. Vaikimisi on avalik kaart nähtav alles siis, kui võistlus on lõppenud.</span>
          </span>
        </label>
      </Card>

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-line bg-canvas/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        <Button type="button" onClick={save} disabled={saving}>{saving ? "Salvestan…" : "Salvesta"}</Button>
        <Link href={`/dashboard/competitions/${competitionId}/overview`} className="text-sm text-ink-muted hover:underline">Tagasi statistikasse</Link>
        {message && <p role={message.tone === "error" ? "alert" : "status"} className={`text-sm ${message.tone === "error" ? "text-danger" : "text-success"}`}>{message.text}</p>}
      </div>
    </div>
  )
}
