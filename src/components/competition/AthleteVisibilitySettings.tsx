"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { DEFAULT_RANGES, type RangeBucket, type AthletePointsMode } from "@/lib/athletePoints"

type ElementRow = { id: string; code: string; name: string; reveal: boolean }

const MODES: { value: AthletePointsMode; label: string; desc: string }[] = [
  { value: "HIDDEN", label: "Peidetud", desc: "Sportlased ei näe punkte (vaikeseade)." },
  { value: "EXACT", label: "Täpsed punktid", desc: "Näitab täpset punktide arvu (1:1)." },
  { value: "RANGE", label: "Vahemikega", desc: "Näitab protsendipõhist vahemikku + silti (nt \"Hea (10–20p)\")." },
]

export function AthleteVisibilitySettings({
  competitionId,
  initialMode,
  initialRanges,
  initialShowTotal,
  initialElements,
}: {
  competitionId: string
  initialMode: AthletePointsMode
  initialRanges: RangeBucket[]
  initialShowTotal: boolean
  initialElements: ElementRow[]
}) {
  const router = useRouter()
  const [mode, setMode] = useState<AthletePointsMode>(initialMode)
  const [ranges, setRanges] = useState<RangeBucket[]>(initialRanges.length > 0 ? initialRanges : DEFAULT_RANGES)
  const [showTotal, setShowTotal] = useState(initialShowTotal)
  const [elements, setElements] = useState<ElementRow[]>(initialElements)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function patch(body: Record<string, unknown>) {
    const res = await fetch(`/api/competitions/${competitionId}/athlete-visibility`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    return res.ok
  }

  async function saveSettings() {
    setSaving(true)
    setSaved(false)
    const ok = await patch({ mode, ranges, showTotal })
    setSaving(false)
    if (ok) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      router.refresh()
    }
  }

  async function toggleElement(id: string, reveal: boolean) {
    setElements(prev => prev.map(e => e.id === id ? { ...e, reveal } : e))
    await patch({ elements: [{ id, reveal }] })
    router.refresh()
  }

  async function revealAll(reveal: boolean) {
    setElements(prev => prev.map(e => ({ ...e, reveal })))
    await patch({ revealAll: reveal })
    router.refresh()
  }

  return (
    <div className="space-y-5">
      {/* Režiim */}
      <div className="bg-white border rounded-xl p-5 space-y-3">
        <h2 className="font-semibold text-gray-900">Punktide nähtavus sportlastele</h2>
        <p className="text-xs text-gray-500">Vaikimisi on punktid peidetud. Saad need avaldada ja vajadusel uuesti peita.</p>
        <div className="space-y-2">
          {MODES.map(m => (
            <label key={m.value} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${mode === m.value ? "border-blue-500 bg-blue-50" : "hover:bg-gray-50"}`}>
              <input type="radio" name="athleteMode" checked={mode === m.value} onChange={() => setMode(m.value)} className="mt-0.5 accent-blue-600" />
              <div>
                <p className="text-sm font-medium text-gray-900">{m.label}</p>
                <p className="text-xs text-gray-500">{m.desc}</p>
              </div>
            </label>
          ))}
        </div>

        {/* Vahemikud (ainult RANGE) */}
        {mode === "RANGE" && (
          <div className="border-t pt-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-gray-600">Vahemikud (% elemendi maksimumist)</p>
              <button type="button" onClick={() => setRanges([...ranges, { maxPct: 100, label: "" }])}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium">+ Lisa vahemik</button>
            </div>
            <p className="text-xs text-gray-400">Iga rida: ülempiir (%) ja silt. Vahemik arvutatakse eelmise piiri ja selle piiri vahel.</p>
            {ranges.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-10">kuni</span>
                <input type="number" min={1} max={100} value={r.maxPct}
                  onChange={e => setRanges(ranges.map((x, idx) => idx === i ? { ...x, maxPct: Number(e.target.value) } : x))}
                  onFocus={e => e.target.select()}
                  className="w-20 px-2 py-1.5 border rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                <span className="text-xs text-gray-400">%</span>
                <input type="text" value={r.label} placeholder="silt (nt Hea)"
                  onChange={e => setRanges(ranges.map((x, idx) => idx === i ? { ...x, label: e.target.value } : x))}
                  className="flex-1 px-2 py-1.5 border rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                {ranges.length > 1 && (
                  <button type="button" onClick={() => setRanges(ranges.filter((_, idx) => idx !== i))}
                    className="text-red-400 hover:text-red-600 text-sm px-1">✕</button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Kogusumma */}
        {mode !== "HIDDEN" && (
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer border-t pt-3">
            <input type="checkbox" checked={showTotal} onChange={e => setShowTotal(e.target.checked)} className="accent-blue-600" />
            Näita ka kogusummat ja pingerea kohta
          </label>
        )}

        <div className="flex items-center gap-3 pt-1">
          <button onClick={saveSettings} disabled={saving}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {saving ? "Salvestan..." : "Salvesta seaded"}
          </button>
          {saved && <span className="text-sm text-green-600">✓ Salvestatud</span>}
        </div>
      </div>

      {/* Per-element avaldamine */}
      {mode !== "HIDDEN" && (
        <div className="bg-white border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-900">Milliste elementide punktid on nähtavad</h2>
              <p className="text-xs text-gray-400 mt-0.5">Avalda järk-järgult või kõik korraga</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => revealAll(true)} className="text-xs px-2.5 py-1 border rounded text-gray-600 hover:bg-gray-50">Näita kõik</button>
              <button onClick={() => revealAll(false)} className="text-xs px-2.5 py-1 border rounded text-gray-600 hover:bg-gray-50">Peida kõik</button>
            </div>
          </div>
          <div className="divide-y">
            {elements.length === 0 ? (
              <p className="px-5 py-6 text-sm text-gray-400 text-center">Ühtegi elementi pole</p>
            ) : (
              elements.map(el => (
                <label key={el.id} className="px-5 py-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50">
                  <input type="checkbox" checked={el.reveal} onChange={e => toggleElement(el.id, e.target.checked)} className="accent-blue-600" />
                  <span className="font-mono text-xs text-gray-400 w-7">{el.code}</span>
                  <span className="text-sm text-gray-900">{el.name}</span>
                  {el.reveal && <span className="ml-auto text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Nähtav</span>}
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
