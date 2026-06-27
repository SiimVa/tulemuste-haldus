"use client"

import { useState } from "react"
import { formatAthletePoints, type AthletePointsMode, type RangeBucket } from "@/lib/athletePoints"
import { simulateElementScore, simParseTime, type SimField } from "@/lib/athleteSimulate"

type MiscRow = { id: string; description: string; points: number }
type InputField = { name: string; label: string; type: string }

export type ResultCard = {
  id: string
  code: string
  name: string
  type: string
  isCancelled: boolean
  maxValue: number
  revealPointsToAthletes: boolean
  // tavaline element
  exceptionLabel: string | null
  realScore: number | null
  fields: SimField[]
  inputFields: InputField[]
  values: Record<string, string>
  calcType: string | null
  customFormula: string | null
  calcParams: Record<string, unknown>
  // misc element
  misc: MiscRow[]
}

type Props = {
  cards: ResultCard[]
  scoringMode: "PENALTY" | "PLUS"
  pointsMode: AthletePointsMode
  pointsRanges: RangeBucket[]
  defaultMax: number
  allowSimulate?: boolean   // kas näidata "Simuleeri" lülitit (vaikimisi true)
  forceReveal?: boolean     // ignoreeri nähtavusseadeid (nt avalikus analüüsis on kõik niikuinii nähtav)
}

