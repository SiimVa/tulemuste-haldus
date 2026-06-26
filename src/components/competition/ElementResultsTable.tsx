"use client"

import { useState } from "react"
import { naturalCompare } from "@/lib/utils"

type Field = { id: string; name: string; label: string; type: string; isResultField: boolean; formula?: string | null; meta?: string | null }

function secondsToTime(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
}

function formatTimeRange(values: Record<string, string>, allValues: Record<string, unknown> | undefined, fieldName: string): string {
  const dur = allValues?.[fieldName]
  if (dur === undefined || dur === null) return "–"
  const s = typeof dur === "number" ? dur : parseFloat(String(dur))
  if (isNaN(s)) return "–"
  return secondsToTime(s)
}

function formatComputedValue(f: Field, value: unknown): string {
  if (value === undefined || value === null) return "–"
  const num = typeof value === "number" ? value : parseFloat(String(value))
  try {
    if (JSON.parse(f.meta ?? "{}").displayAs === "TIME") return secondsToTime(num)
  } catch {}
  return Number.isInteger(num) ? String(num) : num.toFixed(2)
}

type Exception = { id: string; label: string; penalty: number }
type ResultRow = { id: string; teamId: string; teamName: string; teamCode: string; values: string; allValues?: Record<string, unknown>; exceptionLabel?: string | null; exceptionPenalty?: number | null; updatedAt: Date }
type Score = { teamId: string; penaltyPoints: number }
type Team = { id: string; name: string; code: string; isHorsDeCompetition?: boolean }

interface Props {
  element: {
    id: string
    name: string
    fields: Field[]
    exceptions: Exception[]
    results: ResultRow[]
    scores: Score[]
    directPointsEntry?: boolean
    scoringMode?: "PENALTY" | "PLUS"
  }
  teams: Team[]
}

