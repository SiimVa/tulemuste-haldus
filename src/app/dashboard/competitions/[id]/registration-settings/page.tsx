"use client"

import Link from "next/link"
import { use, useEffect, useState } from "react"
import { FormBuilder } from "@/components/registration/FormBuilder"
import type { FormFieldDefinition } from "@/lib/registrationForm"

type PhaseOverride = "AUTO" | "OPEN" | "CLOSED"
type PhaseStatus = "NOT_OPEN" | "OPEN" | "CLOSED" | "FINALIZED"
type CompetitionClass = { id?: string; name: string; order: number }

type Settings = {
  name: string
  isPublic: boolean
  registrationOpensAt: string
  registrationClosesAt: string
  registrationOverride: PhaseOverride
  registrationFinalizedAt: string | null
  registrationCapacity: number | ""
  registrationStatus: PhaseStatus
  mandateOpensAt: string
  mandateClosesAt: string
  mandateOverride: PhaseOverride
  mandateFinalizedAt: string | null
  mandateStatus: PhaseStatus
  registrationClasses: CompetitionClass[]
  registrationFormFields: FormFieldDefinition[]
}

const STATUS_LABEL: Record<PhaseStatus, string> = {
  NOT_OPEN: "Pole veel avatud",
  OPEN: "Avatud",
  CLOSED: "Suletud",
  FINALIZED: "Kinnitatud ja lukustatud",
}

const STATUS_COLOR: Record<PhaseStatus, string> = {
  NOT_OPEN: "bg-gray-100 text-gray-700",
  OPEN: "bg-green-100 text-green-700",
  CLOSED: "bg-amber-100 text-amber-800",
  FINALIZED: "bg-blue-100 text-blue-700",
}

