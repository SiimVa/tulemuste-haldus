"use client"

import { useEffect, useRef, useState } from "react"

export type SimEl = {
  id: string
  code: string
  name: string
  type: string
  isCancelled: boolean
  maxValue: number
  inputFields: { name: string; label: string; type: string }[]
  values: Record<string, string>
  realScore: number | null
  exceptionLabel: string | null
}

export type Standing = {
  total: number
  rank: number | null
  totalTeams: number
  classRank: number | null
  classTotal: number
  avgPercentile: number | null
}

type Props = {
  competitionId: string
  teamId: string
  teamName: string
  teamCode: string
  teamClass: string | null
  scoringMode: "PENALTY" | "PLUS"
  elements: SimEl[]
  initial: Standing
}

type SimResponse = Standing & { elementScores: Record<string, number | null> }

export function SimulatorPanel({ competitionId, teamId, teamName, teamCode, teamClass, scoringMode, elements, initial }: Props) {
  const [overrides, setOverrides] = useState<Record<string, Record<string, string>>>({})
  const [result, setResult] = useState<SimResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasOverrides = Object.keys(overrides).length > 0
  const isPlus = scoringMode === "PLUS"

  // Lähtesta valitud võistkonna vahetumisel
  useEffect(() => {
    setOverrides({})
    setResult(null)
  }, [teamId])

  // Debounce'itud dry-run
  useEffect(() => {
    if (!hasOverrides) { setResult(null); return }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/competitions/${competitionId}/simulate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teamId, overrides }),
        })
        if (res.ok) setResult(await res.json())
      } finally {
        setLoading(false)
      }
    }, 400)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [overrides, hasOverrides, competitionId, teamId])

  function setVal(elId: string, field: string, value: string) {
    setOverrides((prev) => ({ ...prev, [elId]: { ...(prev[elId] ?? {}), [field]: value } }))
  }

  const standing: Standing = result ?? initial
  const totalLabel = `${Math.round(standing.total * 100) / 100}p`

  return (
    <div className="space-y-4">
      {/* Kokkuvõtte-riba (nagu VK vaates) */}
      <div className={`rounded-xl p-5 text-white ${hasOverrides ? "bg-purple-600" : "bg-blue-600"}`}>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <span className="font-mono text-xs opacity-80 mr-1">{teamCode}</span>
            <span className="font-bold">{teamName}</span>
            {teamClass && <span className="ml-2 text-xs bg-white/20 px-2 py-0.5 rounded-full">{teamClass}</span>}
          </div>
          {hasOverrides && <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">SIMULATSIOON{loading ? " …" : ""}</span>}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <p className="text-xs opacity-80">{isPlus ? "Punktid" : "Karistuspunktid"}</p>
            <p className="text-xl font-bold font-mono">{totalLabel}</p>
          </div>
          <div>
            <p className="text-xs opacity-80">Keskmine positsioon</p>
            <p className="text-xl font-bold">{standing.avgPercentile != null ? `${standing.avgPercentile}%` : "–"}</p>
          </div>
          <div>
            <p className="text-xs opacity-80">Üldkoht</p>
            <p className="text-xl font-bold">{standing.rank != null ? <>#{standing.rank}<span className="text-sm opacity-70">/{standing.totalTeams}</span></> : "–"}</p>
          </div>
          <div>
            <p className="text-xs opacity-80">Klass</p>
            <p className="text-xl font-bold">{standing.classRank != null ? <>#{standing.classRank}<span className="text-sm opacity-70">/{standing.classTotal}</span></> : "–"}</p>
          </div>
        </div>
      </div>

      {hasOverrides && (
        <div className="flex items-center justify-between bg-purple-50 border border-purple-200 rounded-xl px-4 py-2.5">
          <p className="text-xs text-purple-800"><strong>SIMULATSIOON</strong> — ei ole ametlik tulemus.</p>
          <button onClick={() => setOverrides({})} className="text-xs text-purple-700 hover:text-purple-900 underline">Lähtesta</button>
        </div>
      )}

      {/* Elemendid (kõik muudetavad) */}
      <div className="space-y-3">
        {elements.map((el) => {
          const cur = { ...el.values, ...(overrides[el.id] ?? {}) }
          const simScore = result?.elementScores?.[el.id]
          const showScore = (overrides[el.id] !== undefined && simScore !== undefined ? simScore : el.realScore)
          const editable = !el.isCancelled && el.inputFields.length > 0
          return (
            <div key={el.id} className={`bg-white border rounded-xl p-4 ${el.isCancelled ? "opacity-60" : ""} ${overrides[el.id] ? "ring-2 ring-purple-200" : ""}`}>
              <div className="flex items-center justify-between mb-3 gap-2">
                <div>
                  <span className="font-mono text-xs text-gray-400 mr-1">[{el.code}]</span>
                  <span className={`font-semibold ${el.isCancelled ? "line-through text-gray-400" : "text-gray-900"}`}>{el.name}</span>
                  {el.isCancelled && <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium">Tühistatud</span>}
                </div>
                {showScore != null && (
                  <span className={`text-sm font-mono font-semibold px-2 py-0.5 rounded ${overrides[el.id] ? "text-purple-700 bg-purple-50" : "text-gray-700 bg-gray-50"}`}>
                    {Math.round(showScore * 100) / 100}p
                  </span>
                )}
              </div>
              {el.inputFields.length === 0 ? (
                <p className="text-xs text-gray-400">Seda elementi ei saa simuleerida (pole sisendvälju)</p>
              ) : (
                el.inputFields.map((field) => {
                  if (field.type === "TIME_RANGE") {
                    return (
                      <div key={field.name} className="py-1 border-t first:border-t-0">
                        <span className="text-sm text-gray-500">{field.label}</span>
                        <div className="grid grid-cols-2 gap-2 mt-1">
                          <input value={cur[field.name + "_start"] ?? ""} onChange={(e) => setVal(el.id, field.name + "_start", e.target.value)} disabled={!editable}
                            placeholder="algus h:mm:ss" className="px-2 py-1.5 border rounded text-sm focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:bg-gray-50" />
                          <input value={cur[field.name + "_end"] ?? ""} onChange={(e) => setVal(el.id, field.name + "_end", e.target.value)} disabled={!editable}
                            placeholder="lõpp h:mm:ss" className="px-2 py-1.5 border rounded text-sm focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:bg-gray-50" />
                        </div>
                      </div>
                    )
                  }
                  return (
                    <div key={field.name} className="flex items-center justify-between text-sm py-1 border-t first:border-t-0 gap-3">
                      <span className="text-gray-500 shrink-0">{field.label}</span>
                      <input
                        value={cur[field.name] ?? ""}
                        onChange={(e) => setVal(el.id, field.name, e.target.value)}
                        disabled={!editable}
                        type={field.type === "NUMBER" ? "number" : "text"}
                        placeholder={field.type === "TIME" ? "h:mm:ss" : ""}
                        className="w-32 px-2 py-1.5 border rounded text-sm text-right focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:bg-gray-50"
                      />
                    </div>
                  )
                })
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
