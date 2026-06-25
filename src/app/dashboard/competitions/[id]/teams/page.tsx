"use client"

import { use, useState, useEffect, useRef } from "react"
import Link from "next/link"

type Team = {
  id: string
  name: string
  code: string
  class?: string | null
  isHorsDeCompetition: boolean
  dnfFromElementOrder?: number | null
  dnfReason?: string | null
  hcFromElementOrder?: number | null
  dqFromElementOrder?: number | null
  dnsFlag?: boolean
  members: { name: string; role: string }[]
}

type Element = { id: string; name: string; code: string; order: number }

export default function TeamsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: competitionId } = use(params)
  const [teams, setTeams] = useState<Team[]>([])
  const [elements, setElements] = useState<Element[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: "", code: "", class: "" })
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<{ name: string; code: string; class: string; members: string[] }>({ name: "", code: "", class: "", members: [] })
  const [editSaving, setEditSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const [dnfTeamId, setDnfTeamId] = useState<string | null>(null)
  const [dnfOrder, setDnfOrder] = useState<string>("")
  const [dnfReason, setDnfReason] = useState("")
  const [dnfSaving, setDnfSaving] = useState(false)
  const [hcTeamId, setHcTeamId] = useState<string | null>(null)
  const [hcWhole, setHcWhole] = useState(false)
  const [hcOrder, setHcOrder] = useState<string>("")
  const [hcSaving, setHcSaving] = useState(false)
  const [dqTeamId, setDqTeamId] = useState<string | null>(null)
  const [dqOrder, setDqOrder] = useState<string>("")
  const [dqSaving, setDqSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function loadTeams() {
    const r = await fetch(`/api/competitions/${competitionId}`)
    const d = await r.json()
    setTeams(d.teams ?? [])
    setElements((d.elements ?? []).map((el: Element) => ({ id: el.id, name: el.name, code: el.code, order: el.order })))
    setLoading(false)
  }

  useEffect(() => { loadTeams() }, [competitionId])

  async function addTeam(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const res = await fetch(`/api/competitions/${competitionId}/teams`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      const team = await res.json()
      setTeams([...teams, team])
      setForm({ name: "", code: "", class: "" })
      setShowForm(false)
    }
    setSaving(false)
  }

  function startEdit(team: Team) {
    setEditingId(team.id)
    setEditForm({ name: team.name, code: team.code, class: team.class ?? "", members: (team.members ?? []).map((m) => m.name) })
  }

  async function saveEdit(teamId: string) {
    setEditSaving(true)
    const res = await fetch(`/api/competitions/${competitionId}/teams/${teamId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editForm.name,
        code: editForm.code,
        class: editForm.class,
        members: editForm.members.map((name) => name.trim()).filter(Boolean),
      }),
    })
    if (res.ok) {
      const updated = await res.json()
      setTeams(teams.map((t) => (t.id === teamId ? { ...t, ...updated } : t)))
      setEditingId(null)
    }
    setEditSaving(false)
  }

  function openHc(team: Team) {
    setHcTeamId(team.id)
    setHcWhole(team.isHorsDeCompetition)
    setHcOrder(team.hcFromElementOrder != null ? String(team.hcFromElementOrder) : "")
  }

  async function saveHc() {
    if (!hcTeamId) return
    setHcSaving(true)
    const res = await fetch(`/api/competitions/${competitionId}/teams/${hcTeamId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        isHorsDeCompetition: hcWhole,
        // Kui kogu võistlus AV, siis "alates" pole vaja
        hcFromElementOrder: hcWhole ? null : (hcOrder !== "" ? Number(hcOrder) : null),
      }),
    })
    if (res.ok) {
      const updated = await res.json()
      setTeams(teams.map((t) => (t.id === hcTeamId ? { ...t, ...updated } : t)))
      setHcTeamId(null)
      await fetch(`/api/competitions/${competitionId}/recalculate`, { method: "POST" }).catch(() => {})
    }
    setHcSaving(false)
  }

  function openDq(team: Team) {
    setDqTeamId(team.id)
    setDqOrder(team.dqFromElementOrder != null ? String(team.dqFromElementOrder) : "")
  }

  async function saveDq() {
    if (!dqTeamId) return
    setDqSaving(true)
    const res = await fetch(`/api/competitions/${competitionId}/teams/${dqTeamId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dqFromElementOrder: dqOrder !== "" ? Number(dqOrder) : null }),
    })
    if (res.ok) {
      const updated = await res.json()
      setTeams(teams.map((t) => (t.id === dqTeamId ? { ...t, ...updated } : t)))
      setDqTeamId(null)
    }
    setDqSaving(false)
  }

  async function toggleDns(team: Team) {
    const res = await fetch(`/api/competitions/${competitionId}/teams/${team.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dnsFlag: !team.dnsFlag }),
    })
    if (res.ok) {
      const updated = await res.json()
      setTeams(teams.map((t) => (t.id === team.id ? { ...t, ...updated } : t)))
    }
  }

  function openDnf(team: Team) {
    setDnfTeamId(team.id)
    setDnfOrder(team.dnfFromElementOrder != null ? String(team.dnfFromElementOrder) : "")
    setDnfReason(team.dnfReason ?? "")
  }

  async function saveDnf() {
    if (!dnfTeamId) return
    setDnfSaving(true)
    const res = await fetch(`/api/competitions/${competitionId}/teams/${dnfTeamId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dnfFromElementOrder: dnfOrder !== "" ? Number(dnfOrder) : null,
        dnfReason: dnfReason || null,
      }),
    })
    if (res.ok) {
      const updated = await res.json()
      setTeams(teams.map((t) => (t.id === dnfTeamId ? { ...t, ...updated } : t)))
      setDnfTeamId(null)
    }
    setDnfSaving(false)
  }

  async function clearDnf(team: Team) {
    const res = await fetch(`/api/competitions/${competitionId}/teams/${team.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dnfFromElementOrder: null, dnfReason: null }),
    })
    if (res.ok) {
      const updated = await res.json()
      setTeams(teams.map((t) => (t.id === team.id ? { ...t, ...updated } : t)))
    }
  }

  async function deleteTeam(teamId: string) {
    if (!confirm("Kas oled kindel, et soovid võistkonna kustutada?")) return
    const res = await fetch(`/api/competitions/${competitionId}/teams/${teamId}`, { method: "DELETE" })
    if (res.ok) setTeams(teams.filter((t) => t.id !== teamId))
  }

  async function handleFileImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportMsg(null)

    const formData = new FormData()
    formData.append("file", file)

    const res = await fetch(`/api/competitions/${competitionId}/teams/import`, {
      method: "POST",
      body: formData,
    })

    if (res.ok) {
      const { added, skipped, errors } = await res.json()
      let msg = `Lisatud ${added} võistkonda${skipped > 0 ? `, vahele jäetud ${skipped} (duplikaat või puudulikud andmed)` : ""}`
      if (errors && errors.length > 0) {
        msg += `. Vead: ${(errors as string[]).join("; ")}`
      }
      setImportMsg(msg)
      await loadTeams()
    } else {
      setImportMsg("Import ebaõnnestus")
    }

    setImporting(false)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const dnfTeam = dnfTeamId ? teams.find(t => t.id === dnfTeamId) : null

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 text-sm text-gray-400">
        <Link href={`/dashboard/competitions/${competitionId}`}>← Tagasi</Link>
      </div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">Võistkonnad</h1>
        <div className="flex items-center gap-2">
          <a href={`/api/competitions/${competitionId}/teams/template`}
            className="px-3 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50">
            Laadi mall alla
          </a>
          <label className={`px-3 py-2 text-sm text-gray-600 border rounded-lg cursor-pointer hover:bg-gray-50 ${importing ? "opacity-50 pointer-events-none" : ""}`}>
            {importing ? "Impordin..." : "Impordi CSV / Excel"}
            <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
              onChange={handleFileImport} disabled={importing} />
          </label>
          <button onClick={() => setShowForm(!showForm)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
            + Lisa võistkond
          </button>
        </div>
      </div>

      {importMsg && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${importMsg.includes("ebaõnnestus") ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
          {importMsg}
          <button onClick={() => setImportMsg(null)} className="ml-3 text-xs opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {showForm && (
        <form onSubmit={addTeam} className="bg-white border rounded-xl p-5 mb-6 space-y-3">
          <h3 className="font-medium text-gray-900">Uus võistkond</h3>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Nimi *</label>
              <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Uulukad"
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Tähis *</label>
              <input type="text" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="VK 1"
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Klass</label>
              <input type="text" value={form.class} onChange={(e) => setForm({ ...form, class: e.target.value })}
                placeholder="P/S"
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {saving ? "Salvestan..." : "Lisa"}
            </button>
            <button type="button" onClick={() => setShowForm(false)}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
              Tühista
            </button>
          </div>
        </form>
      )}

      {/* DNF modal */}
      {dnfTeamId && dnfTeam && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h3 className="font-semibold text-gray-900 mb-1">Katkestamine</h3>
            <p className="text-sm text-gray-500 mb-4">Võistkond: <strong>{dnfTeam.name}</strong></p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Katkestab alates KP järjekorrast</label>
                <select value={dnfOrder} onChange={e => setDnfOrder(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— Ei ole katkestanud —</option>
                  {elements.map(el => (
                    <option key={el.id} value={String(el.order)}>
                      [{el.code}] {el.name} (järj. {el.order})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  Valitud KP-st alates ei arvestata võistkonna tulemusi.
                </p>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Põhjus (valikuline)</label>
                <input type="text" value={dnfReason} onChange={e => setDnfReason(e.target.value)}
                  placeholder="nt vigastus, loobumine"
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={saveDnf} disabled={dnfSaving}
                className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50">
                {dnfSaving ? "Salvestan..." : "Salvesta"}
              </button>
              <button onClick={() => setDnfTeamId(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
                Tühista
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Arvestusväline modal */}
      {hcTeamId && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h3 className="font-semibold text-gray-900 mb-1">Arvestusväline</h3>
            <p className="text-sm text-gray-500 mb-4">Võistkond: <strong>{teams.find(t => t.id === hcTeamId)?.name}</strong></p>
            <div className="space-y-4">
              <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-gray-50">
                <input type="checkbox" checked={hcWhole} onChange={e => setHcWhole(e.target.checked)} className="mt-0.5 accent-amber-600" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Kogu võistlus arvestusväline</p>
                  <p className="text-xs text-gray-500">Võistkonda ei arvestata üheski elemendis pingerea kohtade jaoks.</p>
                </div>
              </label>
              <div className={hcWhole ? "opacity-40 pointer-events-none" : ""}>
                <label className="text-xs text-gray-500 mb-1 block">Arvestusväline alates elemendist</label>
                <select value={hcOrder} onChange={e => setHcOrder(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500">
                  <option value="">— Ei ole (terve võistlus arvestussisene) —</option>
                  {elements.map(el => (
                    <option key={el.id} value={String(el.order)}>
                      [{el.code}] {el.name} (järj. {el.order})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  Enne valitud elementi arvestatakse tulemus sees, alates sellest elemendist arvutatakse eraldi (arvestusväline).
                </p>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={saveHc} disabled={hcSaving}
                className="bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50">
                {hcSaving ? "Salvestan..." : "Salvesta"}
              </button>
              <button onClick={() => setHcTeamId(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
                Tühista
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Diskvalifikatsioon (DQ) modal */}
      {dqTeamId && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h3 className="font-semibold text-gray-900 mb-1">Diskvalifikatsioon (DQ)</h3>
            <p className="text-sm text-gray-500 mb-4">Võistkond: <strong>{teams.find(t => t.id === dqTeamId)?.name}</strong></p>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Diskvalifitseeritud alates elemendist</label>
              <select value={dqOrder} onChange={e => setDqOrder(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                <option value="">— Ei ole diskvalifitseeritud —</option>
                {elements.map(el => (
                  <option key={el.id} value={String(el.order)}>
                    [{el.code}] {el.name} (järj. {el.order})
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">
                Ainult märge pingereas — tulemust ei muudeta. Näitab, alates millisest elemendist diskvalifitseeriti.
              </p>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={saveDq} disabled={dqSaving}
                className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50">
                {dqSaving ? "Salvestan..." : "Salvesta"}
              </button>
              <button onClick={() => setDqTeamId(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
                Tühista
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-gray-400 text-sm">Laen...</p>
      ) : teams.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-3xl mb-2">👥</p>
          <p>Ühtegi võistkonda pole lisatud</p>
        </div>
      ) : (
        <div className="bg-white border rounded-xl divide-y">
          {teams.map((team) =>
            editingId === team.id ? (
              <div key={team.id} className="px-5 py-3 bg-blue-50">
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Nimi *</label>
                    <input type="text" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className="w-full px-3 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Tähis *</label>
                    <input type="text" value={editForm.code} onChange={(e) => setEditForm({ ...editForm, code: e.target.value })}
                      className="w-full px-3 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Klass</label>
                    <input type="text" value={editForm.class} onChange={(e) => setEditForm({ ...editForm, class: e.target.value })}
                      className="w-full px-3 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-gray-500">Liikmed</label>
                    <button type="button"
                      onClick={() => setEditForm({ ...editForm, members: [...editForm.members, ""] })}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium">+ Lisa liige</button>
                  </div>
                  {editForm.members.length === 0 ? (
                    <p className="text-xs text-gray-400 py-1">Liikmeid pole. Lisa "+ Lisa liige" nupuga.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {editForm.members.map((m, mi) => (
                        <div key={mi} className="flex items-center gap-2">
                          <input type="text" value={m}
                            onChange={(e) => {
                              const upd = [...editForm.members]
                              upd[mi] = e.target.value
                              setEditForm({ ...editForm, members: upd })
                            }}
                            placeholder="Liikme nimi"
                            className="flex-1 px-3 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                          <button type="button"
                            onClick={() => setEditForm({ ...editForm, members: editForm.members.filter((_, idx) => idx !== mi) })}
                            className="text-red-400 hover:text-red-600 text-sm px-1">✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => saveEdit(team.id)} disabled={editSaving}
                    className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                    {editSaving ? "Salvestan..." : "Salvesta"}
                  </button>
                  <button onClick={() => setEditingId(null)}
                    className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
                    Tühista
                  </button>
                </div>
              </div>
            ) : (
              <div key={team.id} className={`flex items-center justify-between px-5 py-3 ${team.dnfFromElementOrder != null ? "bg-red-50" : team.isHorsDeCompetition ? "bg-amber-50" : ""}`}>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-gray-400 w-12">{team.code}</span>
                  <span className={`font-medium ${team.dnfFromElementOrder != null ? "text-red-700" : team.isHorsDeCompetition ? "text-amber-700" : "text-gray-900"}`}>
                    {team.name}
                  </span>
                  {team.class && (
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{team.class}</span>
                  )}
                  {team.dnfFromElementOrder != null && (
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                      KAT {team.dnfReason ? `· ${team.dnfReason}` : ""}
                    </span>
                  )}
                  {team.isHorsDeCompetition && team.dnfFromElementOrder == null && (
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">AV</span>
                  )}
                  {!team.isHorsDeCompetition && team.hcFromElementOrder != null && (
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                      AV alates {(() => { const el = elements.find(e => e.order === team.hcFromElementOrder); return el ? `[${el.code}]` : `järj. ${team.hcFromElementOrder}` })()}
                    </span>
                  )}
                  {team.dqFromElementOrder != null && (
                    <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                      DQ alates {(() => { const el = elements.find(e => e.order === team.dqFromElementOrder); return el ? `[${el.code}]` : `järj. ${team.dqFromElementOrder}` })()}
                    </span>
                  )}
                  {team.dnsFlag && (
                    <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full font-medium">DNS</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-400 mr-2">{team.members?.length ?? 0} liiget</span>
                  {team.dnfFromElementOrder != null ? (
                    <button onClick={() => clearDnf(team)}
                      title="Tühista katkestamine"
                      className="px-2.5 py-1 rounded text-xs font-medium bg-red-100 text-red-700 hover:bg-red-200">
                      KAT ✕
                    </button>
                  ) : (
                    <button onClick={() => openDnf(team)}
                      title="Märgi katkestanuks"
                      className="px-2.5 py-1 rounded text-xs text-gray-400 hover:bg-red-50 hover:text-red-600">
                      KAT
                    </button>
                  )}
                  <button onClick={() => openHc(team)}
                    title="Arvestusväline (kogu võistlus või alates elemendist)"
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                      team.isHorsDeCompetition || team.hcFromElementOrder != null ? "bg-amber-100 text-amber-700 hover:bg-amber-200" : "text-gray-400 hover:bg-gray-100"
                    }`}>
                    AV
                  </button>
                  <button onClick={() => openDq(team)}
                    title="Diskvalifitseeritud (märge pingereas)"
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                      team.dqFromElementOrder != null ? "bg-purple-100 text-purple-700 hover:bg-purple-200" : "text-gray-400 hover:bg-gray-100"
                    }`}>
                    DQ
                  </button>
                  <button onClick={() => toggleDns(team)}
                    title="Ei startinud (märge pingereas)"
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                      team.dnsFlag ? "bg-gray-300 text-gray-700 hover:bg-gray-400" : "text-gray-400 hover:bg-gray-100"
                    }`}>
                    DNS
                  </button>
                  <button onClick={() => startEdit(team)}
                    className="px-2.5 py-1 rounded text-xs text-gray-500 hover:bg-gray-100">
                    Muuda
                  </button>
                  <button onClick={() => deleteTeam(team.id)}
                    className="px-2.5 py-1 rounded text-xs text-red-400 hover:bg-red-50">
                    Kustuta
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}
