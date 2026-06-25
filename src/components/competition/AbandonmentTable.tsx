"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

type Member = { name: string; role: string }
type Team = { id: string; name: string; code: string; members: Member[] }
type MiscEntry = {
  id: string
  teamId: string
  team: { id: string; name: string; code: string }
  points: number
  description: string
}

const WHOLE_TEAM = "Kogu võistkond"

export function AbandonmentTable({
  competitionId,
  elementId,
  scoringMode,
  mode,
  penaltyPerMember,
  teams,
  initialEntries,
}: {
  competitionId: string
  elementId: string
  scoringMode: "PENALTY" | "PLUS"
  mode: "FIXED" | "CUSTOM"
  penaltyPerMember: number
  teams: Team[]
  initialEntries: MiscEntry[]
}) {
  const [entries, setEntries] = useState<MiscEntry[]>(initialEntries)
  const [busy, setBusy] = useState<string | null>(null)
  const router = useRouter()

  // PENALTY: karistus = positiivne (lisab); PLUS: negatiivne (lahutab)
  const signed = (magnitude: number) => (scoringMode === "PLUS" ? -Math.abs(magnitude) : Math.abs(magnitude))

  async function recalculate() {
    await fetch(`/api/competitions/${competitionId}/recalculate`, { method: "POST" }).catch(() => {})
  }

  async function addEntry(teamId: string, description: string, points: number) {
    setBusy(`${teamId}:${description}`)
    const res = await fetch(`/api/competitions/${competitionId}/elements/${elementId}/misc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId, points, description }),
    })
    if (res.ok) {
      const entry = await res.json()
      setEntries((prev) => [...prev, entry])
      await recalculate()
      router.refresh()
    }
    setBusy(null)
  }

  async function removeEntry(id: string) {
    setBusy(id)
    const res = await fetch(`/api/misc-entries/${id}`, { method: "DELETE" })
    if (res.ok) {
      setEntries((prev) => prev.filter((e) => e.id !== id))
      await recalculate()
      router.refresh()
    }
    setBusy(null)
  }

  function entryFor(teamId: string, description: string) {
    return entries.find((e) => e.teamId === teamId && e.description === description)
  }

  async function toggleMember(teamId: string, memberName: string) {
    const existing = entryFor(teamId, memberName)
    if (existing) {
      await removeEntry(existing.id)
      return
    }
    let magnitude = penaltyPerMember
    if (mode === "CUSTOM") {
      const input = prompt(`Karistus liikme "${memberName}" katkestamise eest (p):`, String(penaltyPerMember || ""))
      if (input === null) return
      magnitude = Number(input)
      if (isNaN(magnitude)) return
    }
    await addEntry(teamId, memberName, signed(magnitude))
  }

  async function toggleWholeTeam(teamId: string) {
    const existing = entryFor(teamId, WHOLE_TEAM)
    if (existing) {
      await removeEntry(existing.id)
      return
    }
    let magnitude = penaltyPerMember
    if (mode === "CUSTOM") {
      const input = prompt("Karistus kogu võistkonna katkestamise eest (p):", String(penaltyPerMember || ""))
      if (input === null) return
      magnitude = Number(input)
      if (isNaN(magnitude)) return
    }
    await addEntry(teamId, WHOLE_TEAM, signed(magnitude))
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        {mode === "FIXED"
          ? `Fikseeritud süsteem: iga katkestanud liige annab ${penaltyPerMember}p karistust.`
          : "Käsitsi süsteem: iga katkestamise korral küsitakse karistuse väärtus."}
      </p>
      {teams.map((team) => {
        const teamEntries = entries.filter((e) => e.teamId === team.id)
        const total = teamEntries.reduce((s, e) => s + e.points, 0)
        const wholeTeamEntry = entryFor(team.id, WHOLE_TEAM)
        const competitors = team.members.filter((m) => m.role === "COMPETITOR")
        return (
          <div key={team.id} className="border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 bg-gray-50">
              <span className="font-medium text-sm text-gray-800">
                <span className="font-mono text-xs text-gray-400 mr-1">[{team.code}]</span>
                {team.name}
              </span>
              <div className="flex items-center gap-3">
                {total !== 0 && (
                  <span className={`font-mono text-sm font-semibold ${total >= 0 ? "text-red-700" : "text-green-700"}`}>
                    {total >= 0 ? "+" : ""}{total.toFixed(1)} p
                  </span>
                )}
                <button
                  onClick={() => toggleWholeTeam(team.id)}
                  disabled={busy !== null}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors disabled:opacity-50 ${
                    wholeTeamEntry ? "bg-rose-600 text-white hover:bg-rose-700" : "border text-rose-600 hover:bg-rose-50"
                  }`}
                >
                  {wholeTeamEntry ? "✓ Kogu võistkond katkestas" : "Kogu võistkond katkestas"}
                </button>
              </div>
            </div>
            <div className="px-4 py-2 divide-y">
              {competitors.length === 0 ? (
                <p className="text-xs text-gray-400 py-1">Liikmeid pole lisatud (lisa võistkondade lehel).</p>
              ) : (
                competitors.map((m, mi) => {
                  const entry = entryFor(team.id, m.name)
                  return (
                    <div key={mi} className="flex items-center justify-between py-1.5 text-sm">
                      <span className="text-gray-700">{m.name}</span>
                      <div className="flex items-center gap-3">
                        {entry && (
                          <span className="font-mono text-xs text-red-600">{entry.points >= 0 ? "+" : ""}{entry.points}p</span>
                        )}
                        <button
                          onClick={() => toggleMember(team.id, m.name)}
                          disabled={busy !== null}
                          className={`px-2.5 py-1 rounded text-xs font-medium transition-colors disabled:opacity-50 ${
                            entry ? "bg-rose-600 text-white hover:bg-rose-700" : "border text-gray-500 hover:bg-gray-50"
                          }`}
                        >
                          {entry ? "✓ Katkestas" : "Katkestas"}
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
