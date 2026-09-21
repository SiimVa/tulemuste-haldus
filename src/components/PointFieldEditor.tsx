"use client"
import { EstimationFieldEditor } from "./EstimationFieldEditor"
import { durationLabel, durationSeconds, exampleTimeMeta, readPointMeta, type PointFieldMeta } from "@/lib/pointFields"
export function PointFieldEditor({ type, meta, onChange }: { type: string; meta?: string | null; onChange: (meta: string) => void }) {
  if (type === "ESTIMATION") return <EstimationFieldEditor meta={meta} onChange={onChange} />
  if (type !== "POINTS_SELECT" && type !== "TIME_POINTS") return null
  const m = readPointMeta(meta)
  const save = (patch: Partial<PointFieldMeta>) => onChange(JSON.stringify({ ...m, ...patch }))
  const cls = "border rounded px-2 py-1 text-sm w-full min-w-0"
  return <div className="space-y-2 border rounded p-3 bg-blue-50/40">
    {type === "POINTS_SELECT" ? <>
      <p className="text-xs text-gray-600">Kohtunik valib vastuse; arvutuses kasutatakse vastuse punkte.</p>
      {(m.options ?? []).map((o, i) => <div className="flex gap-2" key={o.id}>
        <input aria-label="Valiku nimetus" placeholder="Valiku nimetus" value={o.label} onChange={e => save({ options: m.options!.map((v, j) => j === i ? { ...v, label: e.target.value } : v) })} className={cls} required />
        <input aria-label="Valiku punktid" type="number" step="any" value={o.points ?? ""} onChange={e => save({ options: m.options!.map((v, j) => j === i ? { ...v, points: e.target.value === "" ? NaN : Number(e.target.value) } : v) })} className={cls} required />
        <button type="button" aria-label="Eemalda valik" onClick={() => save({ options: m.options!.filter((_, j) => j !== i) })}>✕</button>
      </div>)}
      <button type="button" className="text-sm text-blue-600" onClick={() => save({ options: [...(m.options ?? []), { id: crypto.randomUUID(), label: "", points: 0 }] })}>+ Lisa valik</button>
    </> : <>
      <p className="text-xs text-gray-600">Vahemik algab eelmisest piirist järgmisel sekundil; esimene algab 0:00. Valemis kasutatakse ajapunkte.</p>
      {(m.timeBands ?? []).map((b, i) => <div className="flex items-center gap-2" key={i}>
        <span className="text-xs">Kuni</span><input aria-label="Ajavahemiku lõpp" placeholder="m:ss" defaultValue={Number.isFinite(b.through) ? durationLabel(b.through) : ""} key={`${i}-${b.through}`} onBlur={e => save({ timeBands: m.timeBands!.map((v, j) => j === i ? { ...v, through: durationSeconds(e.target.value) } : v) })} className={cls} required />
        <input aria-label="Ajapunktid" type="number" step="any" value={b.points ?? ""} onChange={e => save({ timeBands: m.timeBands!.map((v, j) => j === i ? { ...v, points: e.target.value === "" ? NaN : Number(e.target.value) } : v) })} className={cls} required />
        <button type="button" aria-label="Eemalda ajavahemik" onClick={() => save({ timeBands: m.timeBands!.filter((_, j) => j !== i) })}>✕</button>
      </div>)}
      <div className="flex gap-4"><button type="button" className="text-sm text-blue-600" onClick={() => save({ timeBands: [...(m.timeBands ?? []), { through: (m.timeBands?.at(-1)?.through ?? 0) + 60, points: 0 }], overflowPoints: m.overflowPoints ?? 0 })}>+ Lisa ajavahemik</button>
      {!m.timeBands?.length && <button type="button" className="text-sm text-blue-600" onClick={() => save(exampleTimeMeta)}>Kasuta 15 punkti näidistabelit</button>}</div>
      <label className="block text-xs">Punktid pärast viimast ajapiiri<input aria-label="Punktid pärast viimast ajapiiri" type="number" step="any" value={m.overflowPoints ?? 0} onChange={e => save({ overflowPoints: e.target.value === "" ? NaN : Number(e.target.value) })} className={cls} required /></label>
      <label className="flex gap-2 text-xs"><input type="checkbox" checked={m.timeTieBreak ?? false} onChange={e => save({ timeTieBreak: e.target.checked })} />Võrdsete ülesandepunktide korral on lühem aeg parem (ainult selle ülesande pingerida).</label>
    </>}
  </div>
}
