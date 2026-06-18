"use client"

import { use, useState, useEffect } from "react"
import Link from "next/link"

type Token = { id: string; token: string; type: string; name: string; elementId?: string | null; teamId?: string | null; element?: { name: string } | null; team?: { name: string } | null; lastUsedAt?: string | null }
type Element = { id: string; name: string; code: string }
type Team = { id: string; name: string; code: string }

export default function AccessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: competitionId } = use(params)
  const [tokens, setTokens] = useState<Token[]>([])
  const [elements, setElements] = useState<Element[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ type: "JUDGE", name: "", elementId: "", teamId: "" })
  const [saving, setSaving] = useState(false)
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkMsg, setBulkMsg] = useState("")
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/competitions/${competitionId}`)
      .then(r => r.json())
      .then(data => {
        setElements(data.elements ?? [])
        setTeams(data.teams ?? [])
        setLoading(false)
      })
    fetch(`/api/competitions/${competitionId}/tokens`)
      .then(r => r.ok ? r.json() : [])
      .then(setTokens)
      .catch(() => {})
  }, [competitionId])

  async function createToken(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const res = await fetch("/api/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, competitionId }),
    })
    if (res.ok) {
      const token = await res.json()
      setTokens([token, ...tokens])
      setForm({ type: "JUDGE", name: "", elementId: "", teamId: "" })
    }
    setSaving(false)
  }

  async function createBulk() {
    setBulkLoading(true)
    setBulkMsg("")
    const res = await fetch(`/api/competitions/${competitionId}/tokens/bulk`, { method: "POST" })
    if (res.ok) {
      const data = await res.json()
      setTokens(data.tokens)
      setBulkMsg(data.created > 0 ? `Loodud ${data.created} uut linki` : "Kõik lingid olid juba olemas")
      setTimeout(() => setBulkMsg(""), 3000)
    }
    setBulkLoading(false)
  }

  function copyLink(token: string) {
    const base = typeof window !== "undefined" ? window.location.origin : ""
    const t = tokens.find(t => t.token === token)
    const path = t?.type === "JUDGE" ? `/judge/${token}` : `/athlete/${token}`
    navigator.clipboard.writeText(`${base}${path}`)
    setCopied(token)
    setTimeout(() => setCopied(null), 2000)
  }

  async function deleteToken(id: string) {
    await fetch("/api/tokens", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) })
    setTokens(tokens.filter(t => t.id !== id))
  }

  if (loading) return <div className="text-gray-400 text-sm p-4">Laadin...</div>

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 text-sm text-gray-400">
        <Link href={`/dashboard/competitions/${competitionId}`}>← Tagasi</Link>
      </div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">Juurdepääsu haldus</h1>
        <div className="flex items-center gap-3">
          {bulkMsg && <span className="text-sm text-green-600">{bulkMsg}</span>}
          {tokens.length > 0 && (
            <a href={`/api/competitions/${competitionId}/tokens/export`}
              className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors">
              Ekspordi Excel
            </a>
          )}
          <button onClick={createBulk} disabled={bulkLoading}
            className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors">
            {bulkLoading ? "Loon..." : "Loo kõik lingid"}
          </button>
        </div>
      </div>

      <p className="text-xs text-gray-400 mb-6 -mt-4">
        "Loo kõik lingid" loob automaatselt kohtuniku lingid igale elemendile ja võistleja lingid igale võistkonnale (kui need juba pole olemas).
      </p>

      {/* Uue tokeni vorm */}
      <form onSubmit={createToken} className="bg-white border rounded-xl p-5 mb-6 space-y-4">
        <h3 className="font-semibold text-gray-900">Loo üksik juurdepääsulink</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Tüüp</label>
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="JUDGE">Kohtunik</option>
              <option value="ATHLETE">Võistleja</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Nimi *</label>
            <input type="text" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder={form.type === "JUDGE" ? "Jüri Mets (KP 1)" : "Võistkond Uulukad"}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        {form.type === "JUDGE" && (
          <div>
            <label className="text-xs text-gray-500 mb-1 block">KP (jäta tühjaks = kõik KP-d)</label>
            <select value={form.elementId} onChange={e => setForm({ ...form, elementId: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">— Kõik elemendid —</option>
              {elements.map(el => <option key={el.id} value={el.id}>[{el.code}] {el.name}</option>)}
            </select>
          </div>
        )}

        {form.type === "ATHLETE" && (
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Võistkond *</label>
            <select required value={form.teamId} onChange={e => setForm({ ...form, teamId: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">— Vali võistkond —</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.code} · {t.name}</option>)}
            </select>
          </div>
        )}

        <button type="submit" disabled={saving}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
          {saving ? "Loon..." : "Loo link"}
        </button>
      </form>

      {/* Tokenite nimekiri */}
      <div className="bg-white border rounded-xl divide-y">
        {tokens.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">Ühtegi juurdepääsulinki pole loodud</div>
        ) : (() => {
          const elementOrderMap = new Map(elements.map((el, i) => [el.id, i]))
          const teamOrderMap = new Map(teams.map((t, i) => [t.id, i]))
          const sorted = [...tokens].sort((a, b) => {
            if (a.type !== b.type) return a.type === "JUDGE" ? -1 : 1
            if (a.type === "JUDGE") {
              const aO = a.elementId ? (elementOrderMap.get(a.elementId) ?? 9999) : -1
              const bO = b.elementId ? (elementOrderMap.get(b.elementId) ?? 9999) : -1
              return aO - bO
            }
            const aO = a.teamId ? (teamOrderMap.get(a.teamId) ?? 9999) : 9999
            const bO = b.teamId ? (teamOrderMap.get(b.teamId) ?? 9999) : 9999
            return aO - bO
          })
          return sorted.map(t => (
          <div key={t.id} className="px-5 py-3 flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${t.type === "JUDGE" ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"}`}>
                  {t.type === "JUDGE" ? "Kohtunik" : "Võistleja"}
                </span>
                <span className="font-medium text-gray-900 text-sm">{t.name}</span>
              </div>
              <div className="text-xs text-gray-400">
                {t.type === "JUDGE" && (t.element ? `Element: ${t.element.name}` : "Kõik elemendid")}
                {t.type === "ATHLETE" && t.team && `Võistkond: ${t.team.name}`}
                {t.lastUsedAt && ` · Viimati kasutatud: ${new Date(t.lastUsedAt).toLocaleString("et-EE")}`}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => copyLink(t.token)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${copied === t.token ? "bg-green-50 text-green-700 border-green-200" : "hover:bg-gray-50 text-blue-600 border-gray-200"}`}>
                {copied === t.token ? "✓ Kopeeritud" : "Kopeeri link"}
              </button>
              <button onClick={() => deleteToken(t.id)}
                className="text-xs text-red-400 hover:text-red-600 px-2 py-1.5">
                Kustuta
              </button>
            </div>
          </div>
          ))
        })()}
      </div>
    </div>
  )
}