export function ElementResultsTable({ element, teams }: Props) {
  const [results, setResults] = useState<ResultRow[]>(element.results)
  const [scores] = useState<Score[]>(element.scores)
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null)
  const [formValues, setFormValues] = useState<Record<string, string>>({})
  const [exceptionLabel, setExceptionLabel] = useState<string>("")
  const [saving, setSaving] = useState(false)
  const [bulkException, setBulkException] = useState("")
  const [bulkApplying, setBulkApplying] = useState(false)

  const isDirectEntry = element.directPointsEntry ?? false
  const isPlus = element.scoringMode === "PLUS"
  const resultField = element.fields.find(f => f.isResultField) ?? element.fields[0]
  const inputFields = element.fields.filter(f => f.type !== "COMPUTED")
  const computedFields = element.fields.filter(f => f.type === "COMPUTED")

  function getResult(teamId: string): ResultRow | undefined {
    return results.find(r => r.teamId === teamId)
  }

  function getScore(teamId: string): number | null {
    return scores.find(s => s.teamId === teamId)?.penaltyPoints ?? null
  }

  function parseValues(valuesJson: string): Record<string, string> {
    try { return JSON.parse(valuesJson) } catch { return {} }
  }

  async function bulkApplyException() {
    if (!bulkException) return
    const missing = teams.filter(t => !results.find(r => r.teamId === t.id))
    if (missing.length === 0) return
    setBulkApplying(true)
    try {
      for (const team of missing) {
        const res = await fetch(`/api/elements/${element.id}/results`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teamId: team.id, values: {}, exceptionLabel: bulkException }),
        })
        if (res.ok) {
          const saved = await res.json()
          setResults(prev => {
            const newRow: ResultRow = { ...saved, teamName: team.name, teamCode: team.code }
            return [...prev, newRow]
          })
        }
      }
      window.location.reload()
    } finally {
      setBulkApplying(false)
    }
  }

  function startEdit(team: Team) {
    const existing = getResult(team.id)
    if (existing) {
      setFormValues(parseValues(existing.values))
      setExceptionLabel(existing.exceptionLabel ?? "")
    } else {
      setFormValues({})
      setExceptionLabel("")
    }
    setEditingTeamId(team.id)
  }

  async function saveResult(teamId: string) {
    setSaving(true)
    try {
      const res = await fetch(`/api/elements/${element.id}/results`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          values: exceptionLabel ? {} : formValues,
          exceptionLabel: exceptionLabel || null,
        }),
      })
      if (res.ok) {
        const saved = await res.json()
        setResults(prev => {
          const idx = prev.findIndex(r => r.teamId === teamId)
          const team = teams.find(t => t.id === teamId)!
          const newRow: ResultRow = { ...saved, teamName: team.name, teamCode: team.code }
          return idx >= 0 ? prev.map((r, i) => i === idx ? newRow : r) : [...prev, newRow]
        })
        window.location.reload()
      }
    } finally {
      setSaving(false)
      setEditingTeamId(null)
    }
  }

  function sortByScore(list: Team[]) {
    return [...list].sort((a, b) => {
      const sa = getScore(a.id)
      const sb = getScore(b.id)
      if (sa === null && sb === null) return naturalCompare(a.code, b.code)
      if (sa === null) return 1
      if (sb === null) return -1
      return isPlus ? sb - sa : sa - sb
    })
  }

  const inCompTeams = sortByScore(teams.filter(t => !t.isHorsDeCompetition))
  const horsCompTeams = sortByScore(teams.filter(t => t.isHorsDeCompetition))
  const totalCols = 2 + inputFields.length + computedFields.length + 3

  function renderRow(team: Team, rank: number | null) {
    const result = getResult(team.id)
    const score = getScore(team.id)
    const values = result ? parseValues(result.values) : {}
    const isEditing = editingTeamId === team.id
    const isHC = team.isHorsDeCompetition ?? false
    const stickyBg = isEditing ? "bg-blue-50" : isHC ? "bg-amber-50" : "bg-white"

    return (
      <tr key={team.id} className={`hover:bg-gray-50 ${isEditing ? "bg-blue-50" : isHC ? "bg-amber-50/40" : ""}`}>
        <td className={`sticky left-0 z-10 ${stickyBg} w-10 px-2 py-2.5 text-gray-400 text-xs text-center`}>
          {score !== null
            ? (rank !== null ? rank : <span className="text-amber-600 font-medium text-xs">AV</span>)
            : "–"}
        </td>
        <td className={`sticky left-10 z-10 ${stickyBg} border-r px-4 py-2.5 min-w-40`}>
          <span className="font-mono text-xs text-gray-400 mr-1">{team.code}</span>
          <span className={`font-medium ${isHC ? "text-amber-700" : "text-gray-900"}`}>{team.name}</span>
          {isHC && <span className="ml-1.5 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">AV</span>}
        </td>

        {isEditing ? (
          <>
            {isDirectEntry ? (
              <td className="px-2 py-1.5" colSpan={inputFields.length + computedFields.length}>
                {exceptionLabel ? (
                  <span className="text-gray-300 text-xs">—</span>
                ) : (
                  <input
                    type="number"
                    step="0.5"
                    value={resultField ? (formValues[resultField.name] ?? "") : ""}
                    onChange={e => resultField && setFormValues({ ...formValues, [resultField.name]: e.target.value })}
                    placeholder="Kokku punktid"
                    onFocus={e => e.target.select()}
                    className="w-full px-2 py-1 border rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                )}
              </td>
            ) : (
              <>
                {inputFields.map(f => (
                  <td key={f.id} className="px-2 py-1.5">
                    {exceptionLabel ? (
                      <span className="text-gray-300 text-xs">—</span>
                    ) : f.type === "TIME_RANGE" ? (
                      <div className="space-y-1">
                        <input
                          type="text"
                          value={formValues[f.name + "_start"] ?? ""}
                          onChange={e => setFormValues({ ...formValues, [f.name + "_start"]: e.target.value })}
                          placeholder="Algus h:mm:ss"
                          className="w-full px-2 py-1 border rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <input
                          type="text"
                          value={formValues[f.name + "_end"] ?? ""}
                          onChange={e => setFormValues({ ...formValues, [f.name + "_end"]: e.target.value })}
                          placeholder="Lõpp h:mm:ss"
                          className="w-full px-2 py-1 border rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                    ) : (
                      <input
                        type={f.type === "NUMBER" ? "number" : "text"}
                        value={formValues[f.name] ?? ""}
                        onChange={e => setFormValues({ ...formValues, [f.name]: e.target.value })}
                        placeholder={f.type === "TIME" ? "0:00:00" : ""}
                        className="w-full px-2 py-1 border rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    )}
                  </td>
                ))}
                {computedFields.map(f => (
                  <td key={f.id} className="px-4 py-2.5 text-blue-600 text-xs italic">auto</td>
                ))}
              </>
            )}
            <td className="px-2 py-1.5">
              <select
                value={exceptionLabel}
                onChange={e => setExceptionLabel(e.target.value)}
                className="w-full px-2 py-1 border rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">– Sooritati –</option>
                {element.exceptions.map(ex => (
                  <option key={ex.id} value={ex.label}>{ex.label} ({ex.penalty}p)</option>
                ))}
              </select>
            </td>
            <td className="px-4 py-2.5 text-right text-gray-400 text-xs">arvutatakse</td>
            <td className="px-4 py-2.5">
              <div className="flex gap-1">
                <button onClick={() => saveResult(team.id)} disabled={saving}
                  className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50">
                  {saving ? "..." : "Salvesta"}
                </button>
                <button onClick={() => setEditingTeamId(null)}
                  className="px-2 py-1 text-gray-500 rounded text-xs hover:bg-gray-100">
                  ✕
                </button>
              </div>
            </td>
          </>
        ) : (
          <>
            {isDirectEntry ? (
              <td className="px-4 py-2.5 text-gray-600 text-xs font-mono" colSpan={inputFields.length + computedFields.length}>
                {result?.exceptionLabel ? "—" : (resultField ? (values[resultField.name] ?? <span className="text-gray-300">–</span>) : <span className="text-gray-300">–</span>)}
              </td>
            ) : (
              <>
                {inputFields.map(f => (
                  <td key={f.id} className="px-4 py-2.5 text-gray-600 text-xs font-mono">
                    {result?.exceptionLabel ? "—" : f.type === "TIME_RANGE"
                      ? formatTimeRange(values, result?.allValues, f.name)
                      : (values[f.name] ?? <span className="text-gray-300">–</span>)}
                  </td>
                ))}
                {computedFields.map(f => (
                  <td key={f.id} className="px-4 py-2.5 text-blue-600 text-xs font-mono">
                    {result?.exceptionLabel ? "—" : formatComputedValue(f, result?.allValues?.[f.name])}
                  </td>
                ))}
              </>
            )}
            <td className="px-4 py-2.5 text-xs">
              {result?.exceptionLabel ? (
                <span className="text-red-600 font-medium">{result.exceptionLabel}</span>
              ) : (
                <span className="text-gray-300">–</span>
              )}
            </td>
            <td className="px-4 py-2.5 text-right">
              {score !== null ? (
                <span className="font-mono font-semibold text-gray-900">{score.toFixed(2)}</span>
              ) : (
                <span className="text-gray-300">–</span>
              )}
            </td>
            <td className="px-4 py-2.5">
              <button onClick={() => startEdit(team)}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                {result ? "Muuda" : "Sisesta"}
              </button>
            </td>
          </>
        )}
      </tr>
    )
  }

  return (
    <div className="bg-white border rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b flex items-center justify-between">
        <h2 className="font-semibold text-gray-900">Tulemused</h2>
        <span className="text-sm text-gray-400">{results.length} / {teams.length} sisestatud</span>
      </div>
      {element.exceptions.length > 0 && teams.some(t => !results.find(r => r.teamId === t.id)) && (
        <div className="px-5 py-3 border-b bg-gray-50 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500 shrink-0">Lisa erand kõigile sisestamata:</span>
          <select
            value={bulkException}
            onChange={e => setBulkException(e.target.value)}
            className="px-2 py-1 border rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
          >
            <option value="">Vali erand…</option>
            {element.exceptions.map(ex => (
              <option key={ex.id} value={ex.label}>{ex.label} ({ex.penalty}p)</option>
            ))}
          </select>
          <button
            onClick={bulkApplyException}
            disabled={!bulkException || bulkApplying}
            className="px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700 disabled:opacity-40 transition-colors"
          >
            {bulkApplying ? "Lisan…" : `Lisa ${teams.filter(t => !results.find(r => r.teamId === t.id)).length} võistkonnale`}
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="sticky left-0 z-20 bg-gray-50 w-10 px-2 py-2.5 text-xs font-medium text-gray-500 text-center">#</th>
              <th className="sticky left-10 z-20 bg-gray-50 border-r px-4 py-2.5 text-xs font-medium text-gray-500 min-w-40">Võistkond</th>
              {isDirectEntry ? (
                <th className="px-4 py-2.5 text-xs font-medium text-gray-500" colSpan={inputFields.length + computedFields.length}>Kokku punktid</th>
              ) : (
                <>
                  {inputFields.map(f => (
                    <th key={f.id} className="px-4 py-2.5 text-xs font-medium text-gray-500">{f.label}</th>
                  ))}
                  {computedFields.map(f => (
                    <th key={f.id} className="px-4 py-2.5 text-xs font-medium text-blue-600">{f.label}</th>
                  ))}
                </>
              )}
              <th className="px-4 py-2.5 text-xs font-medium text-gray-500">Erand</th>
              <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">{isPlus ? "Tulemus" : "Karistus"}</th>
              <th className="px-4 py-2.5 text-xs font-medium text-gray-500 w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {inCompTeams.map((team, idx) => renderRow(team, getScore(team.id) !== null ? idx + 1 : null))}
            {horsCompTeams.length > 0 && (
              <>
                <tr>
                  <td colSpan={totalCols} className="px-4 py-2 bg-amber-50 text-xs font-semibold text-amber-700 tracking-wide uppercase">
                    Arvestusvälised
                  </td>
                </tr>
                {horsCompTeams.map(team => renderRow(team, null))}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
