"use client"

import Link from "next/link"
import { teamDisplayName } from "@/lib/teamDisplay"
import { use, useCallback, useEffect, useState } from "react"
import { DynamicFormFields } from "@/components/registration/DynamicFormFields"
import {
  type FormAnswer,
  type FormAnswers,
  type FormFieldDefinition,
  type MemberAnswer,
  validateFormAnswers,
} from "@/lib/registrationForm"
import type { TeamCompositionSettings } from "@/lib/teamComposition"

type WorkflowStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "APPROVED"
  | "CHANGES_REQUESTED"

type TeamMember = {
  id?: string
  name: string
  role: "COMPETITOR" | "SUPPORT"
  isCaptain: boolean
  assignmentRole: string | null
  userId?: string | null
  user?: { id: string; name: string } | null
}

type Team = {
  id: string
  code: string
  name: string
  class: string | null
  registrationStatus: WorkflowStatus
  registrationSubmittedAt: string | null
  registrationReviewedAt: string | null
  registrationReviewNote: string | null
  mandateStatus: WorkflowStatus
  mandateSubmittedAt: string | null
  mandateReviewedAt: string | null
  mandateReviewNote: string | null
  members: TeamMember[]
  formFields: FormFieldDefinition[]
  formValues: FormAnswers
  mandatePhaseStatus: "NOT_OPEN" | "OPEN" | "CLOSED" | "FINALIZED"
  composition: TeamCompositionSettings
  representative: { id: string } | null
  registrationApplication: { id: string } | null
  competition: {
    id: string
    name: string
    date: string | null
    endDate: string | null
    location: string | null
    status: string
  }
}

const STATUS_LABEL: Record<WorkflowStatus, string> = {
  DRAFT: "Mustand",
  SUBMITTED: "Esitatud",
  APPROVED: "Kinnitatud",
  CHANGES_REQUESTED: "Vajab parandamist",
}

const STATUS_COLOR: Record<WorkflowStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  SUBMITTED: "bg-blue-100 text-blue-700",
  APPROVED: "bg-green-100 text-green-700",
  CHANGES_REQUESTED: "bg-amber-100 text-amber-800",
}

