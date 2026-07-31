"use client"

import Link from "next/link"
import { use, useCallback, useEffect, useState } from "react"

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
  registrationStatus: WorkflowStatus
  registrationReviewNote: string | null
  mandateStatus: WorkflowStatus
  mandateReviewNote: string | null
  members: {
    id: string
    name: string
    role: string
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
  submittedBy: { id: string; name: string; email: string }
  team: { id: string; code: string } | null
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
  mandateStatus: PhaseStatus
  registrationFinalizedAt: string | null
  registrationCapacity: number | null
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
  CONFIRMED: "Registreeritud",
  WAITLISTED: "Ootenimekirjas",
  REJECTED: "Tagasi lükatud",
  WITHDRAWN: "Loobunud",
}

const APPLICATION_COLOR: Record<string, string> = {
  CONFIRMED: "bg-green-100 text-green-700",
  WAITLISTED: "bg-amber-100 text-amber-800",
  PENDING_REVIEW: "bg-blue-100 text-blue-700",
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
  const [teams, setTeams] = useState<RegistrationTeam[]>([])
  const [applications, setApplications] = useState<RegistrationApplication[]>([])
  const [overview, setOverview] = useState<RegistrationOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [reviewing, setReviewing] = useState<string | null>(null)
  const [finalizing, setFinalizing] = useState(false)

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
    setTeams(data.legacyTeams ?? [])
    setApplications(data.applications ?? [])
    setOverview(data.competition ?? null)
    setLoading(false)
  }, [competitionId])

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
    action: "CONFIRM" | "REJECT"
  ) {
    const note =
      action === "REJECT"
        ? window.prompt("Soovi korral lisa tagasilükkamise põhjus:") ?? ""
        : ""
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
    }
    setReviewing(null)
  }

  async function finalizeRegistrations() {
    if (
      !window.confirm(
        "Kinnitan osalejate nimekirja. Kinnitatud avaldustest luuakse võistkonnad ja registreerimine lukustatakse."
      )
    ) {
      return
    }
    setFinalizing(true)
    setError("")
    const response = await fetch(
      `/api/competitions/${competitionId}/registration-applications/finalize`,
      { method: "POST" }
    )
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      setError(data.error ?? "Nimekirja kinnitamine ebaõnnestus")
    } else {
      await loadTeams()
    }
    setFinalizing(false)
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

      {error && (
        <p className="mb-4 px-4 py-3 rounded-lg bg-red-50 text-red-700 text-sm">
          {error}
        </p>
      )}

      {overview && (
        <div className="grid sm:grid-cols-2 gap-4 mb-6">
          <section className="bg-white border rounded-xl p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-gray-500">Registreerimine</p>
                <p className="font-semibold text-gray-900 mt-1">
                  {PHASE_LABEL[overview.registrationStatus]}
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
                <button
                  type="button"
                  onClick={finalizeRegistrations}
                  disabled={finalizing}
                  className="mt-4 px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium disabled:opacity-50"
                >
                  {finalizing
                    ? "Kinnitan..."
                    : "Kinnita osalejate nimekiri"}
                </button>
              )}
          </section>
          <section className="bg-white border rounded-xl p-4">
            <p className="text-xs text-gray-500">Mandaat</p>
            <p className="font-semibold text-gray-900 mt-1">
              {PHASE_LABEL[overview.mandateStatus]}
            </p>
          </section>
        </div>
      )}

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
              className="bg-white border rounded-xl p-4 flex flex-wrap items-center justify-between gap-4"
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
                  {application.class ? `${application.class.name} · ` : ""}
                  {application.submittedBy.name} ·{" "}
                  {application.submittedBy.email}
                </p>
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
              {application.status === "WAITLISTED" &&
                overview?.registrationStatus !== "OPEN" &&
                !overview?.registrationFinalizedAt && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        decideApplication(application.id, "CONFIRM")
                      }
                      disabled={Boolean(reviewing)}
                      className="px-3 py-2 bg-green-600 text-white rounded-lg text-xs disabled:opacity-50"
                    >
                      Võta vastu
                    </button>
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
                  </div>
                )}
            </article>
          ))}

          {applications.length === 0 && (
            <div className="bg-white border rounded-xl py-10 text-center text-sm text-gray-400">
              Uue töövoo registreerimisavaldusi veel pole.
            </div>
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
          <article key={team.id} className="bg-white border rounded-xl p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold text-gray-900">
                  {team.code} · {team.name}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  {team.class ? `Klass: ${team.class} · ` : ""}
                  {team.representative
                    ? `${team.representative.member.user.name} · ${team.representative.member.user.email}`
                    : "Esindaja määramata"}
                </p>
              </div>
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
                {team.registrationStatus === "SUBMITTED" && (
                  <div className="flex gap-2 mt-4">
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
                {team.mandateStatus === "SUBMITTED" && (
                  <div className="flex gap-2 mt-4">
                    <button
                      type="button"
                      onClick={() => review(team.id, "MANDATE", "APPROVE")}
                      disabled={Boolean(reviewing)}
                      className="px-3 py-2 bg-green-600 text-white rounded-lg text-xs disabled:opacity-50"
                    >
                      Kinnita
                    </button>
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
