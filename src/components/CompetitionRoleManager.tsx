"use client"

import { useCallback, useEffect, useState } from "react"

type ManagedRole = "ORGANIZER" | "JUDGE" | "REPRESENTATIVE"
type CompetitionRole = ManagedRole | "OWNER" | "COMPETITOR" | "VIEWER"

type ElementOption = { id: string; name: string; code: string }
type TeamOption = { id: string; name: string; code: string }
type CompetitionMember = {
  id: string
  userId: string
  user: { id: string; name: string; email: string }
  roles: { role: CompetitionRole }[]
  judgedElements: {
    element: ElementOption & { order: number }
  }[]
  representedTeams: { team: TeamOption }[]
}
type RoleData = {
  canManageOrganizers: boolean
  owner: CompetitionMember
  members: CompetitionMember[]
}

const ROLE_LABELS: Record<CompetitionRole, string> = {
  OWNER: "Peakorraldaja",
  ORGANIZER: "Korraldaja",
  JUDGE: "Kohtunik",
  COMPETITOR: "Võistleja",
  REPRESENTATIVE: "Esindaja",
  VIEWER: "Vaatleja",
}

const MANAGED_ROLES: {
  role: ManagedRole
  label: string
  help: string
}[] = [
  {
    role: "ORGANIZER",
    label: "Korraldaja",
    help: "Saab hallata võistlust, registreerimist ja tulemusi.",
  },
  {
    role: "JUDGE",
    label: "Kohtunik",
    help: "Saab sisestada tulemusi valitud hindamiselementides.",
  },
  {
    role: "REPRESENTATIVE",
    label: "Esindaja",
    help: "Saab hallata valitud võistkondade registreerimist ja mandaati.",
  },
]

function roleNames(member: CompetitionMember) {
  return member.roles.map(({ role }) => role)
}

