"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input, Select } from "@/components/ui/input"
import { DynamicFormFields } from "./DynamicFormFields"
import { organizerRegistrationFields } from "@/lib/organizerRegistration"
import { validateFormAnswers, type FormAnswers, type FormFieldDefinition } from "@/lib/registrationForm"
import type { TeamCompositionSettings } from "@/lib/teamComposition"

export type OrganizerRegistrationTarget = {
  applicationId?: string
  teamId?: string
  teamName: string
  classId?: string | null
  className?: string | null
  answers: FormAnswers
}

export function OrganizerRegistrationEditor({ competitionId, target, fields, classes, includeMandate, teamComposition, onSaved, onCancel }: {
  competitionId: string
  target: OrganizerRegistrationTarget
  fields: FormFieldDefinition[]
  classes: { id: string; name: string }[]
  includeMandate: boolean
  teamComposition?: TeamCompositionSettings
  onSaved: () => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState(target.teamName)
  const [classId, setClassId] = useState(target.classId ?? classes.find((item) => item.name === target.className)?.id ?? (classes.length === 1 ? classes[0].id : ""))
  const [className, setClassName] = useState(target.className ?? "")
  const [answers, setAnswers] = useState(target.answers)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const editableFields = organizerRegistrationFields(fields, includeMandate)

  async function save(event: React.FormEvent) {
    event.preventDefault()
    const validated = validateFormAnswers(editableFields, answers, "REGISTRATION")
    setErrors(validated.errors)
    if (Object.keys(validated.errors).length) { setError("Kontrolli vormi välju"); return }
    setSaving(true)
    setError("")
    try {
      const response = await fetch(`/api/competitions/${competitionId}/registrations`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId: target.applicationId, teamId: target.teamId, teamName: name, classId: classId || null, className, answers: validated.answers }),
      })
      const data = await response.json()
      if (!response.ok) { setError(data.error ?? "Salvestamine ebaõnnestus"); return }
      await onSaved()
    } catch { setError("Salvestamine ebaõnnestus. Proovi uuesti.") }
    finally { setSaving(false) }
  }

  return <form onSubmit={save} className="mt-4 space-y-4 rounded-lg border p-4" aria-label="Võistkonna andmete muutmine">
    <h3 className="font-semibold">{target.applicationId || target.teamId ? "Muuda võistkonda" : "Lisa võistkond"}</h3>
    <label className="block text-sm">Võistkonna nimi *
      <Input required maxLength={200} value={name} disabled={saving} onChange={(event) => setName(event.target.value)} />
    </label>
    {(classes.length > 0 || includeMandate) && <label className="block text-sm">Klass
      {classes.length ? <Select aria-label="Klass" value={classId} required disabled={saving} onChange={(event) => setClassId(event.target.value)}>
        <option value="">Vali klass</option>
        {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </Select> : <Input aria-label="Klass" value={className} disabled={saving} onChange={(event) => setClassName(event.target.value)} />}
    </label>}
    <DynamicFormFields organizer fields={editableFields} phase="REGISTRATION" values={answers} errors={errors} disabled={saving} teamComposition={includeMandate ? teamComposition : undefined} onChange={(key, value) => setAnswers((current) => ({ ...current, [key]: value }))} />
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="flex gap-2">
      <Button type="submit" disabled={saving}>{saving ? "Salvestan..." : "Salvesta võistkond"}</Button>
      <Button type="button" variant="secondary" disabled={saving} onClick={onCancel}>Tühista</Button>
    </div>
  </form>
}
