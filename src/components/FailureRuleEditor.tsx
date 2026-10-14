"use client"

import { FAILURE_FIELD_TYPES, FAILURE_OPERATORS, readFailureRule, validateFailureRule, type FailureField, type FailureOperator, type FailureRule } from "@/lib/failureRules"

export function FailureRuleEditor({ config, fields, onChange }: {
  config: Record<string, unknown>; fields: FailureField[]; onChange: (config: Record<string, unknown>) => void
}) {
  const rule = readFailureRule(config)
  const available = fields.filter(f => f.name && FAILURE_FIELD_TYPES.includes(f.type))
  const save = (failureRule: FailureRule | null) => onChange({ ...config, failureRule })
  const patch = (index: number, change: Partial<FailureRule["conditions"][number]>) => rule && save({ ...rule, conditions: rule.conditions.map((c, i) => i === index ? { ...c, ...change } : c) })
  const error = validateFailureRule(config, fields)
  return <section className="rounded-xl border bg-white p-5 space-y-3">
    <h2 className="font-semibold text-gray-900">Automaatne ebaõnnestumine</h2>
    <p className="text-xs text-gray-600">Vali soorituse väljad ja ebaõnnestumise piirid. Kohtunik saab automaatset otsust muuta. Valikväljal kasutatakse vastuse punkte, ajaväljal sekundeid ja ajapunktide väljal punkte.</p>
    <label className="flex gap-2 text-sm"><input type="checkbox" checked={Boolean(rule)} disabled={!rule && available.length === 0} onChange={e => save(e.target.checked ? { match: "ALL", conditions: [{ field: available[0].name, operator: "=", value: 0 }] } : null)} />Kasuta automaatset tingimust</label>
    {!available.length && <p className="text-xs text-gray-500">Lisa esmalt sisendväli või arvutatud väli.</p>}
    {rule && <>
      <label className="block text-sm">Ebaõnnestumiseks peab kehtima
        <select aria-label="Tingimuste ühendamine" value={rule.match} onChange={e => save({ ...rule, match: e.target.value as FailureRule["match"] })} className="ml-2 rounded border p-1">
          <option value="ALL">Kõik tingimused</option><option value="ANY">Vähemalt üks tingimus</option>
        </select>
      </label>
      {rule.conditions.map((condition, i) => <div className="flex flex-wrap gap-2" key={i}>
        <select aria-label={`Tingimuse ${i + 1} väli`} value={condition.field} onChange={e => patch(i, { field: e.target.value })} className="rounded border p-2 text-sm">
          {!available.some(f => f.name === condition.field) && <option value={condition.field}>{condition.field} (puudub)</option>}
          {available.map(f => <option key={f.name} value={f.name}>{f.label || f.name}</option>)}
        </select>
        <select aria-label={`Tingimuse ${i + 1} võrdlus`} value={condition.operator} onChange={e => patch(i, { operator: e.target.value as FailureOperator })} className="rounded border p-2">
          {FAILURE_OPERATORS.map(operator => <option key={operator}>{operator}</option>)}
        </select>
        <input aria-label={`Tingimuse ${i + 1} piirväärtus`} type="number" step="any" required value={Number.isFinite(condition.value) ? condition.value : ""} onChange={e => patch(i, { value: e.target.value === "" ? NaN : Number(e.target.value) })} className="w-28 rounded border p-2" />
        <button type="button" aria-label={`Eemalda tingimus ${i + 1}`} onClick={() => save(rule.conditions.length === 1 ? null : { ...rule, conditions: rule.conditions.filter((_, index) => index !== i) })} className="text-sm text-red-600">Eemalda</button>
      </div>)}
      <button type="button" disabled={!available.length || rule.conditions.length >= 50} onClick={() => save({ ...rule, conditions: [...rule.conditions, { field: available[0].name, operator: "=", value: 0 }] })} className="text-sm text-blue-600">+ Lisa tingimus</button>
      <p className="text-xs text-gray-600">Erandite hulgas peab olema erand liigiga „Ebaõnnestus”. Kui tingimus vajab eraldi asjaolu, lisa jah/ei valikväli punktidega 1 ja 0.</p>
    </>}
    {error && <p className="text-sm text-red-600">{error}</p>}
  </section>
}
