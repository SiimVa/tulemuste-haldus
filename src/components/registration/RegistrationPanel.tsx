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
  submittedAt: string | Date | null
  class: { name: string }
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
  const [classId, setClassId] = useState(classes[0]?.id ?? "")
  const [answers, setAnswers] = useState<FormAnswers>({})
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [withdrawing, setWithdrawing] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

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
    const response = await fetch(
      `/api/public/competitions/${competitionId}/registrations`,
      {
        method: "POST",
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
      setError(data.error ?? "Registreerimine ebaõnnestus")
    } else {
      setTeamName("")
      setAnswers({})
      setFormErrors({})
      setMessage(
        data.status === "WAITLISTED"
          ? "Võistkond lisati ootenimekirja."
          : "Võistkond on registreeritud."
      )
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
                  <p className="text-xs text-gray-500 mt-0.5">
                    Klass: {application.class.name}
                  </p>
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
                      <button
                        type="button"
                        onClick={() => withdraw(application.id)}
                        disabled={withdrawing === application.id}
                        className="text-xs text-red-600 hover:underline disabled:opacity-50"
                      >
                        Loobu
                      </button>
                    )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="bg-white border rounded-xl p-5">
        <h2 className="font-semibold text-gray-900">Registreeri võistkond</h2>

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
        ) : classes.length === 0 ? (
          <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-3">
            Korraldaja pole veel klasse määranud.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-4 mt-4">
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
                {classes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
            {formFields.some((field) => field.showInRegistration) && (
              <DynamicFormFields
                fields={formFields}
                phase="REGISTRATION"
                values={answers}
                onChange={updateAnswer}
                errors={formErrors}
              />
            )}
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Registreerin..." : "Registreeri võistkond"}
            </button>
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
