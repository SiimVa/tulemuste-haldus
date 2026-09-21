"use client"
import { calculateEstimation, formatEstimate, parseEstimates, readEstimation } from "@/lib/estimation"
import type { PointField } from "@/lib/pointFields"
export function EstimationFieldInput({ field, value, onChange, disabled }: { field: PointField; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const config = readEstimation(field.meta)
  const guesses = parseEstimates(value)
  const result = calculateEstimation(config, value)
  return <fieldset className="min-w-0 space-y-2 rounded border p-2" disabled={disabled || config.targets.some(t => t.correct === null)}>
    <legend className="text-xs text-gray-500">Võistkonna pakkumised</legend>
    {config.targets.some(t => t.correct === null) && <p className="text-sm text-amber-700">Õiged väärtused tuleb enne pakkumiste sisestamist määrata.</p>}
    {result.rows.map(row => <div className="space-y-1" key={row.id}>
      <label className="flex items-center gap-2 text-sm"><span className="min-w-0 flex-1">{row.label} ({row.unit})</span><input aria-label={`${field.label}: ${row.label}`} type="number" min="0" step="any" value={guesses[row.id] ?? ""} onWheel={e => e.currentTarget.blur()} onChange={e => {
        const next = { ...guesses, [row.id]: e.target.value }
        onChange(Object.values(next).some(v => v.trim() !== "") ? JSON.stringify(next) : "")
      }} className="w-28 min-w-0 rounded border px-2 py-1 text-sm" /></label>
      {row.points !== null && <p className="text-xs text-gray-600">Viga {formatEstimate(row.error!)} {row.unit} · {formatEstimate(row.errorPercent!)}% · {row.points} p</p>}
    </div>)}
    {result.complete ? <p className="border-t pt-2 text-xs text-blue-700">Kokku {formatEstimate(result.points)} p · eksimus {formatEstimate(result.error)} {config.unit} · protsendivigade summa {formatEstimate(result.errorPercent)}%</p> : <p className="text-xs text-gray-500">Sisesta kõik pakkumised ({result.rows.filter(r => r.guess !== null).length}/{result.rows.length}).</p>}
  </fieldset>
}
