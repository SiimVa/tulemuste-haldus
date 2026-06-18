"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { FieldValidationEditor } from "@/components/FieldValidationEditor"
import { FieldValidation, parseValidation } from "@/lib/fieldValidation"

type Field = { id: string; name: string; label: string; type: string; isResultField: boolean; rankingPriority: number | null; formula?: string | null; validation?: string | null }
type SectionCalcMethod = { id: string; type: string; params: string; customFormula?: string | null }
type Section = { id: string; name: string; order: number; maxValue: number | null; fields: Field[]; calcMethod: SectionCalcMethod | null }

type FieldRow = { name: string; label: string; type: string; rankingPriority: number | null; validation: FieldValidation }

const FIELD_TYPES = [
  { value: "TIME", label: "Aeg (h:mm:ss)" },
  { value: "NUMBER", label: "Arv" },
  { value: "TEXT", label: "Tekst" },
]

const CALC_TYPES = [
  { value: "RELATIVE_RANKING", label: "Relatiivne pingerida" },
  { value: "FIXED_RANKING", label: "Fikseeritud pingerida" },
  { value: "VALUE_BASED", label: "Tulemuspõhine" },
  { value: "ABSOLUTE_TIME", label: "Absoluutne aeg" },
  { value: "ABSOLUTE_POINTS", label: "Absoluutsed punktid (suurem = parem)" },
  { value: "ABSOLUTE_PENALTY", label: "Absoluutsed karistuspunktid" },
  { value: "PERFORMANCE_BASED", label: "Soorituspõhine" },
  { value: "CUSTOM", label: "Korraldaja valem" },
]

const CALC_LABELS: Record<string, string> = Object.fromEntries(CALC_TYPES.map(c => [c.value, c.label]))

interface Props {
  elementId: string
  competitionId: string
  initialSections: Section[]
}

type SectionForm = {
  name: string
  maxValue: string
  calcType: string
  higherIsBetter: boolean | null
  minPoints: number
  totalElements: number
  customFormula: string
  fields: FieldRow[]
}

function emptyForm(): SectionForm {
  return {
    name: "",
    maxValue: "",
    calcType: "RELATIVE_RANKING",
    higherIsBetter: null,
    minPoints: 0,
    totalElements: 10,
    customFormula: "",
    fields: [{ name: "", label: "", type: "NUMBER", rankingPriority: 1, validation: {} }],
  }
}

function sectionToForm(s: Section): SectionForm {
  let params: Record<string, unknown> = {}
  try { params = JSON.parse(s.calcMethod?.params ?? "{}") } catch {}
  return {
    name: s.name,
    maxValue: s.maxValue != null ? String(s.maxValue) : "",
    calcType: s.calcMethod?.type ?? "RELATIVE_RANKING",
    higherIsBetter: (params.higherIsBetter as boolean) ?? false,
    minPoints: (params.minPoints as number) ?? 0,
    totalElements: (params.totalElements as number) ?? 10,
    customFormula: s.calcMethod?.customFormula ?? "",
    fields: s.fields.map(f => ({
      name: f.name,
      label: f.label,
      type: f.type,
      rankingPriority: f.rankingPriority ?? (f.isResultField ? 1 : null),
      validation: parseValidation(f.validation),
    })),
  }
}

function buildCalcMethodBody(form: SectionForm) {
  return {
    type: form.calcType,
    params:
      form.calcType === "RELATIVE_RANKING" || form.calcType === "VALUE_BASED"
        ? { higherIsBetter: form.higherIsBetter ?? false, minPoints: form.minPoints }
        : form.calcType === "FIXED_RANKING"
        ? { higherIsBetter: form.higherIsBetter ?? false }
        : form.calcType === "ABSOLUTE_POINTS"
        ? { higherIsBetter: true }
        : form.calcType === "PERFORMANCE_BASED"
        ? { totalElements: form.totalElements }
        : {},
    customFormula: (form.calcType === "CUSTOM" || form.calcType === "ABSOLUTE_PENALTY")
      ? form.customFormula : null,
  }
}

