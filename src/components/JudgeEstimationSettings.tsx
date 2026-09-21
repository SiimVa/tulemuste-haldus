"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { estimateNumber, readEstimation, targetUnit } from "@/lib/estimation"
import type { PointField } from "@/lib/pointFields"
export function JudgeEstimationSettings({ elementId, field, accessToken }: { elementId: string; field: PointField & { id: string }; accessToken?: string }) {
  const router = useRouter()
  const config = readEstimation(field.meta)
  const [values, setValues] = useState(() => Object.fromEntries(config.targets.map(t => [t.id, t.correct === null ? "" : String(t.correct)])))
  const [message, setMessage] = useState("")
  const [saving, setSaving] = useState(false)
  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage("")
    try {
      const response = await fetch(`/api/elements/${elementId}/estimation-reference`, {
        method: "PATCH", headers: { "Content-Type": "application/json", ...(accessToken ? { "x-access-token": accessToken } : {}) },
        body: JSON.stringify({ fieldId: field.id, correct: Object.fromEntries(config.targets.map(t => [t.id, estimateNumber(values[t.id])])) }),
      })
      const data = await response.json()
      if (!response.ok) { setMessage(data.error || "Salvestamine ebaõnnestus"); return }
      setMessage("Õiged väärtused salvestatud ja tulemused uuesti arvutatud.")
      router.refresh()
    } catch { setMessage("Salvestamine ebaõnnestus. Proovi uuesti.") } finally { setSaving(false) }
  }
  return <details className="m-3 rounded border bg-blue-50/40 p-3">
    <summary className="cursor-pointer text-sm font-medium">Õiged väärtused: {field.label}</summary>
    <form onSubmit={save} className="mt-3 space-y-2">
      <p className="text-xs text-gray-600">Need kaugused kehtivad kõigile võistkondadele. Salvestamine arvutab ka olemasolevad tulemused uuesti.</p>
      {config.targets.map(target => <label key={target.id} className="flex items-center gap-2 text-sm"><span className="min-w-0 flex-1">{target.label} ({targetUnit(config, target)})</span><input aria-label={`Õige väärtus: ${target.label}`} type="number" step="any" min="0.000000001" required value={values[target.id] ?? ""} onChange={e => setValues({ ...values, [target.id]: e.target.value })} className="w-28 min-w-0 rounded border px-2 py-1" /></label>)}
      <button disabled={saving} className="rounded bg-blue-600 px-3 py-2 text-sm text-white">{saving ? "Salvestan…" : "Salvesta õiged väärtused"}</button>
      {message && <p role="status" className="text-sm">{message}</p>}
    </form>
  </details>
}