function toLocalInput(value: string | null | undefined): string {
  if (!value) return ""
  const date = new Date(value)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function toIso(value: string): string | null {
  return value ? new Date(value).toISOString() : null
}

function phaseCard(
  title: string,
  prefix: "registration" | "mandate",
  form: Settings,
  setForm: React.Dispatch<React.SetStateAction<Settings | null>>
) {
  const status = form[`${prefix}Status`] as PhaseStatus
  const finalized = form[`${prefix}FinalizedAt`] as string | null
  const override = form[`${prefix}Override`] as PhaseOverride
  const opensAt = form[`${prefix}OpensAt`] as string
  const closesAt = form[`${prefix}ClosesAt`] as string

  function update(key: string, value: string) {
    setForm((current) => current ? { ...current, [key]: value } : current)
  }

  return (
    <section className="bg-white border rounded-xl p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <p className="text-xs text-gray-500 mt-1">
            Käsitsi valik on automaatsest ajakavast tähtsam.
          </p>
        </div>
        <span className={`text-xs px-3 py-1 rounded-full ${STATUS_COLOR[status]}`}>
          {STATUS_LABEL[status]}
        </span>
      </div>

      <div>
        <label className="text-xs text-gray-500 mb-1 block">Juhtimine</label>
        <select
          value={override}
          disabled={Boolean(finalized)}
          onChange={(event) =>
            update(`${prefix}Override`, event.target.value)
          }
          className="w-full px-3 py-2 border rounded-lg text-sm disabled:bg-gray-100"
        >
          <option value="AUTO">Automaatne ajakava</option>
          <option value="OPEN">Käsitsi avatud</option>
          <option value="CLOSED">Käsitsi suletud</option>
        </select>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">
            Automaatne avamine
          </label>
          <input
            type="datetime-local"
            value={opensAt}
            disabled={Boolean(finalized)}
            onChange={(event) =>
              update(`${prefix}OpensAt`, event.target.value)
            }
            className="w-full px-3 py-2 border rounded-lg text-sm disabled:bg-gray-100"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">
            Automaatne sulgemine
          </label>
          <input
            type="datetime-local"
            value={closesAt}
            disabled={Boolean(finalized)}
            onChange={(event) =>
              update(`${prefix}ClosesAt`, event.target.value)
            }
            className="w-full px-3 py-2 border rounded-lg text-sm disabled:bg-gray-100"
          />
        </div>
      </div>

      {prefix === "mandate" && !form.registrationFinalizedAt && (
        <p className="text-xs rounded-lg bg-amber-50 text-amber-800 px-3 py-2">
          Mandaat avaneb alles pärast registreeritud osalejate nimekirja
          kinnitamist. Kui avamisaeg saabub varem, jääb mandaat ootele.
        </p>
      )}
    </section>
  )
}

export default function RegistrationSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: competitionId } = use(params)
  const [form, setForm] = useState<Settings | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    fetch(`/api/competitions/${competitionId}/registration-settings`)
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error ?? "Laadimine ebaõnnestus")
        setForm({
          ...data,
          registrationOpensAt: toLocalInput(data.registrationOpensAt),
          registrationClosesAt: toLocalInput(data.registrationClosesAt),
          mandateOpensAt: toLocalInput(data.mandateOpensAt),
          mandateClosesAt: toLocalInput(data.mandateClosesAt),
          registrationCapacity: data.registrationCapacity ?? "",
        })
      })
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : "Laadimine ebaõnnestus")
      )
  }, [competitionId])

  function updateClass(index: number, name: string) {
    setForm((current) => {
      if (!current) return current
      const classes = [...current.registrationClasses]
      classes[index] = { ...classes[index], name }
      return { ...current, registrationClasses: classes }
    })
  }

  function addClass() {
    setForm((current) =>
      current
        ? {
            ...current,
            registrationClasses: [
              ...current.registrationClasses,
              {
                name: "",
                order: current.registrationClasses.length,
              },
            ],
          }
        : current
    )
  }

  function removeClass(index: number) {
    setForm((current) =>
      current
        ? {
            ...current,
            registrationClasses: current.registrationClasses.filter(
              (_, classIndex) => classIndex !== index
            ),
          }
        : current
    )
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!form) return
    setSaving(true)
    setSaved(false)
    setError("")

    const response = await fetch(
      `/api/competitions/${competitionId}/registration-settings`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isPublic: form.isPublic,
          registrationOpensAt: toIso(form.registrationOpensAt),
          registrationClosesAt: toIso(form.registrationClosesAt),
          registrationOverride: form.registrationOverride,
          registrationCapacity:
            form.registrationCapacity === ""
              ? null
              : Number(form.registrationCapacity),
          mandateOpensAt: toIso(form.mandateOpensAt),
          mandateClosesAt: toIso(form.mandateClosesAt),
          mandateOverride: form.mandateOverride,
          classes: form.registrationClasses,
          formFields: form.registrationFormFields,
        }),
      }
    )
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      setError(data.error ?? "Salvestamine ebaõnnestus")
    } else {
      setForm({
        ...data,
        registrationOpensAt: toLocalInput(data.registrationOpensAt),
        registrationClosesAt: toLocalInput(data.registrationClosesAt),
        mandateOpensAt: toLocalInput(data.mandateOpensAt),
        mandateClosesAt: toLocalInput(data.mandateClosesAt),
        registrationCapacity: data.registrationCapacity ?? "",
      })
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2500)
    }
    setSaving(false)
  }

  if (!form && !error) {
    return <p className="text-sm text-gray-400 py-10">Laadin...</p>
  }

  return (
    <div className="max-w-3xl">
      <Link
        href={`/dashboard/competitions/${competitionId}`}
        className="text-sm text-gray-400 hover:text-gray-600"
      >
        ← Tagasi
      </Link>
      <div className="mt-4 mb-6">
        <h1 className="text-xl font-bold text-gray-900">
          Registreerimise ja mandaadi seaded
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Määra avalikkus, klassid, kohtade arv ja etappide ajakava.
        </p>
      </div>

      {error && (
        <p className="mb-4 px-4 py-3 rounded-lg bg-red-50 text-red-700 text-sm">
          {error}
        </p>
      )}

      {form && (
        <form onSubmit={save} className="space-y-6">
          <section className="bg-white border rounded-xl p-5 space-y-4">
            <div>
              <h2 className="font-semibold text-gray-900">Avalik võistlus</h2>
              <p className="text-xs text-gray-500 mt-1">
                Avalikku võistlust näevad kõik. Registreerimiseks peab kasutaja
                sisse logima.
              </p>
            </div>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isPublic}
                onChange={(event) =>
                  setForm({ ...form, isPublic: event.target.checked })
                }
                className="mt-1 accent-blue-600"
              />
              <span className="text-sm text-gray-700">
                Kuva võistlus avalikus võistluste nimekirjas
              </span>
            </label>
          </section>

          <section className="bg-white border rounded-xl p-5 space-y-4">
            <div>
              <h2 className="font-semibold text-gray-900">Klassid</h2>
              <p className="text-xs text-gray-500 mt-1">
                Klassid on valikulised. Üks klass määratakse automaatselt;
                mitme klassi korral valib registreerija klassi rippmenüüst.
                Tühja nimekirja korral klassi ei küsita.
              </p>
            </div>
            <div className="space-y-2">
              {form.registrationClasses.map((item, index) => (
                <div key={item.id ?? `new-${index}`} className="flex gap-2">
                  <input
                    type="text"
                    value={item.name}
                    onChange={(event) => updateClass(index, event.target.value)}
                    placeholder="nt Põhiklass"
                    className="flex-1 px-3 py-2 border rounded-lg text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => removeClass(index)}
                    className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg"
                  >
                    Eemalda
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addClass}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              + Lisa klass
            </button>

            <div className="pt-2">
              <label className="text-xs text-gray-500 mb-1 block">
                Võistkondade üldarvu piirang
              </label>
              <input
                type="number"
                min={1}
                step={1}
                value={form.registrationCapacity}
                onChange={(event) =>
                  setForm({
                    ...form,
                    registrationCapacity:
                      event.target.value === ""
                        ? ""
                        : Number(event.target.value),
                  })
                }
                placeholder="Piirang puudub"
                className="w-full sm:w-56 px-3 py-2 border rounded-lg text-sm"
              />
              <p className="text-xs text-gray-400 mt-1">
                Kui piirang täitub, lähevad järgmised avaldused ootenimekirja.
              </p>
            </div>
          </section>

          <FormBuilder
            fields={form.registrationFormFields}
            onChange={(registrationFormFields) =>
              setForm({ ...form, registrationFormFields })
            }
          />

          {phaseCard("Registreerimine", "registration", form, setForm)}
          {phaseCard("Mandaat", "mandate", form, setForm)}

          <div className="flex items-center gap-3 pb-8">
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Salvestan..." : "Salvesta seaded"}
            </button>
            {saved && <span className="text-sm text-green-600">Salvestatud</span>}
          </div>
        </form>
      )}
    </div>
  )
}
