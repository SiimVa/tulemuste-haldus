"use client"

import Link from "next/link"
import { OrganizerRegistrationEditor, type OrganizerRegistrationTarget } from "@/components/registration/OrganizerRegistrationEditor"
import type { TeamCompositionSettings } from "@/lib/teamComposition"
import { use, useCallback, useEffect, useState } from "react"
import { DynamicFormFields } from "@/components/registration/DynamicFormFields"
import {
  isFormFieldVisible,
  validateFormAnswers,
  type FormAnswer,
  type FormAnswers,
  type FormFieldDefinition,
} from "@/lib/registrationForm"
import { Card, cardClass } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { RegistrationExportButtons } from "@/components/registration/RegistrationExportButtons"
import { CompetitionNav } from "@/components/competition/CompetitionNav"
import { FinalizeReview, type FinalizeCheck } from "@/components/registration/FinalizeReview"

type WorkflowStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "APPROVED"
  | "CHANGES_REQUESTED"

type RegistrationTeam = {
  id: string
  code: string
  name: string
  class: string | null
  pendingRepresentativeEmail: string | null
  pendingRepresentativeName: string | null
  answers: FormAnswers
  registrationStatus: WorkflowStatus
  registrationReviewNote: string | null
  mandateStatus: WorkflowStatus
  mandateReviewNote: string | null
  members: {
    id: string
    name: string
    role: string
    isCaptain: boolean
    assignmentRole: string | null
    user: { id: string; name: string } | null
  }[]
  representative: {
    member: { user: { id: string; name: string; email: string } }
  } | null
  details: { fieldId: string; label: string; value: string }[]
}

