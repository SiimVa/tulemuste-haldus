"use client"

import { useState } from "react"
import Link from "next/link"

export type AnalysisTeam = {
  id: string
  name: string
  code: string
  class: string | null
  isHorsDeCompetition: boolean
  totalScore: number
  overallRank: number | null
  totalInComp: number
  classRank: number | null
  classTotal: number
}

export type AnalysisElementField = {
  name: string
  label: string
  type: string
  isResultField: boolean
}

export type AnalysisElement = {
  id: string
  name: string
  code: string
  isCancelled: boolean
  fields: AnalysisElementField[]
}

export type TeamElementStat = {
  teamId: string
  elementId: string
  score: number | null
  rank: number | null
  classRank: number | null
  outOf: number
  classOutOf: number
  exceptionLabel: string | null
  rawValues: Record<string, unknown>
  rawResultValue: string | number | null
  miscEntries?: { description: string; points: number }[]
}

export type ElementStat = {
  elementId: string
  avgRawValue: number | null
  bestRawValue: number | null
  worstRawValue: number | null
  resultFieldType: string | null
}

interface Props {
  competitionId: string
  competitionName: string
  scoringMode: "PENALTY" | "PLUS"
  teams: AnalysisTeam[]
  elements: AnalysisElement[]
  teamElementStats: TeamElementStat[]
  elementStats: ElementStat[]
}

// Seconds → h:mm:ss
function secondsToTime(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
}

function formatRawValue(value: string | number | null, type: string | null): string {
  if (value === null || value === undefined || value === "") return "–"
  if (type === "TIME") return String(value)
  const n = parseFloat(String(value))
  return isNaN(n) ? String(value) : (Number.isInteger(n) ? String(n) : n.toFixed(2))
}

function formatAvgRaw(avg: number | null, type: string | null): string {
  if (avg === null) return "–"
  if (type === "TIME") return secondsToTime(avg)
  return avg.toFixed(2)
}

function ScoreBar({ pct, isGood }: { pct: number; isGood: boolean }) {
  const clamped = Math.max(0, Math.min(100, pct))
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${isGood ? "bg-green-500" : "bg-orange-400"}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="text-xs text-gray-400 w-7 text-right">{Math.round(clamped)}%</span>
    </div>
  )
}

type Tab = "team" | "kp"

