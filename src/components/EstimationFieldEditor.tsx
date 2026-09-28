"use client"
import { defaultEstimation, readEstimation, targetUnit, type EstimationConfig } from "@/lib/estimation"
export function EstimationFieldEditor({ meta, onChange }: { meta?: string | null; onChange: (meta: string) => void }) {
  const config = readEstimation(meta)
  const save = (patch: Partial<EstimationConfig>) => {
    let existing = {}
    try { existing = JSON.parse(meta || "{}") } catch {}
    onChange(JSON.stringify({ ...existing, estimation: { ...config, ...patch, targets: patch.targets ?? config.targets.map(t => ({ ...t, unit: targetUnit(config, t) })) } }))
  }
  const input = "w-full min-w-0 rounded border px-2 py-1 text-sm"
  return <div className="space-y-3 rounded border bg-blue-50/40 p-3">
    <p className="text-xs text-gray-600">Määra õiged väärtused ja lubatud veaprotsendid. Õiged väärtused võib jätta tühjaks ja lasta kohtunikul enne hindamist sisestada. Ala- ja ülehindamise vead liidetakse absoluutväärtustena.</p>
    <label className="block text-sm">Vaikimisi mõõtühik ja veasumma ühik<input aria-label="Veasumma mõõtühik" value={config.unit} maxLength={20} onChange={e => save({ unit: e.target.value })} className={input} /></label>
    <p className="text-xs text-gray-600">Igal real võib olla oma mõõtühik. Absoluutvead teisendatakse enne liitmist veasumma ühikusse, näiteks 10 cm + 1 m = 1,1 m.</p>
    <div className="space-y-2">
      <p className="text-sm font-medium">Õiged väärtused</p>
      {config.targets.map((target, index) => <div className="grid grid-cols-[1fr_1fr_auto] gap-2" key={target.id}>
        <input aria-label={`Väärtuse ${index + 1} nimetus`} value={target.label} onChange={e => save({ targets: config.targets.map(t => t.id === target.id ? { ...t, label: e.target.value } : t) })} required className={input} />
        <input aria-label={`Õige väärtus ${index + 1}`} type="number" step="any" min="0.000000001" value={target.correct ?? ""} onChange={e => save({ targets: config.targets.map(t => t.id === target.id ? { ...t, correct: e.target.value === "" ? null : Number(e.target.value) } : t) })} className={input} />
        <label className="col-span-2 text-xs">Mõõtühik<input aria-label={`Rea ${index + 1} mõõtühik`} value={targetUnit(config, target)} maxLength={20} onChange={e => save({ targets: config.targets.map(t => t.id === target.id ? { ...t, unit: e.target.value } : t) })} className={input} /></label>
        <button type="button" aria-label={`Eemalda väärtus ${index + 1}`} onClick={() => save({ targets: config.targets.filter(t => t.id !== target.id) })}>✕</button>
      </div>)}
      <button type="button" disabled={config.targets.length >= 100} className="text-sm text-blue-600" onClick={() => save({ targets: [...config.targets, { id: crypto.randomUUID(), label: `Väärtus ${config.targets.length + 1}`, correct: null, unit: config.unit }] })}>+ Lisa väärtus</button>
      <button type="button" disabled={config.targets.length > 90} className="ml-3 text-sm text-blue-600" onClick={() => save({ targets: [...config.targets, ...Array.from({ length: 10 }, (_, i) => ({ id: crypto.randomUUID(), label: `Väärtus ${config.targets.length + i + 1}`, correct: null, unit: config.unit }))] })}>+ Lisa 10 väärtust</button>
    </div>
    <div className="space-y-2">
      <p className="text-sm font-medium">Punktid veaprotsendi järgi</p>
      {config.bands.map((band, index) => <div key={index} className="flex items-center gap-2">
        <span className="text-xs">Kuni ±</span>
        <input aria-label={`Veaprotsendi piir ${index + 1}`} type="number" step="any" min="0" value={band.through ?? ""} onChange={e => save({ bands: config.bands.map((b, i) => i === index ? { ...b, through: e.target.value === "" ? NaN : Number(e.target.value) } : b) })} required className={input} />
        <span className="text-xs">%</span>
        <input aria-label={`Veavahemiku punktid ${index + 1}`} type="number" step="any" value={band.points ?? ""} onChange={e => save({ bands: config.bands.map((b, i) => i === index ? { ...b, points: e.target.value === "" ? NaN : Number(e.target.value) } : b) })} required className={input} />
        <span className="text-xs">p</span><button type="button" aria-label={`Eemalda veavahemik ${index + 1}`} onClick={() => save({ bands: config.bands.filter((_, i) => i !== index) })}>✕</button>
      </div>)}
      <button type="button" className="text-sm text-blue-600" onClick={() => save({ bands: [...config.bands, { through: (config.bands.at(-1)?.through ?? 0) + 10, points: 0 }] })}>+ Lisa veavahemik</button>
      <button type="button" className="ml-3 text-sm text-blue-600" onClick={() => save({ bands: defaultEstimation.bands, overflowPoints: 0 })}>Taasta 5 / 15 / 30% tabel</button>
      <label className="block text-sm">Punktid suurema eksimuse korral<input aria-label="Punktid suurema eksimuse korral" type="number" step="any" value={config.overflowPoints ?? ""} onChange={e => save({ overflowPoints: e.target.value === "" ? NaN : Number(e.target.value) })} required className={input} /></label>
    </div>
    <label className="block text-sm">Arvutuses kasutatav tulemus<select aria-label="Hindamise tulemus" value={config.result} onChange={e => save({ result: e.target.value as EstimationConfig["result"] })} className={input}>
      <option value="POINTS">Punktide summa (suurem on parem)</option>
      <option value="ERROR_PERCENT">Protsendivigade summa (väiksem on parem)</option>
      <option value="ERROR_ABSOLUTE">Absoluutvigade summa (väiksem on parem)</option>
    </select></label>
    <p className="text-xs text-gray-600">Pingerea meetodi kasutamisel määra tulemusvälja suund valitud tulemuse järgi.</p>
  </div>
}
