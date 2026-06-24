"use client"

import { useState, useEffect } from "react"
import { parseValidation, validateFieldValue } from "@/lib/fieldValidation"
import { naturalCompare } from "@/lib/utils"

type Field = { id: string; name: string; label: string; type: string; isResultField: boolean; formula?: string | null; validation?: string | null }
type Exception = { id: string; label: string; penalty: number }
type Element = { id: string; name: string; code: string; fields: Field[]; exceptions: Exception[] }
type Team = { id: string; name: string; code: string; class?: string | null }
type ExistingResult = { elementId: string; teamId: string; values: string; exceptionLabel?: string | null; updatedAt: Date }

interface Props {
  accessToken: string
  elements: Element[]
  teams: Team[]
  existingResults: ExistingResult[]
}

export function JudgeInterface({ accessToken, elements, teams, existingResults }: Props) {
  const [selectedElementId, setSelectedElementId] = useState(elements[0]?.id ?? null)
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const [formValues, setFormValues] = useState<Record<string, string>>({})
  const [exceptionLabel, setExceptionLabel] = useState("")
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [results, setResults] = useState<ExistingResult[]>(existingResults)
  const [prefillStarts, setPrefillStartsRaw] = useState<Record<string, string>>({})
  const [showStartHelper, setShowStartHelper] = useState(false)
  const [commonStart, setCommonStart] = useState("")
  const [intervalStart, setIntervalStart] = useState("")
  const [intervalMinutes, setIntervalMinutes] = useState("2")

  // Lae sessionStorage-ist kui element muutub
  useEffect(() => {
    if (!selectedElementId) return
    try {
      const stored = sessionStorage.getItem(`prefillStarts_${selectedElementId}`)
      setPrefillStartsRaw(stored ? JSON.parse(stored) : {})
    } catch { setPrefillStartsRaw({}) }
  }, [selectedElementId])

  function setPrefillStarts(val: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) {
    setPrefillStartsRaw(prev => {
      const next = typeof val === "function" ? val(prev) : val
      try {
        if (selectedElementId) {
          if (Object.keys(next).length > 0) sessionStorage.setItem(`prefillStarts_${selectedElementId}`, JSON.stringify(next))
          else sessionStorage.removeItem(`prefillStarts_${selectedElementId}`)
        }
      } catch {}
      return next
    })
  }

  const selectedElement = elements.find(e => e.id === selectedElementId)
  const inputFields = selectedElement?.fields.filter(f => f.type !== "COMPUTED") ?? []
  const hasTimeRange = (selectedElement?.fields ?? []).some(f => f.type === "TIME_RANGE")

  function timeToSec(v: string): number {
    const p = String(v).trim().split(":")
    if (p.length === 3) return (parseInt(p[0]) || 0) * 3600 + (parseInt(p[1]) || 0) * 60 + (parseInt(p[2]) || 0)
    if (p.length === 2) return (parseInt(p[0]) || 0) * 60 + (parseInt(p[1]) || 0)
    return 0
  }

  function secToTime(s: number): string {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = Math.floor(s % 60)
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
  }

  function applyCommonStart() {
    if (!commonStart.trim()) return
    const newPrefill: Record<string, string> = {}
    for (const team of teams) newPrefill[team.id] = commonStart.trim()
    setPrefillStarts(newPrefill)
  }

  function applyIntervalStarts() {
    if (!intervalStart.trim()) return
    const intervalSec = parseFloat(intervalMinutes) * 60
    if (!isFinite(intervalSec) || intervalSec <= 0) return
    const startSec = timeToSec(intervalStart)
    const sorted = [...teams]
      .filter(t => parseInt(t.code) !== 0)
      .sort((a, b) => naturalCompare(a.code, b.code))
    const newPrefill: Record<string, string> = {}
    sorted.forEach((team, i) => { newPrefill[team.id] = secToTime(startSec + i * intervalSec) })
    setPrefillStarts(newPrefill)
  }

  function getExisting(elementId: string, teamId: string) {
    return results.find(r => r.elementId === elementId && r.teamId === teamId)
  }

  function selectTeam(team: Team) {
    if (!selectedElement) return
    setSelectedTeamId(team.id)
    setError("")
    const existing = getExisting(selectedElement.id, team.id)
    if (existing) {
      try { setFormValues(JSON.parse(existing.values)) } catch { setFormValues({}) }
      setExceptionLabel(existing.exceptionLabel ?? "")
    } else {
      const prefillStart = prefillStarts[team.id]
      if (prefillStart) {
        const initValues: Record<string, string> = {}
        for (const f of selectedElement.fields.filter(f => f.type === "TIME_RANGE")) {
          initValues[f.name + "_start"] = prefillStart
        }
        setFormValues(initValues)
      } else {
        setFormValues({})
      }
      setExceptionLabel("")
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedTeamId || !selectedElementId) return
    setError("")

    // Kliendipoolne valideerimine
    if (!exceptionLabel) {
      for (const field of inputFields) {
        const validation = parseValidation(field.validation)
        if (!Object.keys(validation).length) continue
        if (field.type === "TIME_RANGE") {
          if (validation.required) {
            const hasStart = (formValues[field.name + "_start"] ?? "").trim() !== ""
            const hasEnd = (formValues[field.name + "_end"] ?? "").trim() !== ""
            if (!hasStart || !hasEnd) {
              setError(`${field.label} — sisesta nii algusaeg kui lõppaeg`)
              return
            }
          }
          continue
        }
        const err = validateFieldValue(formValues[field.name], field.name, field.label, field.type, validation)
        if (err) { setError(err.message); return }
      }
    }

    setSaving(true)

    const res = await fetch(`/api/elements/${selectedElementId}/results`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-access-token": accessToken },
      body: JSON.stringify({
        teamId: selectedTeamId,
        values: exceptionLabel ? {} : formValues,
        exceptionLabel: exceptionLabel || null,
      }),
    })

    setSaving(false)
    if (res.ok) {
      const data = await res.json().catch(() => ({}))
      const team = teams.find(t => t.id === selectedTeamId)
      setLastSaved(`${team?.name} — ${new Date().toLocaleTimeString("et-EE")}`)
      // Uuenda lokaalne results state koheselt (ilma lehe refreshita)
      setResults(prev => {
        const filtered = prev.filter(r => !(r.elementId === selectedElementId && r.teamId === selectedTeamId))
        // Kui server kustutas (kõik tühjad) → eemalda lokaalselt, ära lisa
        if (data.deleted) return filtered
        const newResult: ExistingResult = {
          elementId: selectedElementId,
          teamId: selectedTeamId,
          values: exceptionLabel ? "{}" : JSON.stringify(formValues),
          exceptionLabel: exceptionLabel || null,
          updatedAt: new Date(),
        }
        return [...filtered, newResult]
      })
      setSelectedTeamId(null)
      setFormValues({})
      setExceptionLabel("")
    } else {
      const data = await res.json()
      setError(data.error ?? "Salvestamine ebaõnnestus")
    }
  }

  return (
    <div className="space-y-4">
      {/* Vali element */}
      {elements.length > 1 && (
        <div className="bg-white border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Vali KP / element</h3>
          <div className="flex flex-wrap gap-2">
            {elements.map(el => (
              <button key={el.id}
                onClick={() => { setSelectedElementId(el.id); setSelectedTeamId(null); setShowStartHelper(false) }}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  selectedElementId === el.id
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}>
                [{el.code}] {el.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedElement && (
        <>
          <div className="bg-white border rounded-xl p-1">
            <div className="px-4 py-3 border-b">
              <h3 className="font-semibold text-gray-900">
                [{selectedElement.code}] {selectedElement.name}
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">Vali võistkond ja sisesta tulemus</p>
            </div>

            {/* Stardiaegade abivahendid (ainult TIME_RANGE elementidel) */}
            {hasTimeRange && (
              <div className="border-b">
                <button
                  type="button"
                  onClick={() => setShowStartHelper(v => !v)}
                  className="w-full text-left px-4 py-2.5 text-sm text-blue-600 hover:bg-blue-50 flex items-center gap-2"
                >
                  <span>{showStartHelper ? "▾" : "▸"}</span>
                  <span>Stardiaegade täitmine</span>
                </button>
                {showStartHelper && (
                  <div className="px-4 pb-4 space-y-4 bg-blue-50">
                    {/* 1. Kõigil sama stardiaeg */}
                    <div className="pt-3">
                      <p className="text-xs font-semibold text-gray-600 mb-2">1. Kõigil sama stardiaeg</p>
                      <div className="flex gap-2 items-center">
                        <input
                          type="text"
                          value={commonStart}
                          onChange={e => setCommonStart(e.target.value)}
                          placeholder="h:mm:ss"
                          className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                          type="button"
                          onClick={applyCommonStart}
                          className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 whitespace-nowrap"
                        >
                          Täida kõik
                        </button>
                      </div>
                    </div>
                    {/* 2. Start + intervall */}
                    <div>
                      <p className="text-xs font-semibold text-gray-600 mb-2">2. Start + stardiintervall</p>
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <div>
                          <label className="text-xs text-gray-500 mb-0.5 block">1. VK start</label>
                          <input
                            type="text"
                            value={intervalStart}
                            onChange={e => setIntervalStart(e.target.value)}
                            placeholder="h:mm:ss"
                            className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 mb-0.5 block">Intervall (min)</label>
                          <input
                            type="number"
                            value={intervalMinutes}
                            onChange={e => setIntervalMinutes(e.target.value)}
                            min="0.5"
                            step="0.5"
                            className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={applyIntervalStarts}
                        className="w-full px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
                      >
                        Arvuta stardiajad
                      </button>
                      <p className="text-xs text-gray-400 mt-1">VK0 jäetakse vahele, järjekord numrilise tähise järgi</p>
                    </div>
                    {Object.keys(prefillStarts).length > 0 && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-green-700">{Object.keys(prefillStarts).length} VK stardiajad täidetud</span>
                        <button type="button" onClick={() => setPrefillStarts({})} className="text-red-500 hover:text-red-700">Tühista</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Võistkondade nimekiri */}
            <div className="max-h-64 overflow-y-auto divide-y">
              {teams.map(team => {
                const existing = getExisting(selectedElement.id, team.id)
                const isSelected = selectedTeamId === team.id
                return (
                  <button key={team.id} onClick={() => selectTeam(team)}
                    className={`w-full text-left px-4 py-2.5 flex items-center justify-between hover:bg-gray-50 transition-colors ${isSelected ? "bg-blue-50 border-l-4 border-blue-500" : ""}`}>
                    <div>
                      <span className="font-mono text-xs text-gray-400 mr-1">{team.code}</span>
                      <span className="text-sm font-medium text-gray-900">{team.name}</span>
                      {team.class && <span className="text-xs text-gray-400 ml-1">({team.class})</span>}
                    </div>
                    {existing ? (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${existing.exceptionLabel ? "bg-red-100 text-red-600" : "bg-green-100 text-green-700"}`}>
                        {existing.exceptionLabel ?? "✓ Sisestatud"}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300">Sisestamata</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Tulemuse vorm */}
          {selectedTeamId && (
            <form onSubmit={handleSubmit} className="bg-white border rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">
                  {teams.find(t => t.id === selectedTeamId)?.name}
                </h3>
                <button type="button" onClick={() => setSelectedTeamId(null)}
                  className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
              </div>

              {/* Erand */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Eriolukord (jäta tühjaks kui sooritati)</label>
                <select value={exceptionLabel} onChange={e => setExceptionLabel(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— Sooritati normaalselt —</option>
                  {selectedElement.exceptions.map(ex => (
                    <option key={ex.id} value={ex.label}>{ex.label} ({ex.penalty}p karistust)</option>
                  ))}
                </select>
              </div>

              {/* Sisendväljad (ainult kui ei ole erandit) */}
              {!exceptionLabel && inputFields.map(field => (
                <div key={field.id}>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">
                    {field.label}
                    {field.isResultField && <span className="text-green-600 text-xs ml-1">★</span>}
                  </label>
                  {field.type === "TIME_RANGE" ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-gray-400 mb-0.5 block">Algusaeg</label>
                          <input
                            type="text"
                            value={formValues[field.name + "_start"] ?? ""}
                            onChange={e => setFormValues({ ...formValues, [field.name + "_start"]: e.target.value })}
                            placeholder="h:mm:ss"
                            className="w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-400 mb-0.5 block">Lõppaeg</label>
                          <input
                            type="text"
                            value={formValues[field.name + "_end"] ?? ""}
                            onChange={e => setFormValues({ ...formValues, [field.name + "_end"]: e.target.value })}
                            placeholder="h:mm:ss"
                            className="w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                      {formValues[field.name + "_start"] && formValues[field.name + "_end"] && (() => {
                        const toSec = (v: string) => { const p = v.trim().split(":"); return p.length === 3 ? +p[0]*3600 + +p[1]*60 + +p[2] : p.length === 2 ? +p[0]*60 + +p[1] : 0 }
                        const st = toSec(formValues[field.name + "_start"]), en = toSec(formValues[field.name + "_end"])
                        const dur = en >= st ? en - st : en + 86400 - st
                        if (dur <= 0) return null
                        const h = Math.floor(dur/3600), m = Math.floor((dur%3600)/60), s = dur%60
                        return <p className="text-xs text-blue-600">Kestvus: {h}:{String(m).padStart(2,"0")}:{String(s).padStart(2,"0")}</p>
                      })()}
                    </div>
                  ) : (
                    <input
                      type={field.type === "NUMBER" ? "number" : "text"}
                      value={formValues[field.name] ?? ""}
                      onChange={e => setFormValues({ ...formValues, [field.name]: e.target.value })}
                      placeholder={field.type === "TIME" ? "h:mm:ss" : ""}
                      className="w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      step={field.type === "NUMBER" ? "any" : undefined}
                    />
                  )}
                </div>
              ))}

              {error && <div className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</div>}

              <button type="submit" disabled={saving}
                className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {saving ? "Salvestan..." : "✓ Salvesta tulemus"}
              </button>
            </form>
          )}

          {lastSaved && !selectedTeamId && (
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">
              ✓ Viimati salvestatud: {lastSaved}
            </div>
          )}
        </>
      )}
    </div>
  )
}