function StatusBadge({ status }: { status: WorkflowStatus }) {
  return (
    <span className={`text-xs px-2.5 py-1 rounded-full ${STATUS_COLOR[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  )
}

export default function RepresentativeTeamPage({
  params,
}: {
  params: Promise<{ teamId: string }>
}) {
  const { teamId } = use(params)
  const [team, setTeam] = useState<Team | null>(null)
  const [name, setName] = useState("")
  const [teamClass, setTeamClass] = useState("")
  const [members, setMembers] = useState<TeamMember[]>([])
  const [formValues, setFormValues] = useState<FormAnswers>({})
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  const loadTeam = useCallback(async () => {
    const response = await fetch(`/api/representative/teams/${teamId}`)
    const data = await response.json()
    if (!response.ok) {
      setError(data.error ?? "Võistkonna laadimine ebaõnnestus")
      setLoading(false)
      return
    }

    setTeam(data)
    setName(data.name)
    setTeamClass(data.class ?? "")
    setMembers(data.members ?? [])
    setFormValues(data.formValues ?? {})
    setLoading(false)
  }, [teamId])

  useEffect(() => {
    void loadTeam()
  }, [loadTeam])

  async function update(
    path: string,
    options: RequestInit,
    successMessage: string
  ) {
    setSaving(path)
    setError("")
    setMessage("")
    const response = await fetch(path, options)
    const data = await response.json()
    if (!response.ok) {
      setError(data.error ?? "Toiming ebaõnnestus")
      setSaving(null)
      return
    }

    setMessage(successMessage)
    await loadTeam()
    setSaving(null)
  }

  async function saveRegistration() {
    await update(
      `/api/representative/teams/${teamId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phase: "REGISTRATION",
          name,
          class: teamClass,
        }),
      },
      "Registreerimise mustand salvestatud"
    )
  }

  async function submitRegistration() {
    setSaving("registration-submit")
    setError("")
    setMessage("")

    const saveResponse = await fetch(`/api/representative/teams/${teamId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phase: "REGISTRATION",
        name,
        class: teamClass,
      }),
    })
    const saveData = await saveResponse.json()
    if (!saveResponse.ok) {
      setError(saveData.error ?? "Registreerimise salvestamine ebaõnnestus")
      setSaving(null)
      return
    }

    const submitResponse = await fetch(
      `/api/representative/teams/${teamId}/submit`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase: "REGISTRATION" }),
      }
    )
    const submitData = await submitResponse.json()
    if (!submitResponse.ok) {
      setError(submitData.error ?? "Registreerimise esitamine ebaõnnestus")
    } else {
      setMessage("Registreerimine esitatud korraldajale")
      await loadTeam()
    }
    setSaving(null)
  }

  async function saveMandate() {
    if (!team) return
    const validated = validateFormAnswers(
      team.formFields,
      formValues,
      "MANDATE"
    )
    setFormErrors(validated.errors)
    if (Object.keys(validated.errors).length > 0) {
      setError("Kontrolli mandaadi kohustuslikke ja vigaseid välju")
      return
    }
    await update(
      `/api/representative/teams/${teamId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phase: "MANDATE",
          members,
          formValues: validated.answers,
        }),
      },
      "Mandaadi mustand salvestatud"
    )
  }

  async function submitMandate() {
    if (!team) return
    const validated = validateFormAnswers(
      team.formFields,
      formValues,
      "MANDATE"
    )
    setFormErrors(validated.errors)
    if (Object.keys(validated.errors).length > 0) {
      setError("Kontrolli mandaadi kohustuslikke ja vigaseid välju")
      return
    }
    setSaving("mandate-submit")
    setError("")
    setMessage("")

    const saveResponse = await fetch(`/api/representative/teams/${teamId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phase: "MANDATE",
        members,
        formValues: validated.answers,
      }),
    })
    const saveData = await saveResponse.json()
    if (!saveResponse.ok) {
      setError(saveData.error ?? "Mandaadi salvestamine ebaõnnestus")
      setSaving(null)
      return
    }

    const submitResponse = await fetch(
      `/api/representative/teams/${teamId}/submit`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase: "MANDATE" }),
      }
    )
    const submitData = await submitResponse.json()
    if (!submitResponse.ok) {
      setError(submitData.error ?? "Mandaadi esitamine ebaõnnestus")
    } else {
      setMessage("Mandaat esitatud korraldajale")
      await loadTeam()
    }
    setSaving(null)
  }

  function updateMember(index: number, patch: Partial<TeamMember>) {
    setMembers((current) =>
      current.map((member, memberIndex) =>
        memberIndex === index ? { ...member, ...patch } : member
      )
    )
  }

  function setCaptain(index: number, selected: boolean) {
    setMembers((current) =>
      current.map((member, memberIndex) => ({
        ...member,
        isCaptain: selected && memberIndex === index,
      }))
    )
  }

  function updateFormValue(key: string, value: FormAnswer) {
    setFormValues((current) => ({ ...current, [key]: value }))
    setFormErrors((current) => {
      if (!current[key]) return current
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  if (loading) return <p className="text-gray-400 py-10">Laadin...</p>
  if (!team) return <p className="text-red-600 py-10">{error}</p>

  const registrationEditable =
    team.registrationStatus === "DRAFT" ||
    team.registrationStatus === "CHANGES_REQUESTED"
  const mandateEditable =
    team.registrationStatus === "APPROVED" &&
    (team.mandateStatus === "DRAFT" ||
      team.mandateStatus === "CHANGES_REQUESTED") &&
    (!team.registrationApplication || team.mandatePhaseStatus === "OPEN")
  const memberFormFields = team.formFields.filter(
    (field) => field.type === "MEMBER_LIST" && field.showInMandate
  )
  const competitorCount =
    memberFormFields.length > 0
      ? memberFormFields.reduce((count, field) => {
          const value = formValues[field.key]
          return (
            count +
            (Array.isArray(value)
              ? value.filter(
                  (member): member is MemberAnswer =>
                    typeof member === "object" &&
                    member !== null &&
                    typeof member.name === "string" &&
                    Boolean(member.name.trim())
                ).length
              : 0)
          )
        }, 0)
      : members.filter(
          (member) => member.role === "COMPETITOR" && member.name.trim()
        ).length

  return (
    <div className="max-w-3xl">
      <Link href="/dashboard" className="text-sm text-gray-400 hover:text-gray-600">
        ← Tagasi
      </Link>

      <div className="mt-4 mb-6">
        <p className="text-sm font-medium text-blue-600">
          {team.competition.name}
        </p>
        <h1 className="text-2xl font-bold text-gray-900 mt-1">
          {teamDisplayName(team)}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {[team.competition.location, team.competition.date
            ? new Date(team.competition.date).toLocaleDateString("et-EE")
            : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      {message && (
        <p className="mb-4 px-4 py-3 rounded-lg bg-green-50 text-green-700 text-sm">
          {message}
        </p>
      )}
      {error && (
        <p className="mb-4 px-4 py-3 rounded-lg bg-red-50 text-red-700 text-sm">
          {error}
        </p>
      )}

      <section className="bg-white border rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-gray-900">1. Registreerimine</h2>
            <p className="text-xs text-gray-500 mt-1">
              Kontrolli võistkonna põhiandmed ja esita need korraldajale.
            </p>
          </div>
          <StatusBadge status={team.registrationStatus} />
        </div>

        {team.registrationReviewNote && (
          <div className="bg-amber-50 text-amber-800 rounded-lg px-4 py-3 text-sm">
            Korraldaja märkus: {team.registrationReviewNote}
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-sm text-gray-600">
            Võistkonna nimi
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={!registrationEditable}
              className="mt-1 w-full px-3 py-2 border rounded-lg disabled:bg-gray-50"
            />
          </label>
          {(team.class || !team.registrationApplication) && (
            <label className="text-sm text-gray-600">
              Klass
              <input
                value={teamClass}
                onChange={(event) => setTeamClass(event.target.value)}
                disabled={!registrationEditable}
                className="mt-1 w-full px-3 py-2 border rounded-lg disabled:bg-gray-50"
              />
            </label>
          )}
        </div>

        {registrationEditable && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={saveRegistration}
              disabled={Boolean(saving)}
              className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              Salvesta mustand
            </button>
            <button
              type="button"
              onClick={submitRegistration}
              disabled={Boolean(saving) || !name.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              Esita registreerimine
            </button>
          </div>
        )}
      </section>

      <section className="mt-6 bg-white border rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-gray-900">2. Mandaat</h2>
            <p className="text-xs text-gray-500 mt-1">
              Täpsusta lõplik võistlejate ja tugiliikmete koosseis.
            </p>
          </div>
          <StatusBadge status={team.mandateStatus} />
        </div>

        {team.registrationStatus !== "APPROVED" && (
          <p className="bg-gray-50 text-gray-600 rounded-lg px-4 py-3 text-sm">
            Mandaat avaneb pärast registreerimise kinnitamist.
          </p>
        )}
        {team.registrationApplication &&
          team.registrationStatus === "APPROVED" &&
          team.mandatePhaseStatus !== "OPEN" && (
            <p className="bg-gray-50 text-gray-600 rounded-lg px-4 py-3 text-sm">
              Mandaat ei ole praegu avatud. Korraldaja saab selle avada
              registreerimise seadete lehel.
            </p>
          )}
        {team.mandateReviewNote && (
          <div className="bg-amber-50 text-amber-800 rounded-lg px-4 py-3 text-sm">
            Korraldaja märkus: {team.mandateReviewNote}
          </div>
        )}

        {team.registrationStatus === "APPROVED" && (
          <>
            {team.formFields.some((field) => field.showInMandate) && (
              <DynamicFormFields
                fields={team.formFields}
                phase="MANDATE"
                values={formValues}
                onChange={updateFormValue}
                errors={formErrors}
                disabled={!mandateEditable}
                teamComposition={team.composition}
              />
            )}

            {(team.composition.representativeRequired ||
              team.composition.captainRequired ||
              team.composition.memberRoles.length > 0) && (
              <div className="rounded-lg border bg-gray-50 px-4 py-3 text-sm text-gray-600">
                <p className="font-medium text-gray-700">Koosseisu nõuded</p>
                <ul className="mt-1 list-disc pl-5 space-y-0.5 text-xs">
                  {team.composition.representativeRequired && (
                    <li>
                      Esindaja on kohustuslik
                      {team.representative ? " · Määratud" : " · Määramata"}
                    </li>
                  )}
                  {team.composition.captainRequired && (
                    <li>Vali üks võistleja kapteniks</li>
                  )}
                  {team.composition.memberRoles.map((role) => (
                    <li key={role.name}>
                      {role.name}
                      {role.required ? " · Kohustuslik" : " · Vabatahtlik"}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {memberFormFields.length === 0 && (
              <div className="space-y-2">
              {members.length === 0 && (
                <p className="text-sm text-gray-400">Liikmeid pole veel lisatud.</p>
              )}
              {members.map((member, index) => (
                <div key={`${member.id ?? "new"}-${index}`} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center">
                  <input
                    value={member.name}
                    onChange={(event) =>
                      updateMember(index, { name: event.target.value })
                    }
                    disabled={!mandateEditable}
                    placeholder="Ees- ja perekonnanimi"
                    className="flex-1 px-3 py-2 border rounded-lg text-sm disabled:bg-gray-50"
                  />
                  <select
                    value={member.role}
                    onChange={(event) =>
                      updateMember(index, {
                        role: event.target.value as TeamMember["role"],
                        ...(event.target.value === "SUPPORT"
                          ? { isCaptain: false }
                          : {}),
                      })
                    }
                    disabled={!mandateEditable}
                    className="px-3 py-2 border rounded-lg text-sm disabled:bg-gray-50"
                  >
                    <option value="COMPETITOR">Võistleja</option>
                    <option value="SUPPORT">Tugiliige</option>
                  </select>
                  {team.composition.captainRequired && (
                    <label className="flex items-center gap-2 text-sm text-gray-600">
                      <input
                        type="checkbox"
                        checked={member.isCaptain}
                        disabled={!mandateEditable || member.role !== "COMPETITOR"}
                        onChange={(event) =>
                          setCaptain(index, event.target.checked)
                        }
                      />
                      Kapten
                    </label>
                  )}
                  {team.composition.memberRoles.length > 0 && (
                    <select
                      aria-label={`Liige ${index + 1} roll`}
                      value={member.assignmentRole ?? ""}
                      disabled={!mandateEditable}
                      onChange={(event) =>
                        updateMember(index, {
                          assignmentRole: event.target.value || null,
                        })
                      }
                      className="px-3 py-2 border rounded-lg text-sm disabled:bg-gray-50"
                    >
                      <option value="">Roll puudub</option>
                      {team.composition.memberRoles.map((role) => (
                        <option key={role.name} value={role.name}>
                          {role.name}
                          {role.required ? " *" : ""}
                        </option>
                      ))}
                    </select>
                  )}
                  {mandateEditable && (
                    <button
                      type="button"
                      onClick={() =>
                        setMembers((current) =>
                          current.filter((_, memberIndex) => memberIndex !== index)
                        )
                      }
                      className="px-3 text-red-500 hover:bg-red-50 rounded-lg"
                      aria-label="Eemalda liige"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              </div>
            )}

            {team.members.some((member) => member.user) && (
              <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
                <p className="text-xs font-medium text-green-800">
                  Kontoga seotud liikmed
                </p>
                <ul className="mt-2 space-y-1 text-sm text-green-800">
                  {team.members
                    .filter((member) => member.user)
                    .map((member) => (
                      <li key={member.id ?? member.name}>
                        {member.name} · Konto seotud
                      </li>
                    ))}
                </ul>
              </div>
            )}

            {mandateEditable && (
              <div className="flex flex-wrap gap-2">
                {memberFormFields.length === 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setMembers((current) => [
                        ...current,
                        {
                          name: "",
                          role: "COMPETITOR",
                          isCaptain: false,
                          assignmentRole: null,
                        },
                      ])
                    }
                    className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50"
                  >
                    + Lisa liige
                  </button>
                )}
                <button
                  type="button"
                  onClick={saveMandate}
                  disabled={Boolean(saving)}
                  className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
                >
                  Salvesta mustand
                </button>
                <button
                  type="button"
                  onClick={submitMandate}
                  disabled={Boolean(saving) || competitorCount === 0}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  Esita mandaat
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}
