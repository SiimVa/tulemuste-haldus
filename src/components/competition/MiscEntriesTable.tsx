"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

type Team = { id: string; name: string; code: string }
type MiscEntry = {
  id: string
  teamId: string
  team: { id: string; name: string; code: string }
  points: number
  description: string
}

export function MiscEntriesTable({
  competitionId,
  elementId,
  teams,
  initialEntries,
}: {
  competitionId: string
  elementId: string
  teams: Team[]
  initialEntries: MiscEntry[]
}) {
  const [entries, setEntries] = useState<MiscEntry[]>(initialEntries)
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "")
  const [points, setPoints] = useState("")
  const [description, setDescription] = useState("")
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const router = useRouter()

  async function recalculate() {
    await fetch(`/api/competitions/${competitionId}/recalculate`, { method: "POST" })
  }

  async function addEntry(e: React.FormEvent) {
    e.preventDefault()
    if (!teamId || points === "" || !description) return
    setSaving(true)
    const res = await fetch(`/api/competitions/${competitionId}/elements/${elementId}/misc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId, points: Number(points), description }),
    })
    if (res.ok) {
      const entry = await res.json()
      setEntries([...entries, entry])
      setPoints("")
      setDescription("")
      await recalculate()
      router.refresh()
    }
    setSaving(false)
  }

  async function deleteEntry(id: string) {
    setDeleting(id)
    const res = await fetch(`/api/misc-entries/${id}`, { method: "DELETE" })
    if (res.ok) {
      setEntries(entries.filter(e => e.id !== id))
      await recalculate()
      router.refresh()
    }
    setDeleting(null)
  }

  const byTeam = teams.map(t => ({
    team: t,
    entries: entries.filter(e => e.teamId === t.id),
    total: entries.filter(e => e.teamId === t.id).reduce((s, e) => s + e.points, 0),
  })).filter(t => t.entries.length > 0)

  return (
    <div className="space-y-5">
      {/* Lisa kirje vorm */}
      <form onSubmit={addEntry} className="bg-gray-50 rounded-lg p-4 space-y-3">
        <p className="text-sm font-medium text-gray-700">Lisa kirje</p>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Võistkond</label>
            <select value={teamId} onChange={e => setTeamId(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {teams.map(t => (
                <option key={t.id} value={t.id}>[{t.code}] {t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Punktid (negatiivne = karistus)</label>
            <input type="number" step="0.5" value={points} onChange={e => setPoints(e.target.value)}
              placeholder="nt -5 või 10"
              onFocus={e => e.target.select()}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Selgitus</label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)}
              placeholder="nt Lisaboonus esimese koha eest"
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        <button type="submit" disabled={saving || !teamId || points === "" || !description}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
          {saving ? "Salvestan..." : "Lisa kirje"}
        </button>
      </form>

      {/* Kirjete tabel võistkondade kaupa */}
      {byTeam.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">Ühtegi kirjet pole lisatud</p>
      ) : (
        <div className="space-y-3">
          {byTeam.map(({ team, entries: teamEntries, total }) => (
            <div key={team.id} className="border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 bg-gray-50">
                <span className="font-medium text-sm text-gray-800">
                  <span className="font-mono text-xs text-gray-400 mr-1">[{team.code}]</span>
                  {team.name}
                </span>
                <span className={`font-mono text-sm font-semibold ${total >= 0 ? "text-green-700" : "text-red-700"}`}>
                  {total >= 0 ? "+" : ""}{total.toFixed(1)} p
                </span>
              </div>
              <div className="divide-y">
                {teamEntries.map(entry => (
                  <div key={entry.id} className="flex items-center justify-between px-4 py-2 text-sm">
                    <span className="text-gray-700">{entry.description}</span>
                    <div className="flex items-center gap-3">
                      <span className={`font-mono font-medium ${entry.points >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {entry.points >= 0 ? "+" : ""}{entry.points}p
                      </span>
                      <button onClick={() => deleteEntry(entry.id)} disabled={deleting === entry.id}
                        className="text-xs text-red-400 hover:text-red-600 disabled:opacity-50">
                        {deleting === entry.id ? "..." : "Kustuta"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
