"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { DynamicFormFields } from "@/components/registration/DynamicFormFields"
import {
  type FormAnswer,
  type FormAnswers,
  type FormFieldDefinition,
  validateFormAnswers,
} from "@/lib/registrationForm"

type CompetitionClass = { id: string; name: string }
type Application = {
  id: string
  teamName: string
  status: string
  allocationReason: string | null
  waitlistPosition: number | null
  submittedAt: string | Date | null
  class: { id: string; name: string } | null
  formValues: FormAnswers
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Mustand",
  PENDING_REVIEW: "Ootab ülevaatamist",
  CONFIRMED: "Registreeritud",
  WAITLISTED: "Ootenimekirjas",
  REJECTED: "Tagasi lükatud",
  WITHDRAWN: "Loobunud",
}

const STATUS_COLOR: Record<string, string> = {
  CONFIRMED: "bg-green-100 text-green-700",
  WAITLISTED: "bg-amber-100 text-amber-800",
  PENDING_REVIEW: "bg-blue-100 text-blue-700",
  REJECTED: "bg-red-100 text-red-700",
  WITHDRAWN: "bg-gray-100 text-gray-600",
  DRAFT: "bg-gray-100 text-gray-700",
}

export function RegistrationPanel({
  competitionId,
  registrationOpen,
  loggedIn,
  classes,
  formFields,
  applications,
}: {
  competitionId: string
  registrationOpen: boolean
  loggedIn: boolean
  classes: CompetitionClass[]
  formFields: FormFieldDefinition[]
  applications: Application[]
}) {
  const router = useRouter()
  const [teamName, setTeamName] = useState("")
  const [classId, setClassId] = useState(
    classes.length === 1 ? classes[0].id : ""
  )
  const [answers, setAnswers] = useState<FormAnswers>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [withdrawing, setWithdrawing] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  function resetForm() {
    setTeamName("")
    setClassId(classes.length === 1 ? classes[0].id : "")
    setAnswers({})
    setFormErrors({})
    setEditingId(null)
  }

  function edit(application: Application) {
    setEditingId(application.id)
    setTeamName(application.teamName)
    setClassId(
      application.class?.id ?? (classes.length === 1 ? classes[0].id : "")
    )
    setAnswers(application.formValues)
    setFormErrors({})
    setError("")
    setMessage("")
    window.setTimeout(() => {
      document
        .getElementById("registration-form")
        ?.scrollIntoView({ behavior: "smooth", block: "start" })
    }, 0)
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError("")
    setMessage("")
    const validated = validateFormAnswers(
      formFields,
      answers,
      "REGISTRATION"
    )
    setFormErrors(validated.errors)
    if (Object.keys(validated.errors).length > 0) {
      setSaving(false)
      setError("Kontrolli kohustuslikke ja vigaseid vormivälju")
      return
    }
    const editingApplication = applications.find(
      ({ id }) => id === editingId
    )
    const response = await fetch(
      editingId
        ? `/api/registration-applications/${editingId}`
        : `/api/public/competitions/${competitionId}/registrations`,
      {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamName,
          classId,
          answers: validated.answers,
        }),
      }
    )
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      setError(
        data.error ??
          (editingId ? "Muutmine ebaõnnestus" : "Registreerimine ebaõnnestus")
      )
    } else {
      resetForm()
      if (editingId) {
        setMessage(
          editingApplication?.status !== data.status
            ? `Muudatused salvestatud. Uus staatus: ${
                STATUS_LABEL[data.status] ?? data.status
              }.`
            : "Muudatused salvestatud."
        )
      } else {
        setMessage(
          data.status === "WAITLISTED"
            ? "Võistkond lisati ootenimekirja."
            : "Võistkond on registreeritud."
        )
      }
      router.refresh()
    }
    setSaving(false)
  }

  function updateAnswer(key: string, value: FormAnswer) {
    setAnswers((current) => ({ ...current, [key]: value }))
    setFormErrors((current) => {
      if (!current[key]) return current
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  async function withdraw(applicationId: string) {
    if (!window.confirm("Kas loobud selle võistkonna registreerimisest?")) return
    setWithdrawing(applicationId)
    setError("")
    const response = await fetch(
      `/api/registration-applications/${applicationId}`,
      { method: "DELETE" }
    )
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      setError(data.error ?? "Loobumine ebaõnnestus")
    } else {
      setMessage("Registreerimisest on loobutud.")
      router.refresh()
    }
    setWithdrawing(null)
  }

  return (
    <div className="space-y-6">
      {applications.length > 0 && (
        <section className="bg-white border rounded-xl p-5">
          <h2 className="font-semibold text-gray-900">Minu registreerimised</h2>
          <div className="divide-y mt-3">
            {applications.map((application) => (
              <div
                key={application.id}
                className="py-3 flex flex-wrap items-center justify-between gap-3"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {application.teamName}
                  </p>
                  {application.class && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      Klass: {application.class.name}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full ${
                      STATUS_COLOR[application.status] ??
                      "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {STATUS_LABEL[application.status] ?? application.status}
                  </span>
                  {registrationOpen &&
                    ["CONFIRMED", "WAITLISTED", "PENDING_REVIEW"].includes(
                      application.status
                    ) && (
                      <>
                        <button
                          type="button"
                          onClick={() => edit(application)}
                          disabled={saving || withdrawing === application.id}
                          className="text-xs text-blue-600 hover:underline disabled:opacity-50"
                        >
                          Muuda
                        </button>
                        <button
                          type="button"
                          onClick={() => withdraw(application.id)}
                          disabled={withdrawing === application.id}
                          className="text-xs text-red-600 hover:underline disabled:opacity-50"
                        >
                          Loobu
                        </button>
                      </>
                    )}
                </div>
                {application.allocationReason && (
                  <p className="w-full text-xs text-gray-500">
                    {application.allocationReason}
                  </p>
                )}
                {application.status === "WAITLISTED" &&
                  application.waitlistPosition && (
                    <p className="w-full text-sm font-medium text-amber-700">
                      Ootenimekirja koht: {application.waitlistPosition}.
                    </p>
                  )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section id="registration-form" className="bg-white border rounded-xl p-5">
        <h2 className="font-semibold text-gray-900">
          {editingId ? "Muuda registreeringut" : "Registreeri võistkond"}
        </h2>

        {!registrationOpen ? (
          <p className="text-sm text-gray-500 mt-3">
            Registreerimine ei ole praegu avatud.
          </p>
        ) : !loggedIn ? (
          <div className="mt-4">
            <p className="text-sm text-gray-500 mb-3">
              Võistkonna registreerimiseks logi sisse.
            </p>
            <Link
              href={`/login?callbackUrl=${encodeURIComponent(
                `/competitions/${competitionId}`
              )}`}
              className="inline-flex px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              Logi sisse ja registreeri
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4 mt-4">
            {editingId && (
              <p className="text-sm text-amber-800 bg-amber-50 rounded-lg px-3 py-2">
                Klassi või kohtade jaotamise reeglites kasutatavate väljade
                muutmine võib viia võistkonna ootenimekirja või vabastada talle
                koha.
              </p>
            )}
            <div>
              <label
                htmlFor="registration-team-name"
                className="text-sm font-medium text-gray-700 mb-1 block"
              >
                Võistkonna nimi *
              </label>
              <input
                id="registration-team-name"
                required
                maxLength={200}
                value={teamName}
                onChange={(event) => setTeamName(event.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
            </div>
            {classes.length === 1 && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">Klass</p>
                <p className="w-full px-3 py-2 bg-gray-50 border rounded-lg text-sm text-gray-700">
                  {classes[0].name}
                  <span className="text-xs text-gray-400 ml-2">
                    määratakse automaatselt
                  </span>
                </p>
              </div>
            )}
            {classes.length > 1 && (
              <div>
                <label
                  htmlFor="registration-class"
                  className="text-sm font-medium text-gray-700 mb-1 block"
                >
                  Klass *
                </label>
                <select
                  id="registration-class"
                  required
                  value={classId}
                  onChange={(event) => setClassId(event.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                >
                  <option value="">Vali klass</option>
                  {classes.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {formFields.some((field) => field.showInRegistration) && (
              <DynamicFormFields
                fields={formFields}
                phase="REGISTRATION"
                values={answers}
                onChange={updateAnswer}
                errors={formErrors}
              />
            )}
            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {saving
                  ? editingId
                    ? "Salvestan..."
                    : "Registreerin..."
                  : editingId
                    ? "Salvesta muudatused"
                    : "Registreeri võistkond"}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={saving}
                  className="px-4 py-2 border rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Loobu muutmisest
                </button>
              )}
            </div>
          </form>
        )}

        {error && (
          <p className="mt-4 text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
        {message && (
          <p className="mt-4 text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">
            {message}
          </p>
        )}
      </section>
    </div>
  )
}
