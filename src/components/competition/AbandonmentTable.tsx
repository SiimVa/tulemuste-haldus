"use client"

import { useState } from "react"

type Member = { name: string; role: string }
type Team = { id: string; name: string; code: string; members: Member[]; dnfFromElementOrder: number | null }
type MiscEntry = {
  id: string
  teamId: string
  team: { id: string; name: string; code: string }
  points: number
  description: string
  reason: string | null
  abandonElementId: string | null
  abandonTime: string | null
}
type KpOption = { id: string; code: string; name: string }

const WHOLE_TEAM = "Kogu võistkond" // pärand: vanad kirjed, ei kasutata enam
const GENERIC = "Katkestanud liige"

// Katkestanud liikme lisaväljad: KP, põhjus, kellaaeg
function EntryFields({
  entry, elements, onSave,
}: {
  entry: MiscEntry
  elements: KpOption[]
  onSave: (data: Partial<Pick<MiscEntry, "reason" | "abandonElementId" | "abandonTime">>) => void
}) {
  const [reason, setReason] = useState(entry.reason ?? "")
  const [time, setTime] = useState(entry.abandonTime ?? "")
  const inputCls = "px-2 py-1 border rounded text-xs focus:outline-none focus:ring-1 focus:ring-rose-400 bg-white"
  return (
    <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-3 gap-2">
      <select
        value={entry.abandonElementId ?? ""}
        onChange={(e) => onSave({ abandonElementId: e.target.value })}
        className={inputCls}
      >
        <option value="">— katkestamise KP —</option>
        {elements.map((el) => (
          <option key={el.id} value={el.id}>[{el.code}] {el.name}</option>
        ))}
      </select>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        onBlur={() => { if ((entry.reason ?? "") !== reason) onSave({ reason }) }}
        placeholder="Põhjus"
        className={inputCls}
      />
      <input
        value={time}
        onChange={(e) => setTime(e.target.value)}
        onBlur={() => { if ((entry.abandonTime ?? "") !== time) onSave({ abandonTime: time }) }}
        placeholder="Kellaaeg (nt 13:45)"
        className={inputCls}
      />
    </div>
  )
}