function durationDisplay(values: Record<string, string>, name: string): string {
  const st = simParseTime(values[name + "_start"] ?? "")
  const en = simParseTime(values[name + "_end"] ?? "")
  if (!values[name + "_start"] || !values[name + "_end"]) return "–"
  const dur = en >= st ? en - st : en + 86400 - st
  const h = Math.floor(dur / 3600), m = Math.floor((dur % 3600) / 60), s = dur % 60
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

export function AthleteResultCards({ cards, scoringMode, pointsMode, pointsRanges, defaultMax, allowSimulate = true, forceReveal = false }: Props) {
  const [simulateOn, setSimulateOn] = useState(false)
  const [overrides, setOverrides] = useState<Record<string, Record<string, string>>>({})
  const simulate = allowSimulate && simulateOn

  function setVal(elId: string, field: string, value: string) {
    setOverrides((prev) => ({ ...prev, [elId]: { ...(prev[elId] ?? {}), [field]: value } }))
  }
  function reset() {
    setOverrides({})
  }

  return (
    <>
      {/* Simuleeri lüliti */}
      {allowSimulate && (
        <div className="bg-white border rounded-xl px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-gray-900">Simulaator</p>
            <p className="text-xs text-gray-500">Muuda tulemusi ja vaata, kuidas punktid muutuksid</p>
          </div>
          <button
            onClick={() => setSimulateOn((v) => !v)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${simulate ? "bg-purple-600 text-white hover:bg-purple-700" : "border text-gray-600 hover:bg-gray-50"}`}
          >
            {simulate ? "Simulatsioon sees" : "Simuleeri"}
          </button>
        </div>
      )}

      {simulate && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-2.5 flex items-center justify-between gap-3">
          <p className="text-xs text-purple-800">
            <strong>SIMULATSIOON</strong> — ei ole ametlik tulemus. Värskenda lehte, et näha õigeid andmeid.
          </p>
          <button onClick={reset} className="text-xs text-purple-700 hover:text-purple-900 underline shrink-0">Lähtesta</button>
        </div>
      )}

      <div className="space-y-3">
        {cards.map((card) => {
          // Muu / Katkestamine — misc kirjed (ei simuleerita)
          if (card.type === "OTHER" || card.type === "ABANDONMENT") {
            const total = card.misc.reduce((s, e) => s + e.points, 0)
            const isAbandon = card.type === "ABANDONMENT"
            const revealMisc = (forceReveal || (pointsMode !== "HIDDEN" && card.revealPointsToAthletes)) && !card.isCancelled
            return (
              <div key={card.id} className={`bg-white border rounded-xl p-4 ${card.isCancelled ? "opacity-60" : ""}`}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="font-mono text-xs text-gray-400 mr-1">[{card.code}]</span>
                    <span className={`font-semibold ${card.isCancelled ? "line-through text-gray-400" : "text-gray-900"}`}>{card.name}</span>
                    <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${isAbandon ? "bg-rose-100 text-rose-700" : "bg-teal-100 text-teal-700"}`}>{isAbandon ? "Katkestamine" : "Muu"}</span>
                    {card.isCancelled && <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium">Tühistatud</span>}
                  </div>
                  {revealMisc && (
                    <span className={`text-sm font-mono font-semibold ${total >= 0 ? "text-green-700" : "text-red-700"}`}>
                      {total >= 0 ? "+" : ""}{total}p
                    </span>
                  )}
                </div>
                <div className="space-y-1">
                  {card.misc.map((entry) => (
                    <div key={entry.id} className="flex items-center justify-between text-sm py-1 border-t first:border-t-0">
                      <span className="text-gray-600">{entry.description}</span>
                      {revealMisc && (
                        <span className={`font-mono font-medium ${entry.points >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {entry.points >= 0 ? "+" : ""}{entry.points}p
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          }

          // Tavaline element
          const cur = { ...card.values, ...(overrides[card.id] ?? {}) }
          const revealed = (forceReveal || (pointsMode !== "HIDDEN" && card.revealPointsToAthletes)) && !card.isCancelled
          const simScore = (!card.exceptionLabel && !card.isCancelled)
            ? simulateElementScore({
                calcType: card.calcType, customFormula: card.customFormula, calcParams: card.calcParams,
                fields: card.fields, values: cur, maxValue: card.maxValue || defaultMax, scoringMode,
              })
            : null
          const canSimulate = simScore !== null && revealed
          const editing = simulate && canSimulate

          // Mittesimuleeritavuse põhjus (simulatsioonirežiimis)
          let reason: string | null = null
          if (simulate && !canSimulate) {
            if (card.isCancelled) reason = "tühistatud"
            else if (card.exceptionLabel) reason = "eriolukord"
            else if (!revealed) reason = "punktid peidetud"
            else reason = "sõltub teiste tulemustest"
          }

          const realLabel = !card.exceptionLabel && revealed && card.realScore != null
            ? formatAthletePoints(card.realScore, card.maxValue || defaultMax, pointsMode, pointsRanges, scoringMode)
            : null
          const simLabel = editing && simScore != null
            ? formatAthletePoints(simScore, card.maxValue || defaultMax, pointsMode, pointsRanges, scoringMode)
            : null

          return (
            <div key={card.id} className={`bg-white border rounded-xl p-4 ${card.isCancelled ? "opacity-60" : ""} ${editing ? "ring-2 ring-purple-200" : ""}`}>
              <div className="flex items-center justify-between mb-3 gap-2">
                <div>
                  <span className="font-mono text-xs text-gray-400 mr-1">[{card.code}]</span>
                  <span className={`font-semibold ${card.isCancelled ? "line-through text-gray-400" : "text-gray-900"}`}>{card.name}</span>
                  {card.isCancelled && <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium">Tühistatud</span>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {simLabel ? (
                    <span className="text-sm font-mono font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded" title="Simuleeritud">{simLabel}</span>
                  ) : realLabel ? (
                    <span className="text-sm font-mono font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">{realLabel}</span>
                  ) : null}
                  {card.exceptionLabel && (
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">{card.exceptionLabel}</span>
                  )}
                </div>
              </div>

              {reason && <p className="text-xs text-gray-400 mb-2">Ei saa simuleerida ({reason})</p>}

              {!card.exceptionLabel && card.inputFields.map((field) => {
                if (field.type === "TIME_RANGE") {
                  return (
                    <div key={field.name} className="py-1 border-t first:border-t-0">
                      <span className="text-sm text-gray-500">{field.label}</span>
                      {editing ? (
                        <div className="grid grid-cols-2 gap-2 mt-1">
                          <input value={cur[field.name + "_start"] ?? ""} onChange={(e) => setVal(card.id, field.name + "_start", e.target.value)}
                            placeholder="algus h:mm:ss" className="px-2 py-1.5 border rounded text-sm focus:outline-none focus:ring-1 focus:ring-purple-500" />
                          <input value={cur[field.name + "_end"] ?? ""} onChange={(e) => setVal(card.id, field.name + "_end", e.target.value)}
                            placeholder="lõpp h:mm:ss" className="px-2 py-1.5 border rounded text-sm focus:outline-none focus:ring-1 focus:ring-purple-500" />
                        </div>
                      ) : (
                        <div className="flex justify-end"><span className="font-mono font-medium text-gray-900 text-sm">{durationDisplay(cur, field.name)}</span></div>
                      )}
                    </div>
                  )
                }
                return (
                  <div key={field.name} className="flex items-center justify-between text-sm py-1 border-t first:border-t-0 gap-3">
                    <span className="text-gray-500 shrink-0">{field.label}</span>
                    {editing ? (
                      <input
                        value={cur[field.name] ?? ""}
                        onChange={(e) => setVal(card.id, field.name, e.target.value)}
                        type={field.type === "NUMBER" ? "number" : "text"}
                        placeholder={field.type === "TIME" ? "h:mm:ss" : ""}
                        className="w-32 px-2 py-1.5 border rounded text-sm text-right focus:outline-none focus:ring-1 focus:ring-purple-500"
                      />
                    ) : (
                      <span className="font-mono font-medium text-gray-900">{cur[field.name] ?? "–"}</span>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </>
  )
}