type PhaseStatus = "NOT_OPEN" | "OPEN" | "CLOSED" | "FINALIZED"
type RegistrationApplication = {
  id: string
  teamName: string
  status: string
  allocationReason: string | null
  waitlistPosition: number | null
  submittedAt: string | null
  class: { id: string; name: string } | null
  currentRepresentative: { id?: string; name: string; email: string } | null
  submittedBy: { id: string; name: string; email: string }
  team: { id: string; code: string } | null
  pendingRepresentativeEmail: string | null
  pendingRepresentativeName: string | null
  answers: FormAnswers
  details: { fieldId: string; label: string; value: string }[]
  events: {
    id: string
    fromStatus: string | null
    toStatus: string
    note: string | null
    createdAt: string
    actor: { name: string } | null
  }[]
}
type RegistrationOverview = {
  registrationStatus: PhaseStatus
  registrationApprovalMode: "AUTOMATIC" | "MANUAL"
  mandateStatus: PhaseStatus
  mandateApprovalMode: "AUTOMATIC" | "MANUAL"
  registrationFinalizedAt: string | null
  registrationCapacity: number | null
  registrationClasses: { id: string; name: string }[]
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

const PHASE_LABEL: Record<PhaseStatus, string> = {
  NOT_OPEN: "Pole veel avatud",
  OPEN: "Avatud",
  CLOSED: "Suletud",
  FINALIZED: "Kinnitatud",
}

const APPLICATION_LABEL: Record<string, string> = {
  DRAFT: "Mustand",
  PENDING_REVIEW: "Ootab ülevaatamist",
  CHANGES_REQUESTED: "Vajab täiendamist",
  CONFIRMED: "Registreeritud",
  WAITLISTED: "Ootenimekirjas",
  REJECTED: "Tagasi lükatud",
  WITHDRAWN: "Loobunud",
}

const APPLICATION_COLOR: Record<string, string> = {
  CONFIRMED: "bg-green-100 text-green-700",
  WAITLISTED: "bg-amber-100 text-amber-800",
  PENDING_REVIEW: "bg-blue-100 text-blue-700",
  CHANGES_REQUESTED: "bg-amber-100 text-amber-800",
  REJECTED: "bg-red-100 text-red-700",
  WITHDRAWN: "bg-gray-100 text-gray-600",
  DRAFT: "bg-gray-100 text-gray-700",
}

export default function RegistrationsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: competitionId } = use(params)
  const [editor, setEditor] = useState<OrganizerRegistrationTarget | null>(null)
  const [formFields, setFormFields] = useState<FormFieldDefinition[]>([])
  const [teamComposition, setTeamComposition] = useState<TeamCompositionSettings>()
  const [teams, setTeams] = useState<RegistrationTeam[]>([])
  const [applications, setApplications] = useState<RegistrationApplication[]>([])
  const [memberFormFields, setMemberFormFields] = useState<
    FormFieldDefinition[]
  >([])
  const [overview, setOverview] = useState<RegistrationOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [reviewing, setReviewing] = useState<string | null>(null)
  const [finalizing, setFinalizing] = useState(false)
  const [finalizeCheck, setFinalizeCheck] = useState<FinalizeCheck | null>(null)
  const [editingApplicationId, setEditingApplicationId] = useState<
    string | null
  >(null)
  const [editingAnswers, setEditingAnswers] = useState<FormAnswers>({})
  const [editingErrors, setEditingErrors] = useState<Record<string, string>>({})

  const loadTeams = useCallback(async () => {
    const response = await fetch(
      `/api/competitions/${competitionId}/registrations`
    )
    const data = await response.json()
    if (!response.ok) {
      setError(data.error ?? "Registreerimiste laadimine ebaõnnestus")
      setLoading(false)
      return
    }
    setFormFields(data.formFields ?? [])
    setTeamComposition(data.teamComposition)
    setTeams(data.legacyTeams ?? [])
    setApplications(data.applications ?? [])
    setMemberFormFields(data.memberFormFields ?? [])
    setOverview(data.competition ?? null)
    setLoading(false)
  }, [competitionId])

  function editTeam(team: RegistrationTeam) {
    setEditingApplicationId(null)
    setEditor({ teamId: team.id, teamName: team.name, className: team.class, answers: team.answers, representativeName: team.pendingRepresentativeName ?? team.representative?.member.user.name, representativeEmail: team.pendingRepresentativeEmail ?? team.representative?.member.user.email })
  }

  useEffect(() => {
    if (editor) document.querySelector('[aria-label="Võistkonna andmete muutmine"]')?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [editor])

  function startEditingMembers(application: RegistrationApplication) {
    setEditor(null)
    setEditingApplicationId(application.id)
    setEditingAnswers(application.answers ?? {})
    setEditingErrors({})
    setError("")
    setMessage("")
  }

  function updateEditingAnswer(key: string, value: FormAnswer) {
    setEditingAnswers((current) => ({ ...current, [key]: value }))
    setEditingErrors((current) => {
      if (!current[key]) return current
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  async function saveApplicationMembers(applicationId: string) {
    const validated = validateFormAnswers(
      memberFormFields,
      editingAnswers,
      "REGISTRATION"
    )
    setEditingErrors(validated.errors)
    if (Object.keys(validated.errors).length > 0) {
      setError("Kontrolli osalejate kohustuslikke ja vigaseid välju")
      return
    }

    setReviewing(`application-members-${applicationId}`)
    setError("")
    setMessage("")
    const response = await fetch(
      `/api/competitions/${competitionId}/registration-applications/${applicationId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "UPDATE_MEMBERS",
          answers: validated.answers,
        }),
      }
    )
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      setError(data.error ?? "Osalejate salvestamine ebaõnnestus")
    } else {
      setEditingApplicationId(null)
      setEditingAnswers({})
      setMessage("Osalejate andmed salvestatud")
      await loadTeams()
      if (finalizeCheck) await loadFinalizeCheck()
    }
    setReviewing(null)
  }

  function canEditApplicationMembers(application: RegistrationApplication) {
    return (
      !overview?.registrationFinalizedAt &&
      !["WITHDRAWN", "REJECTED"].includes(application.status) &&
      memberFormFields.some((field) =>
        isFormFieldVisible(field, application.answers)
      )
    )
  }

  useEffect(() => {
    void loadTeams()
  }, [loadTeams])

  async function review(
    teamId: string,
    phase: "REGISTRATION" | "MANDATE",
    decision: "APPROVE" | "REQUEST_CHANGES"
  ) {
    const note =
      decision === "REQUEST_CHANGES"
        ? window.prompt("Kirjelda, mida esindaja peab parandama:")
        : ""
    if (decision === "REQUEST_CHANGES" && !note?.trim()) return

    setReviewing(`${teamId}-${phase}`)
    setError("")
    const response = await fetch(
      `/api/competitions/${competitionId}/registrations/${teamId}/review`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase, decision, note }),
      }
    )
    const data = await response.json()
    if (!response.ok) {
      setError(data.error ?? "Läbivaatamine ebaõnnestus")
    } else {
      await loadTeams()
    }
    setReviewing(null)
  }

  async function decideApplication(
    applicationId: string,
    action: "CONFIRM" | "WAITLIST" | "REQUEST_CHANGES" | "REJECT"
  ) {
    const note =
      action === "REQUEST_CHANGES"
        ? window.prompt("Kirjelda, mida registreerija peab täiendama:")
        : action === "REJECT"
          ? window.prompt("Soovi korral lisa tagasilükkamise põhjus:")
          : ""
    // Katkestatud küsimus ei tee otsust.
    if (note === null) return
    if (action === "REQUEST_CHANGES" && !note.trim()) return
    setReviewing(`application-${applicationId}`)
    setError("")
    const response = await fetch(
      `/api/competitions/${competitionId}/registration-applications/${applicationId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note }),
      }
    )
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      setError(data.error ?? "Otsuse salvestamine ebaõnnestus")
    } else {
      await loadTeams()
      if (finalizeCheck) await loadFinalizeCheck()
    }
    setReviewing(null)
  }

  function canManuallyPlaceApplication() {
    return (
      overview?.registrationApprovalMode === "MANUAL" ||
      overview?.registrationStatus !== "OPEN"
    )
  }

  // Eelkontroll näitab kõik kinnitamise takistused ja e-posti kordused korraga.
  async function loadFinalizeCheck() {
    setFinalizing(true)
    setError("")
    const response = await fetch(
      `/api/competitions/${competitionId}/registration-applications/finalize`,
      { cache: "no-store" }
    )
    const data = await response.json().catch(() => ({}))
    if (!response.ok) setError(data.error ?? "Nimekirja kontroll ebaõnnestus")
    else setFinalizeCheck(data as FinalizeCheck)
    setFinalizing(false)
  }

  async function finalizeRegistrations(acceptedIssueKeys: string[]) {
    setFinalizing(true)
    setError("")
    setMessage("")
    const response = await fetch(
      `/api/competitions/${competitionId}/registration-applications/finalize`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acceptedIssueKeys }),
      }
    )
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      // Vahepeal muutunud avaldused: näita uut seisu, mitte vana kinnitust.
      if (Array.isArray(data.issues) || Array.isArray(data.blocking)) {
        setFinalizeCheck((current) => ({
          blocking: data.blocking ?? [],
          issues: data.issues ?? [],
          applicationCount: current?.applicationCount ?? 0,
        }))
        setError("Avaldused muutusid vahepeal. Vaata ülevaatus uuesti üle.")
      } else {
        setError(data.error ?? "Nimekirja kinnitamine ebaõnnestus")
      }
    } else {
      setFinalizeCheck(null)
      setMessage(`Osalejate nimekiri kinnitatud. Loodi ${data.createdTeams} võistkonda.`)
      await loadTeams()
    }
    setFinalizing(false)
  }

  function editMembersFromReview(applicationId: string) {
    const application = applications.find((item) => item.id === applicationId)
    if (!application) return
    startEditingMembers(application)
    requestAnimationFrame(() => document.getElementById(`application-${applicationId}`)?.scrollIntoView({ behavior: "smooth", block: "start" }))
  }

  if (loading) return <p className="text-gray-400 py-10">Laadin...</p>

  return (
    <div>
      <Link
        href={`/dashboard/competitions/${competitionId}`}
        className="text-sm text-gray-400 hover:text-gray-600"
      >
        ← Tagasi
      </Link>
      <div className="mt-4 mb-6">
        <h1 className="text-xl font-bold text-gray-900">
          Registreerimine ja mandaat
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Halda avaldusi, ootenimekirja ja mandaadi töövoogu.
        </p>
      </div>

      <CompetitionNav competitionId={competitionId} />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link href={`/dashboard/competitions/${competitionId}/registration-overview`} className="text-sm text-primary hover:underline">
          Ava registreerimise ülevaade ja vali ekspordi veerud →
        </Link>
        <div className="flex flex-wrap gap-4">
          <section aria-label="Registreerimise eksport">
            <p className="mb-2 text-xs text-ink-muted">Kõik registreerimise andmed</p>
            <RegistrationExportButtons competitionId={competitionId} phase="REGISTRATION" />
          </section>
          <section aria-label="Mandaadi eksport">
            <p className="mb-2 text-xs text-ink-muted">Kõik mandaadi andmed</p>
            <RegistrationExportButtons competitionId={competitionId} phase="MANDATE" />
          </section>
        </div>
      </div>

      {error && (
        <p className="mb-4 px-4 py-3 rounded-lg bg-red-50 text-red-700 text-sm">
          {error}
        </p>
      )}
      {message && (
        <p className="mb-4 px-4 py-3 rounded-lg bg-green-50 text-green-700 text-sm">
          {message}
        </p>
      )}

      {overview && (
        <div className="grid sm:grid-cols-2 gap-4 mb-6">
          <section className={cn(cardClass, "p-4")}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-gray-500">Registreerimine</p>
                <p className="font-semibold text-gray-900 mt-1">
                  {PHASE_LABEL[overview.registrationStatus]}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Kinnitamine:{" "}
                  {overview.registrationApprovalMode === "AUTOMATIC"
                    ? "automaatne"
                    : "käsitsi"}
                </p>
              </div>
              <Link
                href={`/dashboard/competitions/${competitionId}/registration-settings`}
                className="text-xs text-blue-600 hover:underline"
              >
                Muuda avatust
              </Link>
            </div>
            {overview.registrationStatus === "CLOSED" &&
              !overview.registrationFinalizedAt && (
                <Button size="sm" className="mt-4 py-2"
                  type="button"
                  onClick={loadFinalizeCheck}
                  disabled={finalizing}
                >
                  {finalizing && !finalizeCheck
                    ? "Kontrollin..."
                    : "Kinnita osalejate nimekiri"}</Button>
              )}
          </section>
          <section className={cn(cardClass, "p-4")}>
            <p className="text-xs text-gray-500">Mandaat</p>
            <p className="font-semibold text-gray-900 mt-1">
              {PHASE_LABEL[overview.mandateStatus]}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Kinnitamine:{" "}
              {overview.mandateApprovalMode === "AUTOMATIC"
                ? "automaatne"
                : "käsitsi"}
            </p>
          </section>
        </div>
      )}

      {finalizeCheck && !overview?.registrationFinalizedAt && (
        <FinalizeReview
          check={finalizeCheck}
          busy={finalizing || Boolean(reviewing)}
          canEdit={(applicationId) => {
            const application = applications.find((item) => item.id === applicationId)
            return Boolean(application && canEditApplicationMembers(application))
          }}
          onEditMembers={editMembersFromReview}
          onReject={(applicationId) => void decideApplication(applicationId, "REJECT")}
          onConfirm={(keys) => void finalizeRegistrations(keys)}
          onCancel={() => setFinalizeCheck(null)}
        />
      )}

      <section className="mb-6">
        <Button type="button" onClick={() => { setEditingApplicationId(null); setEditor({ teamName: "", answers: {} }) }}>Lisa võistkond</Button>
        <p className="mt-2 text-xs text-gray-500">Korraldaja ja administraator saavad võistkondi lisada ja muuta ka pärast registreerimise lõppu ning mandaadi ajal.</p>
        {editor && <OrganizerRegistrationEditor
          key={editor.applicationId ?? editor.teamId ?? "new"}
          competitionId={competitionId} target={editor} fields={formFields}
          classes={overview?.registrationClasses ?? []} teamComposition={teamComposition}
          includeMandate={Boolean(editor.teamId || (!editor.applicationId && overview?.registrationFinalizedAt))}
          onCancel={() => setEditor(null)}
          onSaved={async () => { setEditor(null); setMessage("Võistkonna andmed salvestatud"); await loadTeams() }}
        />}
      </section>

      <section className="mb-8">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
          <div>
            <h2 className="font-semibold text-gray-900">
              Registreerimisavaldused
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              {applications.filter((item) => item.status === "CONFIRMED").length}
              {overview?.registrationCapacity
                ? `/${overview.registrationCapacity}`
                : ""}{" "}
              kinnitatud ·{" "}
              {applications.filter((item) => item.status === "WAITLISTED").length}{" "}
              ootenimekirjas
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {applications.map((application, index) => (
            <article
              key={application.id}
              id={`application-${application.id}`}
              className={cn(cardClass, "p-4 flex flex-wrap items-center justify-between gap-4 scroll-mt-4")}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-gray-400">#{index + 1}</span>
                  <h3 className="font-semibold text-gray-900">
                    {application.teamName}
                  </h3>
                  <span
                    className={`text-xs px-2 py-1 rounded-full ${
                      APPLICATION_COLOR[application.status] ??
                      "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {APPLICATION_LABEL[application.status] ?? application.status}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  {application.class ? `${application.class.name} · ` : ""}Praegune esindaja:{" "}
                  {application.currentRepresentative?.name ?? "Esindaja määramata"} ·{" "}
                  {application.currentRepresentative?.email ?? ""}
                  {application.currentRepresentative && !application.currentRepresentative.id && " · Konto sidumise ootel"}
                </p>
                <p className="mt-1 text-xs text-gray-500">Registreeris: {application.submittedBy.name}</p>
                {application.allocationReason && (
                  <p className="text-xs text-blue-700 mt-1">
                    {application.allocationReason}
                  </p>
                )}
                {application.status === "WAITLISTED" &&
                  application.waitlistPosition && (
                    <p className="text-sm font-medium text-amber-700 mt-1">
                      Ootenimekirja koht: {application.waitlistPosition}.
                    </p>
                  )}
                {application.details.length > 0 && (
                  <dl className="grid sm:grid-cols-2 gap-x-5 gap-y-2 mt-4">
                    {application.details.map((detail) => (
                      <div key={detail.fieldId}>
                        <dt className="text-xs text-gray-400">
                          {detail.label}
                        </dt>
                        <dd className="text-sm text-gray-700 whitespace-pre-line">
                          {detail.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
                {!["WITHDRAWN", "REJECTED"].includes(application.status) && (
                  <Button type="button" variant="secondary" size="sm" className="mt-4" onClick={() => {
                    setEditingApplicationId(null)
                    const team = teams.find((item) => item.id === application.team?.id)
                    if (team) editTeam(team)
                    else setEditor({ applicationId: application.id, teamName: application.teamName, classId: application.class?.id, answers: application.answers, representativeName: application.currentRepresentative?.name ?? "Esindaja määramata", representativeEmail: application.currentRepresentative?.email ?? "" })
                  }}>Muuda võistkonda</Button>
                )}
                {editingApplicationId === application.id ? (
                  <div className="mt-4 border-t pt-4 space-y-4">
                    <h4 className="text-sm font-semibold text-gray-800">
                      Muuda osalejaid
                    </h4>
                    <DynamicFormFields
                      fields={memberFormFields}
                      phase="REGISTRATION"
                      values={editingAnswers}
                      onChange={updateEditingAnswer}
                      errors={editingErrors}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" className="py-2"
                        type="button"
                        onClick={() => saveApplicationMembers(application.id)}
                        disabled={Boolean(reviewing)}
                      >
                        Salvesta osalejad</Button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingApplicationId(null)
                          setEditingAnswers({})
                          setEditingErrors({})
                        }}
                        disabled={Boolean(reviewing)}
                        className="px-3 py-2 border rounded-lg text-xs disabled:opacity-50"
                      >
                        Tühista
                      </button>
                    </div>
                  </div>
                ) : (
                  canEditApplicationMembers(application) && (
                    <button
                      type="button"
                      onClick={() => startEditingMembers(application)}
                      className="mt-4 text-xs text-blue-600 hover:underline"
                    >
                      Muuda osalejaid
                    </button>
                  )
                )}
                {application.events.length > 0 && (
                  <details className="mt-4 border-t pt-3">
                    <summary className="text-xs text-blue-600 cursor-pointer">
                      Muudatuste ajalugu ({application.events.length})
                    </summary>
                    <ul className="mt-3 space-y-3">
                      {application.events.map((event) => (
                        <li key={event.id} className="text-xs text-gray-600">
                          <p>
                            {new Date(event.createdAt).toLocaleString("et-EE", {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })}
                            {" · "}
                            {event.actor?.name ?? "Süsteem"}
                            {" · "}
                            {event.fromStatus &&
                            event.fromStatus !== event.toStatus
                              ? `${
                                  APPLICATION_LABEL[event.fromStatus] ??
                                  event.fromStatus
                                } → ${
                                  APPLICATION_LABEL[event.toStatus] ??
                                  event.toStatus
                                }`
                              : APPLICATION_LABEL[event.toStatus] ??
                                event.toStatus}
                          </p>
                          {event.note && (
                            <p className="text-gray-500 mt-0.5">{event.note}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
              {!overview?.registrationFinalizedAt &&
                ["PENDING_REVIEW", "CONFIRMED", "WAITLISTED"].includes(
                  application.status
                ) && (
                  <div className="flex flex-wrap gap-2">
                    {canManuallyPlaceApplication() &&
                      application.status !== "CONFIRMED" && (
                        <button
                          type="button"
                          onClick={() =>
                            decideApplication(application.id, "CONFIRM")
                          }
                          disabled={Boolean(reviewing)}
                          className="px-3 py-2 bg-green-600 text-white rounded-lg text-xs disabled:opacity-50"
                        >
                          Kinnita
                        </button>
                      )}
                    {canManuallyPlaceApplication() &&
                      application.status !== "WAITLISTED" && (
                        <button
                          type="button"
                          onClick={() =>
                            decideApplication(application.id, "WAITLIST")
                          }
                          disabled={Boolean(reviewing)}
                          className="px-3 py-2 border border-amber-300 text-amber-700 rounded-lg text-xs disabled:opacity-50"
                        >
                          Ootenimekirja
                        </button>
                      )}
                    <button
                      type="button"
                      onClick={() =>
                        decideApplication(application.id, "REQUEST_CHANGES")
                      }
                      disabled={Boolean(reviewing)}
                      className="px-3 py-2 border border-blue-200 text-blue-700 rounded-lg text-xs disabled:opacity-50"
                    >
                      Saada täiendamisele
                    </button>
                    {canManuallyPlaceApplication() && (
                      <button
                        type="button"
                        onClick={() =>
                          decideApplication(application.id, "REJECT")
                        }
                        disabled={Boolean(reviewing)}
                        className="px-3 py-2 border border-red-200 text-red-600 rounded-lg text-xs disabled:opacity-50"
                      >
                        Lükka tagasi
                      </button>
                    )}
                  </div>
                )}
            </article>
          ))}

          {applications.length === 0 && (
            <Card className="py-10 text-center text-sm text-gray-400">
              Uue töövoo registreerimisavaldusi veel pole.
            </Card>
          )}
        </div>
      </section>

      {teams.length > 0 && (
        <div className="mb-4">
          <h2 className="font-semibold text-gray-900">
            Võistkondade mandaat ja varasemad registreerimised
          </h2>
        </div>
      )}
      <div className="space-y-4">
        {teams.map((team) => (
          <article key={team.id} className={cn(cardClass, "p-5")}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold text-gray-900">
                  {team.code} · {team.name}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  {team.class ? `Klass: ${team.class} · ` : ""}
                  {team.representative
                    ? `${team.representative.member.user.name} · ${team.representative.member.user.email}`
                    : team.pendingRepresentativeEmail
                      ? `${team.pendingRepresentativeName} · ${team.pendingRepresentativeEmail} · Konto sidumise ootel`
                      : "Esindaja määramata"}
                </p>
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={() => editTeam(team)}>Muuda võistkonda</Button>
              <Link
                href={`/dashboard/competitions/${competitionId}/settings`}
                className="text-xs text-blue-600 hover:underline"
              >
                Halda esindajat
              </Link>
            </div>

            <div className="grid lg:grid-cols-2 gap-4 mt-5">
              <section className="border rounded-lg p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold">Registreerimine</h3>
                  <span
                    className={`text-xs px-2 py-1 rounded-full ${STATUS_COLOR[team.registrationStatus]}`}
                  >
                    {STATUS_LABEL[team.registrationStatus]}
                  </span>
                </div>
                {team.registrationReviewNote && (
                  <p className="text-xs text-amber-700 mt-3">
                    Märkus: {team.registrationReviewNote}
                  </p>
                )}
                {(["SUBMITTED", "APPROVED"] as WorkflowStatus[]).includes(
                  team.registrationStatus
                ) && (
                  <div className="flex gap-2 mt-4">
                    {team.registrationStatus === "SUBMITTED" && (
                      <button
                        type="button"
                        onClick={() =>
                          review(team.id, "REGISTRATION", "APPROVE")
                        }
                        disabled={Boolean(reviewing)}
                        className="px-3 py-2 bg-green-600 text-white rounded-lg text-xs disabled:opacity-50"
                      >
                        Kinnita
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        review(team.id, "REGISTRATION", "REQUEST_CHANGES")
                      }
                      disabled={Boolean(reviewing)}
                      className="px-3 py-2 border border-amber-300 text-amber-700 rounded-lg text-xs disabled:opacity-50"
                    >
                      Saada parandamisele
                    </button>
                  </div>
                )}
              </section>

              <section className="border rounded-lg p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold">
                    Mandaat · {team.members.length} liiget
                  </h3>
                  <span
                    className={`text-xs px-2 py-1 rounded-full ${STATUS_COLOR[team.mandateStatus]}`}
                  >
                    {STATUS_LABEL[team.mandateStatus]}
                  </span>
                </div>
                {team.members.length > 0 && (
                  <ul className="text-xs text-gray-600 mt-3 space-y-1">
                    {team.members.map((member) => (
                      <li key={member.id}>
                        {member.name} ·{" "}
                        {member.role === "SUPPORT" ? "Tugiliige" : "Võistleja"}
                        {member.isCaptain && " · Kapten"}
                        {member.assignmentRole &&
                          ` · ${member.assignmentRole}`}
                        {member.user && (
                          <span className="ml-1 text-green-700">
                            · Konto seotud
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {team.details.length > 0 && (
                  <dl className="mt-3 space-y-2">
                    {team.details.map((detail) => (
                      <div key={detail.fieldId}>
                        <dt className="text-xs text-gray-400">
                          {detail.label}
                        </dt>
                        <dd className="text-xs text-gray-600 whitespace-pre-line">
                          {detail.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
                {team.mandateReviewNote && (
                  <p className="text-xs text-amber-700 mt-3">
                    Märkus: {team.mandateReviewNote}
                  </p>
                )}
                {(["SUBMITTED", "APPROVED"] as WorkflowStatus[]).includes(
                  team.mandateStatus
                ) && (
                  <div className="flex gap-2 mt-4">
                    {team.mandateStatus === "SUBMITTED" && (
                      <button
                        type="button"
                        onClick={() => review(team.id, "MANDATE", "APPROVE")}
                        disabled={Boolean(reviewing)}
                        className="px-3 py-2 bg-green-600 text-white rounded-lg text-xs disabled:opacity-50"
                      >
                        Kinnita
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        review(team.id, "MANDATE", "REQUEST_CHANGES")
                      }
                      disabled={Boolean(reviewing)}
                      className="px-3 py-2 border border-amber-300 text-amber-700 rounded-lg text-xs disabled:opacity-50"
                    >
                      Saada parandamisele
                    </button>
                  </div>
                )}
              </section>
            </div>
          </article>
        ))}

      </div>
    </div>
  )
}