function SectionFormUI({
  form,
  setForm,
  onSubmit,
  onCancel,
  saving,
  submitLabel,
}: {
  form: SectionForm
  setForm: (f: SectionForm) => void
  onSubmit: (e: React.FormEvent) => void
  onCancel: () => void
  saving: boolean
  submitLabel: string
}) {
  function updateField(i: number, key: keyof FieldRow, val: string | number | null | FieldValidation) {
    const upd = [...form.fields]
    upd[i] = { ...upd[i], [key]: val }
    if (key === "rankingPriority" && val === 1) {
      upd.forEach((f, idx) => { if (idx !== i && f.rankingPriority === 1) f.rankingPriority = null })
    }
    setForm({ ...form, fields: upd })
  }

  return (
    <form onSubmit={onSubmit} className="border-2 border-blue-200 rounded-xl p-4 space-y-4 bg-blue-50/30">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-800">{submitLabel === "Lisa hindamisosa" ? "Uus hindamisosa" : "Muuda hindamisosa"}</p>
        <button type="button" onClick={onCancel} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Nimi *</label>
          <input type="text" required value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            placeholder="nt Orienteerumine"
            className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Max punktid</label>
          <input type="number" min={0} step={0.5} value={form.maxValue}
            onChange={e => setForm({ ...form, maxValue: e.target.value })}
            onFocus={e => e.target.select()}
            placeholder="nt 20"
            className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-gray-700">Sisendväljad</label>
          <button type="button"
            onClick={() => setForm({ ...form, fields: [...form.fields, { name: "", label: "", type: "NUMBER", rankingPriority: null, validation: {} }] })}
            className="text-xs text-blue-600 hover:text-blue-700">+ Lisa väli</button>
        </div>
        {form.fields.map((f, i) => (
          <div key={i} className="border rounded-lg p-2 space-y-2 bg-white">
            <div className="grid grid-cols-4 gap-2 items-center">
              <input type="text" placeholder="nimi" value={f.name}
                onChange={e => updateField(i, "name", e.target.value)}
                className="px-2 py-1.5 border rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
              <input type="text" placeholder="kuvamisnimi" value={f.label}
                onChange={e => updateField(i, "label", e.target.value)}
                className="px-2 py-1.5 border rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
              <select value={f.type} onChange={e => updateField(i, "type", e.target.value)}
                className="px-2 py-1.5 border rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500">
                {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <div className="flex items-center gap-1">
                <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
                  <input type="checkbox" checked={f.rankingPriority === 1}
                    onChange={e => updateField(i, "rankingPriority", e.target.checked ? 1 : null)}
                    className="accent-blue-600" />
                  Tulemus
                </label>
                {form.fields.length > 1 && (
                  <button type="button"
                    onClick={() => setForm({ ...form, fields: form.fields.filter((_, idx) => idx !== i) })}
                    className="ml-auto text-red-400 hover:text-red-600 text-xs">✕</button>
                )}
              </div>
            </div>
            <div className="px-1">
              <FieldValidationEditor
                fieldType={f.type}
                validation={f.validation}
                onChange={v => updateField(i, "validation", v)}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2 border-t pt-3">
        <label className="text-xs font-medium text-gray-700">Arvutusmeetod</label>
        <select value={form.calcType} onChange={e => setForm({ ...form, calcType: e.target.value })}
          className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
          {CALC_TYPES.map(ct => <option key={ct.value} value={ct.value}>{ct.label}</option>)}
        </select>
        {(form.calcType === "RELATIVE_RANKING" || form.calcType === "VALUE_BASED" || form.calcType === "FIXED_RANKING") && (
          <div className="space-y-2">
            <div>
              <p className="text-xs text-gray-500 mb-1">Suund <span className="text-red-500">*</span></p>
              <div className="flex rounded-lg border overflow-hidden text-xs">
                <button type="button" onClick={() => setForm({ ...form, higherIsBetter: false })}
                  className={`flex-1 py-1.5 px-3 transition-colors ${form.higherIsBetter === false ? "bg-blue-600 text-white font-medium" : "text-gray-600 hover:bg-gray-50 bg-white"}`}>
                  Väiksem = parem
                </button>
                <button type="button" onClick={() => setForm({ ...form, higherIsBetter: true })}
                  className={`flex-1 py-1.5 px-3 border-l transition-colors ${form.higherIsBetter === true ? "bg-blue-600 text-white font-medium" : "text-gray-600 hover:bg-gray-50 bg-white"}`}>
                  Suurem = parem
                </button>
              </div>
              {form.higherIsBetter === null && <p className="text-xs text-red-500 mt-1">Vali kumba suunda mõõdetakse</p>}
            </div>
            {form.calcType !== "FIXED_RANKING" && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Halvima punktid:</span>
                <input type="number" min={0} step={0.5} value={form.minPoints}
                  onChange={e => setForm({ ...form, minPoints: Number(e.target.value) })}
                  onFocus={e => e.target.select()}
                  className="w-16 px-2 py-1 border rounded text-xs bg-white" />
              </div>
            )}
          </div>
        )}
        {form.calcType === "PERFORMANCE_BASED" && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Elementide koguarv:</span>
            <input type="number" min={1} step={1} value={form.totalElements}
              onChange={e => setForm({ ...form, totalElements: Number(e.target.value) })}
              onFocus={e => e.target.select()}
              className="w-20 px-2 py-1 border rounded text-xs bg-white" />
            <span className="text-xs text-gray-400">(tulemusväljale sisestatakse õigete arv)</span>
          </div>
        )}
        {(form.calcType === "CUSTOM" || form.calcType === "ABSOLUTE_PENALTY") && (
          <input type="text" value={form.customFormula}
            onChange={e => setForm({ ...form, customFormula: e.target.value })}
            placeholder="Valem (nt result * 2)"
            className="w-full px-3 py-2 border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
        )}
      </div>

      <button type="submit" disabled={saving || !form.name || (["RELATIVE_RANKING", "FIXED_RANKING", "VALUE_BASED"].includes(form.calcType) && form.higherIsBetter === null)}
        className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
        {saving ? "Salvestan..." : submitLabel}
      </button>
    </form>
  )
}

export function ElementSectionsManager({ elementId, competitionId, initialSections }: Props) {
  const [sections, setSections] = useState<Section[]>(initialSections)
  const [showAdd, setShowAdd] = useState(false)
  const [newForm, setNewForm] = useState<SectionForm>(emptyForm())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<SectionForm>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const router = useRouter()

  async function addSection(e: React.FormEvent) {
    e.preventDefault()
    if (!newForm.name) return
    setSaving(true)
    try {
      const res = await fetch(`/api/elements/${elementId}/sections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newForm.name,
          maxValue: newForm.maxValue !== "" ? Number(newForm.maxValue) : null,
          fields: newForm.fields.filter(f => f.name && f.label).map(f => ({ ...f, validation: Object.keys(f.validation).length ? f.validation : undefined })),
          calcMethod: buildCalcMethodBody(newForm),
        }),
      })
      if (res.ok) {
        const created = await res.json()
        setSections([...sections, created])
        setNewForm(emptyForm())
        setShowAdd(false)
        await fetch(`/api/competitions/${competitionId}/recalculate`, { method: "POST" }).catch(() => {})
        router.refresh()
      }
    } finally {
      setSaving(false)
    }
  }

  function startEdit(s: Section) {
    setEditingId(s.id)
    setEditForm(sectionToForm(s))
    setShowAdd(false)
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editingId || !editForm.name) return
    setSaving(true)
    try {
      const res = await fetch(`/api/elements/${elementId}/sections/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name,
          maxValue: editForm.maxValue !== "" ? Number(editForm.maxValue) : null,
          fields: editForm.fields.filter(f => f.name && f.label).map(f => ({ ...f, validation: Object.keys(f.validation).length ? f.validation : undefined })),
          calcMethod: buildCalcMethodBody(editForm),
        }),
      })
      if (res.ok) {
        const updated = await res.json()
        setSections(sections.map(s => s.id === editingId ? updated : s))
        setEditingId(null)
        await fetch(`/api/competitions/${competitionId}/recalculate`, { method: "POST" }).catch(() => {})
        router.refresh()
      }
    } finally {
      setSaving(false)
    }
  }

  async function deleteSection(id: string) {
    setDeleting(id)
    try {
      const res = await fetch(`/api/elements/${elementId}/sections/${id}`, { method: "DELETE" })
      if (res.ok) {
        setSections(sections.filter(s => s.id !== id))
        if (editingId === id) setEditingId(null)
        await fetch(`/api/competitions/${competitionId}/recalculate`, { method: "POST" }).catch(() => {})
        router.refresh()
      }
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="space-y-3">
      {sections.length === 0 && !showAdd && (
        <p className="text-sm text-gray-400 text-center py-4">Ühtegi hindamisosa pole lisatud</p>
      )}

      {sections.map((s, idx) => {
        let params: Record<string, unknown> = {}
        try { params = JSON.parse(s.calcMethod?.params ?? "{}") } catch {}

        if (editingId === s.id) {
          return (
            <SectionFormUI
              key={s.id}
              form={editForm}
              setForm={setEditForm}
              onSubmit={saveEdit}
              onCancel={() => setEditingId(null)}
              saving={saving}
              submitLabel="Salvesta muudatused"
            />
          )
        }

        return (
          <div key={s.id} className="border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-400 bg-white border rounded px-1.5 py-0.5">{idx + 1}</span>
                <span className="font-medium text-sm text-gray-900">{s.name}</span>
                {s.maxValue != null && (
                  <span className="text-xs text-gray-400">max {s.maxValue}p</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {s.calcMethod && (
                  <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                    {CALC_LABELS[s.calcMethod.type] ?? s.calcMethod.type}
                    {(params.higherIsBetter as boolean) ? " ↑" : ""}
                    {(params.totalElements as number) ? ` / ${params.totalElements as number}` : ""}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => startEdit(s)}
                  disabled={!!editingId || deleting === s.id}
                  className="text-xs text-blue-500 hover:text-blue-700 disabled:opacity-40"
                >
                  Muuda
                </button>
                <button
                  type="button"
                  onClick={() => deleteSection(s.id)}
                  disabled={deleting === s.id || !!editingId}
                  className="text-xs text-red-400 hover:text-red-600 disabled:opacity-50"
                >
                  {deleting === s.id ? "..." : "Kustuta"}
                </button>
              </div>
            </div>
            {s.fields.length > 0 && (
              <div className="px-4 py-2 divide-y">
                {s.fields.map(f => (
                  <div key={f.id} className="flex items-center gap-2 py-1.5 text-xs">
                    <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{f.name}</span>
                    <span className="text-gray-700">{f.label}</span>
                    <span className="text-gray-400">({f.type})</span>
                    {f.rankingPriority === 1 && (
                      <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">tulemusväli</span>
                    )}
                    {f.formula && <code className="text-blue-600">{f.formula}</code>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}

      {showAdd ? (
        <SectionFormUI
          form={newForm}
          setForm={setNewForm}
          onSubmit={addSection}
          onCancel={() => { setShowAdd(false); setNewForm(emptyForm()) }}
          saving={saving}
          submitLabel="Lisa hindamisosa"
        />
      ) : (
        !editingId && (
          <button type="button" onClick={() => setShowAdd(true)}
            className="w-full py-2 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-400 hover:text-gray-600 hover:border-gray-400 transition-colors">
            + Lisa hindamisosa
          </button>
        )
      )}
    </div>
  )
}