export function AbandonmentTable({
  competitionId,
  elementId,
  elementOrder,
  scoringMode,
  mode,
  penaltyPerMember,
  teams,
  elements,
  initialEntries,
}: {
  competitionId: string
  elementId: string
  elementOrder: number
  scoringMode: "PENALTY" | "PLUS"
  mode: "FIXED" | "CUSTOM"
  penaltyPerMember: number
  teams: Team[]
  elements: KpOption[]
  initialEntries: MiscEntry[]
}) {
  const [entries, setEntries] = useState<MiscEntry[]>(initialEntries.filter((e) => e.description !== WHOLE_TEAM))
  const [dnf, setDnf] = useState<Record<string, boolean>>(
    Object.fromEntries(teams.map((t) => [t.id, t.dnfFromElementOrder != null]))
  )
  const [busy, setBusy] = useState<string | null>(null)

  // PENALTY: karistus = positiivne (lisab); PLUS: negatiivne (lahutab)
  const signed = (magnitude: number) => (scoringMode === "PLUS" ? -Math.abs(magnitude) : Math.abs(magnitude))

  // Skoori muutvate tegevuste järel: arvuta ümber ja lae leht uuesti (nii uueneb ka alumine tulemuste tabel)
  async function reloadAfterScoreChange() {
    await fetch(`/api/competitions/${competitionId}/recalculate`, { method: "POST" }).catch(() => {})
    window.location.reload()
  }

  async function addEntry(teamId: string, description: string, points: number) {
    setBusy(`${teamId}:${description}`)
    const res = await fetch(`/api/competitions/${competitionId}/elements/${elementId}/misc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId, points, description }),
    })
    if (res.ok) await reloadAfterScoreChange()
    else setBusy(null)
  }

  async function removeEntry(id: string) {
    setBusy(id)
    const res = await fetch(`/api/misc-entries/${id}`, { method: "DELETE" })
    if (res.ok) await reloadAfterScoreChange()
    else setBusy(null)
  }

  // Põhjuse/KP/kellaaja muutmine ei mõjuta skoori → ainult salvesta, ilma leht uuesti laadimata
  async function saveEntryFields(id: string, data: Partial<Pick<MiscEntry, "reason" | "abandonElementId" | "abandonTime">>) {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...data } : e)))
    await fetch(`/api/misc-entries/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).catch(() => {})
  }

  function entryForMember(teamId: string, memberName: string) {
    return entries.find((e) => e.teamId === teamId && e.description === memberName)
  }

  async function toggleMember(teamId: string, memberName: string) {
    const existing = entryForMember(teamId, memberName)
    if (existing) return removeEntry(existing.id)
    let magnitude = penaltyPerMember
    if (mode === "CUSTOM") {
      const input = prompt(`Karistus liikme "${memberName}" katkestamise eest (p):`, String(penaltyPerMember || ""))
      if (input === null) return
      magnitude = Number(input)
      if (isNaN(magnitude)) return
    }
    await addEntry(teamId, memberName, signed(magnitude))
  }

  async function addGeneric(teamId: string) {
    let magnitude = penaltyPerMember
    if (mode === "CUSTOM") {
      const input = prompt("Karistus katkestanud liikme eest (p):", String(penaltyPerMember || ""))
      if (input === null) return
      magnitude = Number(input)
      if (isNaN(magnitude)) return
    }
    await addEntry(teamId, GENERIC, signed(magnitude))
  }

  // "Kogu võistkond katkestas" = DNF-lipp (sünkroonis võistkonna vaatega), ilma oma karistuseta
  async function toggleWholeTeam(teamId: string) {
    const isDnf = dnf[teamId]
    setBusy(`dnf:${teamId}`)
    // Eemalda ka võimalik pärand-"Kogu võistkond" kirje, et topeltkaristust ei jääks
    const legacy = entries.find((e) => e.teamId === teamId && e.description === WHOLE_TEAM)
    if (legacy) await fetch(`/api/misc-entries/${legacy.id}`, { method: "DELETE" }).catch(() => {})
    const res = await fetch(`/api/competitions/${competitionId}/teams/${teamId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dnfFromElementOrder: isDnf ? null : elementOrder }),
    })
    if (res.ok) await reloadAfterScoreChange()
    else setBusy(null)
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        {mode === "FIXED"
          ? `Fikseeritud süsteem: iga katkestanud liige annab ${penaltyPerMember}p karistust.`
          : "Käsitsi süsteem: iga katkestamise korral küsitakse karistuse väärtus."}
        {" "}„Kogu võistkond katkestas" märgib võistkonna katkestanuks (DNF) — see ei lisa eraldi karistust.
      </p>
      {teams.map((team) => {
        const teamEntries = entries.filter((e) => e.teamId === team.id)
        const total = teamEntries.reduce((s, e) => s + e.points, 0)
        const isDnf = dnf[team.id]
        const competitors = team.members.filter((m) => m.role === "COMPETITOR")
        const memberNames = new Set(competitors.map((m) => m.name))
        const genericEntries = teamEntries.filter((e) => !memberNames.has(e.description))
        return (
          <div key={team.id} className="border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 bg-gray-50">
              <span className="font-medium text-sm text-gray-800">
                <span className="font-mono text-xs text-gray-400 mr-1">[{team.code}]</span>
                {team.name}
                {isDnf && <span className="ml-2 text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full font-medium">Katkestanud</span>}
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
                    isDnf ? "bg-rose-600 text-white hover:bg-rose-700" : "border text-rose-600 hover:bg-rose-50"
                  }`}
                >
                  {isDnf ? "✓ Kogu võistkond katkestas" : "Kogu võistkond katkestas"}
                </button>
              </div>
            </div>
            <div className="px-4 py-2 divide-y">
              {competitors.map((m, mi) => {
                const entry = entryForMember(team.id, m.name)
                return (
                  <div key={mi} className="py-1.5 text-sm">
                    <div className="flex items-center justify-between">
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
                    {entry && <EntryFields entry={entry} elements={elements} onSave={(d) => saveEntryFields(entry.id, d)} />}
                  </div>
                )
              })}
              {/* Nimeta katkestanud liikmed (kui nimekirja pole) */}
              {genericEntries.map((e) => (
                <div key={e.id} className="py-1.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-700">Katkestanud liige <span className="text-gray-400 text-xs">(nimeta)</span></span>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs text-red-600">{e.points >= 0 ? "+" : ""}{e.points}p</span>
                      <button onClick={() => removeEntry(e.id)} disabled={busy !== null}
                        className="text-red-400 hover:text-red-600 text-xs disabled:opacity-50">✕</button>
                    </div>
                  </div>
                  <EntryFields entry={e} elements={elements} onSave={(d) => saveEntryFields(e.id, d)} />
                </div>
              ))}
              <div className="py-1.5">
                <button onClick={() => addGeneric(team.id)} disabled={busy !== null}
                  className="text-xs text-rose-600 hover:text-rose-700 font-medium disabled:opacity-50">
                  + Lisa katkestanud liige{competitors.length === 0 ? " (nimekirja pole)" : " (nimeta)"}
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
