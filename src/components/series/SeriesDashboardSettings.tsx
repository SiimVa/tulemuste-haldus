"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { seriesWidget, type SeriesDashboardConfig, type SeriesThresholds } from "@/lib/seriesDashboard"

const THRESHOLD_FIELDS: { key: keyof SeriesThresholds; label: string; unit: string; step?: string }[] = [
  { key: "topCount", label: "Parimate võistkondade arv", unit: "tk" },
  { key: "closeGap", label: "Tihe heitlus, kui vahe on kuni", unit: "p", step: "0.01" },
  { key: "screenRotateSeconds", label: "Ekraanirežiimis vidina vahetus", unit: "s" },
]

// Ülevaate vidinate nähtavus (administraatorile ja avalikus vaates), järjekord ja lävendid.
export function SeriesDashboardSettings({ seriesId, initialConfig }: { seriesId: string; initialConfig: SeriesDashboardConfig }) {
  const router = useRouter()
  const [widgets, setWidgets] = useState(initialConfig.widgets)
  const [thresholds, setThresholds] = useState<Record<keyof SeriesThresholds, string>>(
    Object.fromEntries(Object.entries(initialConfig.thresholds).map(([key, value]) => [key, String(value)])) as Record<keyof SeriesThresholds, string>
  )
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null)

  function update(index: number, patch: { internal?: boolean; public?: boolean }) {
    setWidgets((current) => current.map((widget, position) => (position === index ? { ...widget, ...patch } : widget)))
  }

  function move(index: number, direction: -1 | 1) {
    setWidgets((current) => {
      const next = [...current]
      const target = index + direction
      if (target < 0 || target >= next.length) return current
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  async function save() {
    setSaving(true)
    setMessage(null)
    const response = await fetch(`/api/series/${seriesId}/dashboard-config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        widgets,
        thresholds: Object.fromEntries(Object.entries(thresholds).map(([key, value]) => [key, Number(value.replace(",", "."))])),
      }),
    })
    const body = await response.json().catch(() => ({}))
    setSaving(false)
    if (!response.ok) {
      setMessage({ tone: "error", text: body.error ?? "Salvestamine ebaõnnestus." })
      return
    }
    setMessage({ tone: "ok", text: "Salvestatud." })
    router.refresh()
  }

  return (
    <Card className="space-y-4 p-5">
      <div>
        <h2 className="font-semibold text-ink">Ülevaate vidinad</h2>
        <p className="mt-1 text-sm text-ink-muted">Järjekord kehtib nii administraatori ülevaates kui ka avalikus vaates ja ekraanirežiimis.</p>
      </div>
      <ul className="divide-y divide-line">
        {widgets.map((setting, index) => {
          const widget = seriesWidget(setting.id)
          return (
            <li key={setting.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center" data-widget-setting={setting.id}>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-ink">{widget.title}</p>
                <p className="text-xs text-ink-muted">{widget.description}</p>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <label className="flex min-h-11 items-center gap-2">
                  <input type="checkbox" checked={setting.internal} onChange={(event) => update(index, { internal: event.target.checked })} className="h-4 w-4" />
                  Administraatorile
                </label>
                <label className="flex min-h-11 items-center gap-2">
                  <input type="checkbox" checked={setting.public} onChange={(event) => update(index, { public: event.target.checked })} className="h-4 w-4" aria-label={`${widget.title}: avalikus vaates`} />
                  Avalikus vaates
                </label>
                <span className="flex gap-1">
                  <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Tõsta „${widget.title}” üles`}
                    className="min-h-11 min-w-11 rounded-lg border border-line text-ink-soft hover:bg-canvas disabled:opacity-30">↑</button>
                  <button type="button" onClick={() => move(index, 1)} disabled={index === widgets.length - 1} aria-label={`Tõsta „${widget.title}” alla`}
                    className="min-h-11 min-w-11 rounded-lg border border-line text-ink-soft hover:bg-canvas disabled:opacity-30">↓</button>
                </span>
              </div>
            </li>
          )
        })}
      </ul>
      <div className="grid gap-3 sm:grid-cols-3">
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
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={save} disabled={saving}>{saving ? "Salvestan…" : "Salvesta vidinad"}</Button>
        {message && <p role={message.tone === "error" ? "alert" : "status"} className={`text-sm ${message.tone === "error" ? "text-danger" : "text-green-700"}`}>{message.text}</p>}
      </div>
    </Card>
  )
}
