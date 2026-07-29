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
  members: { id: string; name: string; role: string }[]
  representative: {
    member: { user: { id: string; name: string; email: string } }
  } | null
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

export default function RegistrationsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: competitionId } = use(params)
  const [teams, setTeams] = useState<RegistrationTeam[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [reviewing, setReviewing] = useState<string | null>(null)

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
    setTeams(data)
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
          Vaata esindajate esitatud andmed üle ja kinnita või saada parandamisele.
        </p>
      </div>

      {error && (
        <p className="mb-4 px-4 py-3 rounded-lg bg-red-50 text-red-700 text-sm">
          {error}
        </p>
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
                      </li>
                    ))}
                  </ul>
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

        {teams.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            Võistkondi pole veel lisatud.
          </div>
        )}
      </div>
    </div>
  )
}