export default function AnalysisView({
  competitionId,
  competitionName,
  scoringMode,
  teams,
  elements,
  teamElementStats,
  elementStats,
}: Props) {
  const [tab, setTab] = useState<Tab>("team")
  const [selectedTeamId, setSelectedTeamId] = useState<string>(teams[0]?.id ?? "")
  const [selectedElementId, setSelectedElementId] = useState<string>(elements[0]?.id ?? "")

  const isPlusMode = scoringMode === "PLUS"
  const selectedTeam = teams.find((t) => t.id === selectedTeamId)
  const selectedElement = elements.find((e) => e.id === selectedElementId)

  function getStat(teamId: string, elementId: string) {
    return teamElementStats.find((s) => s.teamId === teamId && s.elementId === elementId)
  }

  function getElStat(elementId: string) {
    return elementStats.find((s) => s.elementId === elementId)
  }

  // Rank 1 = 100%, rank N = 0%
  function rankToPercentile(rank: number, outOf: number) {
    if (outOf <= 1) return 100
    return Math.round(((outOf - rank) / (outOf - 1)) * 100)
  }

  // ── Team tab data ──────────────────────────────────────────────────────
  const myStats = selectedTeam
    ? elements.map((el) => {
        const stat = getStat(selectedTeamId, el.id)
        const elStat = getElStat(el.id)
        const pct = stat?.rank != null && stat.outOf > 0 ? rankToPercentile(stat.rank, stat.outOf) : null
        return { el, stat, elStat, pct }
      }).filter((x) => x.stat !== undefined)
    : []

  const ranked = [...myStats].filter((x) => x.pct !== null).sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))
  const strengths = ranked.slice(0, 3)
  const weaknesses = [...ranked].reverse().slice(0, 3)

  const avgPercentile = ranked.length > 0
    ? Math.round(ranked.reduce((s, x) => s + (x.pct ?? 0), 0) / ranked.length)
    : null

  // ── KP tab data ────────────────────────────────────────────────────────
  const kpStats = selectedElement
    ? teams.map((team) => {
        const stat = getStat(team.id, selectedElementId)
        return { team, stat }
      }).filter((x) => x.stat?.score !== null || x.stat?.exceptionLabel)
        .sort((a, b) => {
          const sa = a.stat?.score ?? null
          const sb = b.stat?.score ?? null
          if (sa === null && sb === null) return a.team.code.localeCompare(b.team.code)
          if (sa === null) return 1
          if (sb === null) return -1
          return isPlusMode ? sb - sa : sa - sb
        })
    : []

  const kpElStat = getElStat(selectedElementId)
  const inputFields = selectedElement?.fields.filter(f => f.type !== "COMPUTED") ?? []

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{competitionName}</h1>
            <p className="text-gray-500 text-sm mt-0.5">Tulemuste analüüs</p>
          </div>
          <Link href={`/public/${competitionId}/leaderboard`} className="text-xs text-blue-600 hover:underline">
            ← Pingerida
          </Link>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit mb-6">
          <button
            onClick={() => setTab("team")}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === "team" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
          >
            Võistkonna vaade
          </button>
          <button
            onClick={() => setTab("kp")}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === "kp" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
          >
            KP võrdlus
          </button>
        </div>

        {/* ── TEAM TAB ── */}
        {tab === "team" && (
          <>
            {/* Team selector */}
            <div className="bg-white border rounded-xl p-4 mb-5">
              <label className="text-xs font-medium text-gray-500 block mb-2">Vali võistkond</label>
              <select
                value={selectedTeamId}
                onChange={(e) => setSelectedTeamId(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {teams.filter(t => !t.isHorsDeCompetition).length > 0 && (
                  <optgroup label="Arvestussisesed">
                    {teams.filter(t => !t.isHorsDeCompetition).map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.code} – {t.name}{t.class ? ` (${t.class})` : ""}
                        {t.overallRank != null ? ` · #${t.overallRank}/${t.totalInComp}` : ""}
                      </option>
                    ))}
                  </optgroup>
                )}
                {teams.filter(t => t.isHorsDeCompetition).length > 0 && (
                  <optgroup label="Arvestusvälised">
                    {teams.filter(t => t.isHorsDeCompetition).map((t) => (
                      <option key={t.id} value={t.id}>{t.code} – {t.name} [AV]</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            {selectedTeam && (
              <>
                {/* Summary card */}
                <div className="bg-white border rounded-xl p-5 mb-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm text-gray-400">{selectedTeam.code}</span>
                        <h2 className="text-lg font-bold text-gray-900">{selectedTeam.name}</h2>
                        {selectedTeam.class && (
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{selectedTeam.class}</span>
                        )}
                        {selectedTeam.isHorsDeCompetition && (
                          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">AV</span>
                        )}
                      </div>
                      <p className="text-gray-500 text-sm mt-1.5">
                        {isPlusMode ? "Punktisumma" : "Karistuspunktid"}:{" "}
                        <span className="font-bold text-gray-900">{selectedTeam.totalScore.toFixed(2)}</span>
                      </p>
                      {avgPercentile !== null && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          Keskmine positsioon KP-des: <span className="font-semibold text-gray-600">{avgPercentile}%</span>
                        </p>
                      )}
                    </div>
                    <div className="flex gap-6 text-center">
                      {selectedTeam.overallRank != null && (
                        <div>
                          <p className="text-3xl font-black text-gray-900">#{selectedTeam.overallRank}</p>
                          <p className="text-xs text-gray-400">/{selectedTeam.totalInComp} üldkoht</p>
                        </div>
                      )}
                      {selectedTeam.classRank != null && selectedTeam.classTotal > 0 && (
                        <div>
                          <p className="text-3xl font-black text-blue-600">#{selectedTeam.classRank}</p>
                          <p className="text-xs text-gray-400">/{selectedTeam.classTotal} klass{selectedTeam.class ? ` ${selectedTeam.class}` : ""}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Strengths & weaknesses */}
                {(strengths.length > 0 || weaknesses.length > 0) && (
                  <div className="grid md:grid-cols-2 gap-4 mb-5">
                    <div className="bg-green-50 border border-green-100 rounded-xl p-4">
                      <h3 className="text-sm font-semibold text-green-800 mb-3">Tugevused</h3>
                      <div className="space-y-2">
                        {strengths.map(({ el, stat, pct }) => (
                          <div key={el.id} className="flex items-center justify-between">
                            <div>
                              <span className="font-mono text-xs text-green-600 mr-1.5">{el.code}</span>
                              <span className="text-sm text-green-900">{el.name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-green-700">#{stat?.rank}/{stat?.outOf}</span>
                              <div className="w-10 h-1.5 bg-green-100 rounded-full overflow-hidden">
                                <div className="h-full bg-green-500 rounded-full" style={{ width: `${pct ?? 0}%` }} />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="bg-red-50 border border-red-100 rounded-xl p-4">
                      <h3 className="text-sm font-semibold text-red-800 mb-3">Nõrkused</h3>
                      <div className="space-y-2">
                        {weaknesses.map(({ el, stat, pct }) => (
                          <div key={el.id} className="flex items-center justify-between">
                            <div>
                              <span className="font-mono text-xs text-red-500 mr-1.5">{el.code}</span>
                              <span className="text-sm text-red-900">{el.name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-red-600">#{stat?.rank}/{stat?.outOf}</span>
                              <div className="w-10 h-1.5 bg-red-100 rounded-full overflow-hidden">
                                <div className="h-full bg-red-400 rounded-full" style={{ width: `${pct ?? 0}%` }} />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Per-element table */}
                <div className="bg-white border rounded-xl overflow-hidden shadow-sm">
                  <div className="px-5 py-4 border-b">
                    <h3 className="font-semibold text-gray-900">KP kaupa</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-left border-b">
                          <th className="px-4 py-3 text-xs font-medium text-gray-500">Element</th>
                          <th className="px-4 py-3 text-xs font-medium text-gray-500 text-right">Tulemus</th>
                          <th className="px-4 py-3 text-xs font-medium text-gray-500 text-right">Karistus</th>
                          <th className="px-4 py-3 text-xs font-medium text-gray-500 text-center">Üldkoht</th>
                          <th className="px-4 py-3 text-xs font-medium text-gray-500 text-center">Klassist</th>
                          <th className="px-4 py-3 text-xs font-medium text-gray-500 text-right">Keskmine</th>
                          <th className="px-4 py-3 text-xs font-medium text-gray-500">Positsioon</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {elements.map((el) => {
                          const stat = getStat(selectedTeamId, el.id)
                          const elStat = getElStat(el.id)
                          const pct = stat?.rank != null && stat.outOf > 0 ? rankToPercentile(stat.rank, stat.outOf) : null
                          const isTop = pct !== null && pct >= 80
                          const isBottom = pct !== null && pct <= 20

                          return (
                            <tr key={el.id} className={`hover:bg-gray-50 ${isTop ? "bg-green-50/50" : isBottom ? "bg-red-50/30" : ""}`}>
                              <td className="px-4 py-3">
                                <span className="font-mono text-xs text-gray-400 mr-1.5">{el.code}</span>
                                <span className={`font-medium ${el.isCancelled ? "line-through text-gray-400" : "text-gray-900"}`}>{el.name}</span>
                                {el.isCancelled && (
                                  <span className="ml-1.5 text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded">ANN</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-xs">
                                {stat?.exceptionLabel ? (
                                  <span className="text-red-500">{stat.exceptionLabel}</span>
                                ) : stat?.miscEntries && stat.miscEntries.length > 0 ? (
                                  <div className="space-y-0.5">
                                    {stat.miscEntries.map((m, mi) => (
                                      <div key={mi} className="flex items-center justify-end gap-2">
                                        <span className="text-gray-600 font-sans">{m.description}</span>
                                        <span className={m.points >= 0 ? "text-green-600" : "text-red-600"}>{m.points >= 0 ? "+" : ""}{m.points}p</span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-gray-700">{formatRawValue(stat?.rawResultValue ?? null, el.fields.find(f => f.isResultField)?.type ?? null)}</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-xs">
                                {stat?.score != null ? (
                                  <span className="font-semibold text-gray-900">{stat.score.toFixed(2)}</span>
                                ) : <span className="text-gray-300">–</span>}
                              </td>
                              <td className="px-4 py-3 text-center">
                                {stat?.rank != null ? (
                                  <span className={`font-mono text-sm font-bold ${isTop ? "text-green-600" : isBottom ? "text-red-500" : "text-gray-700"}`}>
                                    #{stat.rank}<span className="text-gray-400 font-normal text-xs">/{stat.outOf}</span>
                                  </span>
                                ) : <span className="text-gray-300">–</span>}
                              </td>
                              <td className="px-4 py-3 text-center">
                                {stat?.classRank != null && stat.classOutOf > 0 ? (
                                  <span className="font-mono text-sm text-blue-600 font-semibold">
                                    #{stat.classRank}<span className="text-gray-400 font-normal text-xs">/{stat.classOutOf}</span>
                                  </span>
                                ) : <span className="text-gray-300">–</span>}
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-xs text-gray-500">
                                {formatAvgRaw(elStat?.avgRawValue ?? null, elStat?.resultFieldType ?? null)}
                              </td>
                              <td className="px-4 py-3">
                                {pct !== null ? (
                                  <ScoreBar pct={pct} isGood={pct >= 50} />
                                ) : <span className="text-gray-300 text-xs">–</span>}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* ── KP TAB ── */}
        {tab === "kp" && (
          <>
            {/* Element selector */}
            <div className="bg-white border rounded-xl p-4 mb-5 grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-2">Hindamiselement</label>
                <select
                  value={selectedElementId}
                  onChange={(e) => setSelectedElementId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  {elements.map((el) => (
                    <option key={el.id} value={el.id}>{el.code} – {el.name}{el.isCancelled ? " [TÜHISTATUD]" : ""}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-2">Minu võistkond</label>
                <select
                  value={selectedTeamId}
                  onChange={(e) => setSelectedTeamId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  {teams.filter(t => !t.isHorsDeCompetition).map((t) => (
                    <option key={t.id} value={t.id}>{t.code} – {t.name}</option>
                  ))}
                  {teams.filter(t => t.isHorsDeCompetition).map((t) => (
                    <option key={t.id} value={t.id}>{t.code} – {t.name} [AV]</option>
                  ))}
                </select>
              </div>
            </div>

            {selectedElement && (
              <>
                {/* Element stats bar */}
                {kpElStat && (kpElStat.avgRawValue !== null || kpElStat.bestRawValue !== null) && (
                  <div className="bg-white border rounded-xl p-4 mb-5 flex flex-wrap gap-6">
                    <div>
                      <p className="text-xs text-gray-400 mb-0.5">Parim tulemus</p>
                      <p className="font-bold text-green-600">{formatAvgRaw(kpElStat.bestRawValue, kpElStat.resultFieldType)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-0.5">Keskmine tulemus</p>
                      <p className="font-bold text-gray-700">{formatAvgRaw(kpElStat.avgRawValue, kpElStat.resultFieldType)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-0.5">Halvim tulemus</p>
                      <p className="font-bold text-orange-500">{formatAvgRaw(kpElStat.worstRawValue, kpElStat.resultFieldType)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-0.5">Tulemuste arv</p>
                      <p className="font-bold text-gray-700">{kpStats.length}</p>
                    </div>
                  </div>
                )}

                {/* KP comparison table */}
                <div className="bg-white border rounded-xl overflow-hidden shadow-sm">
                  <div className="px-5 py-4 border-b flex items-center justify-between flex-wrap gap-2">
                    <h3 className={`font-semibold ${selectedElement.isCancelled ? "line-through text-gray-400" : "text-gray-900"}`}>
                      <span className="font-mono mr-2">{selectedElement.code}</span>
                      {selectedElement.name} — kõik tulemused
                    </h3>
                    {selectedElement.isCancelled && (
                      <span className="text-xs bg-red-100 text-red-700 px-2.5 py-1 rounded-full font-medium">TÜHISTATUD — kõik tulemused 0p</span>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-left border-b">
                          <th className="px-4 py-3 text-xs font-medium text-gray-500 w-10">Koht</th>
                          <th className="px-4 py-3 text-xs font-medium text-gray-500 w-10">Klass</th>
                          <th className="px-4 py-3 text-xs font-medium text-gray-500">Võistkond</th>
                          <th className="px-4 py-3 text-xs font-medium text-gray-500">Klass</th>
                          {inputFields.map((f) => (
                            <th key={f.name} className={`px-4 py-3 text-xs font-medium ${f.isResultField ? "text-blue-600" : "text-gray-500"} text-right`}>
                              {f.label}
                              {f.isResultField && <span className="ml-1 text-blue-400">★</span>}
                            </th>
                          ))}
                          <th className="px-4 py-3 text-xs font-medium text-gray-500">Erand</th>
                          <th className="px-4 py-3 text-xs font-medium text-gray-500 text-right">Karistus</th>
                          <th className="px-4 py-3 text-xs font-medium text-gray-500">Positsioon</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {kpStats.map(({ team, stat }, idx) => {
                          const pct = stat?.rank != null && stat.outOf > 0 ? rankToPercentile(stat.rank, stat.outOf) : null
                          const isTop = pct !== null && pct >= 80
                          const isBottom = pct !== null && pct <= 20
                          const isHC = team.isHorsDeCompetition
                          const isMe = team.id === selectedTeamId

                          return (
                            <tr key={team.id} className={`${isMe ? "bg-blue-50 outline-2 outline-blue-200 -outline-offset-2" : isTop ? "bg-green-50/40 hover:bg-green-50" : isBottom ? "bg-red-50/30 hover:bg-red-50/50" : isHC ? "bg-amber-50/40 hover:bg-amber-50" : "hover:bg-gray-50"}`}>
                              <td className="px-4 py-3 font-bold text-gray-700">
                                {isHC ? <span className="text-amber-600 font-medium text-xs">AV</span> : (stat?.rank ?? idx + 1)}
                              </td>
                              <td className="px-4 py-3 text-gray-500 text-xs">
                                {stat?.classRank != null && stat.classOutOf > 0
                                  ? <span className="text-blue-600 font-semibold">#{stat.classRank}<span className="text-gray-400 font-normal">/{stat.classOutOf}</span></span>
                                  : "–"}
                              </td>
                              <td className="px-4 py-3">
                                <span className="font-mono text-xs text-gray-400 mr-1">{team.code}</span>
                                <span className={`font-medium ${isMe ? "text-blue-700" : isHC ? "text-amber-700" : "text-gray-900"}`}>{team.name}</span>
                                {isMe && <span className="ml-1.5 text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">mina</span>}
                              </td>
                              <td className="px-4 py-3">
                                {team.class && (
                                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{team.class}</span>
                                )}
                              </td>
                              {inputFields.map((f) => (
                                <td key={f.name} className={`px-4 py-3 text-right font-mono text-xs ${f.isResultField ? "font-semibold text-gray-800" : "text-gray-500"}`}>
                                  {stat?.exceptionLabel ? (
                                    <span className="text-gray-300">—</span>
                                  ) : (
                                    formatRawValue(
                                      stat?.rawValues?.[f.name] !== undefined ? (stat.rawValues[f.name] as string | number) : null,
                                      f.type
                                    )
                                  )}
                                </td>
                              ))}
                              <td className="px-4 py-3 text-xs">
                                {stat?.exceptionLabel ? (
                                  <span className="text-red-500 font-medium">{stat.exceptionLabel}</span>
                                ) : stat?.miscEntries && stat.miscEntries.length > 0 ? (
                                  <div className="space-y-0.5">
                                    {stat.miscEntries.map((m, mi) => (
                                      <div key={mi} className="flex items-center gap-2">
                                        <span className="text-gray-600">{m.description}</span>
                                        <span className={`font-mono ${m.points >= 0 ? "text-green-600" : "text-red-600"}`}>{m.points >= 0 ? "+" : ""}{m.points}p</span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-gray-300">–</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-xs">
                                {stat?.score != null ? (
                                  <span className="font-semibold text-gray-900">{stat.score.toFixed(2)}</span>
                                ) : <span className="text-gray-300">–</span>}
                              </td>
                              <td className="px-4 py-3">
                                {pct !== null ? (
                                  <ScoreBar pct={pct} isGood={pct >= 50} />
                                ) : <span className="text-gray-300 text-xs">–</span>}
                              </td>
                            </tr>
                          )
                        })}
                        {kpStats.length === 0 && (
                          <tr>
                            <td colSpan={6 + inputFields.length} className="px-4 py-8 text-center text-gray-400 text-sm">
                              Sellel elemendil pole tulemusi sisestatud
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        <p className="text-center text-xs text-gray-400 mt-6">Tulemuste haldus · Andmed uuenevad lehe värskendamisel</p>
      </div>
    </div>
  )
}