export function CompetitionRoleManager({
  competitionId,
  elements,
  teams,
}: {
  competitionId: string
  elements: ElementOption[]
  teams: TeamOption[]
}) {
  const [data, setData] = useState<RoleData | null>(null)
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState("")
  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [roles, setRoles] = useState<ManagedRole[]>([])
  const [elementIds, setElementIds] = useState<string[]>([])
  const [teamIds, setTeamIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const loadRoles = useCallback(async () => {
    const response = await fetch(
      `/api/competitions/${competitionId}/roles`
    )
    const responseData = await response.json().catch(() => null)
    if (!response.ok) {
      setError(responseData?.error ?? "Rollide laadimine ebaõnnestus")
      setLoading(false)
      return
    }
    setData(responseData)
    setLoading(false)
  }, [competitionId])

  useEffect(() => {
    void loadRoles()
  }, [loadRoles])

  function resetForm() {
    setEmail("")
    setEditingUserId(null)
    setRoles([])
    setElementIds([])
    setTeamIds([])
    setError("")
  }

  function editMember(member: CompetitionMember) {
    const currentRoles = roleNames(member)
    setEmail(member.user.email)
    setEditingUserId(member.userId)
    setRoles(
      MANAGED_ROLES.map(({ role }) => role).filter((role) =>
        currentRoles.includes(role)
      )
    )
    setElementIds(
      member.judgedElements.map(({ element }) => element.id)
    )
    setTeamIds(member.representedTeams.map(({ team }) => team.id))
    setError("")
  }

  function toggleRole(role: ManagedRole) {
    setRoles((current) =>
      current.includes(role)
        ? current.filter((item) => item !== role)
        : [...current, role]
    )
  }

  function toggleSelection(
    id: string,
    setter: React.Dispatch<React.SetStateAction<string[]>>
  ) {
    setter((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    )
  }

  async function updateRoles(requestedRoles: ManagedRole[]) {
    setSaving(true)
    setError("")
    const response = await fetch(
      `/api/competitions/${competitionId}/roles`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          roles: requestedRoles,
          elementIds,
          teamIds,
        }),
      }
    )
    const responseData = await response.json().catch(() => ({}))
    setSaving(false)
    if (!response.ok) {
      setError(responseData.error ?? "Rollide salvestamine ebaõnnestus")
      return false
    }
    await loadRoles()
    resetForm()
    return true
  }

  async function saveRoles(event: React.FormEvent) {
    event.preventDefault()
    await updateRoles(roles)
  }

  async function removeManagedRoles(member: CompetitionMember) {
    if (
      !confirm(
        `Eemalda kasutaja ${member.user.name} võistlusepõhised õigused?`
      )
    ) {
      return
    }
    setEmail(member.user.email)
    setEditingUserId(member.userId)
    setElementIds([])
    setTeamIds([])
    setSaving(true)
    setError("")
    const response = await fetch(
      `/api/competitions/${competitionId}/roles`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: member.user.email,
          roles: [],
          elementIds: [],
          teamIds: [],
        }),
      }
    )
    const responseData = await response.json().catch(() => ({}))
    setSaving(false)
    if (!response.ok) {
      setError(responseData.error ?? "Rollide eemaldamine ebaõnnestus")
      return
    }
    await loadRoles()
    resetForm()
  }

  if (loading) {
    return (
      <section className="bg-white border border-blue-200 rounded-xl p-5 mb-6">
        <p className="text-sm text-gray-400">Laadin kasutajate rolle...</p>
      </section>
    )
  }

  return (
    <section className="bg-white border border-blue-200 rounded-xl p-5 mb-6 space-y-5">
      <div>
        <h2 className="font-semibold text-gray-900">
          Kasutajate võistlusepõhised rollid
        </h2>
        <p className="text-xs text-gray-500 mt-1">
          Määra olemasolevale kasutajakontole korraldaja, kohtuniku või
          esindaja õigused. Ühel kasutajal võib olla mitu rolli.
        </p>
      </div>

      {data && (
        <div className="divide-y border rounded-lg">
          {[data.owner, ...data.members].map((member) => {
            const currentRoles = roleNames(member)
            const isOwner = member.userId === data.owner.userId
            const hasManagedRoles = currentRoles.some((role) =>
              MANAGED_ROLES.some(({ role: managedRole }) =>
                role === managedRole
              )
            )
            const canRemove =
              hasManagedRoles &&
              (data.canManageOrganizers ||
                !currentRoles.includes("ORGANIZER"))

            return (
              <div
                key={member.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {member.user.name}
                  </p>
                  <p className="text-xs text-gray-400">{member.user.email}</p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {currentRoles.map((role) => (
                      <span
                        key={role}
                        className="text-xs rounded-full bg-gray-100 text-gray-600 px-2 py-0.5"
                      >
                        {ROLE_LABELS[role]}
                      </span>
                    ))}
                  </div>
                  {member.judgedElements.length > 0 && (
                    <p className="text-xs text-gray-500 mt-1.5">
                      Elemendid: {member.judgedElements
                        .map(
                          ({ element }) =>
                            `${element.code} · ${element.name}`
                        )
                        .join(", ")}
                    </p>
                  )}
                  {member.representedTeams.length > 0 && (
                    <p className="text-xs text-gray-500 mt-1.5">
                      Võistkonnad: {member.representedTeams
                        .map(({ team }) => `${team.code} · ${team.name}`)
                        .join(", ")}
                    </p>
                  )}
                </div>
                {!isOwner && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => editMember(member)}
                      className="text-xs text-blue-600 hover:text-blue-700 px-2 py-1"
                    >
                      Muuda rolle
                    </button>
                    {canRemove && (
                      <button
                        type="button"
                        onClick={() => removeManagedRoles(member)}
                        disabled={saving}
                        className="text-xs text-red-500 hover:text-red-600 px-2 py-1 disabled:opacity-50"
                      >
                        Eemalda õigused
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <form onSubmit={saveRoles} className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-gray-800">
            {editingUserId ? "Muuda kasutaja rolle" : "Lisa kasutajale rollid"}
          </h3>
          {editingUserId && (
            <button
              type="button"
              onClick={resetForm}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Tühista muutmine
            </button>
          )}
        </div>

        <div>
          <label className="text-xs text-gray-500 mb-1 block">
            Kasutaja e-post
          </label>
          <input
            type="email"
            required
            readOnly={Boolean(editingUserId)}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="kasutaja@email.ee"
            className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 read-only:bg-gray-50"
          />
          <p className="text-xs text-gray-400 mt-1">
            Kasutajakonto peab enne olemas olema.
          </p>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          {MANAGED_ROLES.map(({ role, label, help }) => {
            const organizerLocked =
              role === "ORGANIZER" && !data?.canManageOrganizers
            return (
              <label
                key={role}
                className={`border rounded-lg px-3 py-3 flex items-start gap-3 ${
                  organizerLocked
                    ? "bg-gray-50 text-gray-400"
                    : "cursor-pointer hover:bg-gray-50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={roles.includes(role)}
                  disabled={organizerLocked}
                  onChange={() => toggleRole(role)}
                  className="mt-0.5 rounded border-gray-300"
                />
                <span>
                  <span className="block text-sm font-medium">{label}</span>
                  <span className="block text-xs mt-1">{help}</span>
                  {organizerLocked && (
                    <span className="block text-xs mt-1">
                      Muudetav ainult omanikule või administraatorile.
                    </span>
                  )}
                </span>
              </label>
            )
          })}
        </div>

        {roles.includes("JUDGE") && (
          <div>
            <div className="flex items-center justify-between gap-3 mb-1">
              <label className="text-xs text-gray-500">
                Kohtuniku lubatud elemendid
              </label>
              {elements.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setElementIds(
                      elementIds.length === elements.length
                        ? []
                        : elements.map(({ id }) => id)
                    )
                  }
                  className="text-xs text-blue-600 hover:underline"
                >
                  {elementIds.length === elements.length
                    ? "Tühista kõik"
                    : "Vali kõik"}
                </button>
              )}
            </div>
            <div className="border rounded-lg max-h-52 overflow-y-auto divide-y">
              {elements.length === 0 ? (
                <p className="text-sm text-gray-400 px-3 py-4">
                  Võistlusel pole veel elemente.
                </p>
              ) : (
                elements.map((element) => (
                  <label
                    key={element.id}
                    className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={elementIds.includes(element.id)}
                      onChange={() =>
                        toggleSelection(element.id, setElementIds)
                      }
                      className="rounded border-gray-300"
                    />
                    <span className="font-medium text-gray-700">
                      {element.code} · {element.name}
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>
        )}

        {roles.includes("REPRESENTATIVE") && (
          <div>
            <label className="text-xs text-gray-500 mb-1 block">
              Esindaja võistkonnad
            </label>
            <div className="border rounded-lg max-h-52 overflow-y-auto divide-y">
              {teams.length === 0 ? (
                <p className="text-sm text-gray-400 px-3 py-4">
                  Võistlusel pole veel võistkondi.
                </p>
              ) : (
                teams.map((team) => (
                  <label
                    key={team.id}
                    className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={teamIds.includes(team.id)}
                      onChange={() => toggleSelection(team.id, setTeamIds)}
                      className="rounded border-gray-300"
                    />
                    <span className="font-medium text-gray-700">
                      {team.code} · {team.name}
                    </span>
                  </label>
                ))
              )}
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Kui võistkonnal oli teine esindaja, liigub esindusõigus sellele
              kasutajale.
            </p>
          </div>
        )}

        <button
          type="submit"
          disabled={
            saving ||
            !email ||
            (roles.includes("JUDGE") && elementIds.length === 0) ||
            (roles.includes("REPRESENTATIVE") && teamIds.length === 0)
          }
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Salvestan..." : "Salvesta õigused"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </section>
  )
}
