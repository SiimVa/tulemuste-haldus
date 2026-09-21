"use client"
import { EstimationFieldInput } from "./EstimationFieldInput"
import { TimeDurationInput } from "./TimeInputs"
import { pointFieldValue, readPointMeta, type PointField } from "@/lib/pointFields"
export function PointFieldInput({ field, value, onChange, disabled, className }: { field: PointField; value: string; onChange: (value: string) => void; disabled?: boolean; className?: string }) {
  if (field.type === "ESTIMATION") return <EstimationFieldInput field={field} value={value} onChange={onChange} disabled={disabled} />
  const points = pointFieldValue(field, value)
  if (field.type === "POINTS_SELECT") return <select aria-label={field.label} value={value} onChange={e => onChange(e.target.value)} disabled={disabled} className={className}>
    <option value="">Vali…</option>
    {(readPointMeta(field.meta).options ?? []).map(o => <option key={o.id} value={o.id}>{o.label} ({o.points} p)</option>)}
  </select>
  return <div><TimeDurationInput aria-label={field.label} value={value} onChange={onChange} disabled={disabled} className={className} placeholder="m:ss" />{points !== undefined && <span className="block text-xs text-blue-600">{points} p</span>}</div>
}
