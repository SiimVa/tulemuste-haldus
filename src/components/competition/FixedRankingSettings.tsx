"use client"

import { useState } from "react"
import { Input, Select } from "@/components/ui/input"
import type { TeamCountScope } from "@/lib/classGroups"
import type { FixedRankingMode } from "@/lib/fixedRanking"

type Props = {
  scoringMode: "PENALTY" | "PLUS"
  mode: FixedRankingMode
  onModeChange: (mode: FixedRankingMode) => void
  fixedPoints: string[]
  onFixedPointsChange: (points: string[]) => void
  minPoints: number
  onMinPointsChange: (points: number) => void
  teamCountScope: TeamCountScope
  onTeamCountScopeChange: (scope: TeamCountScope) => void
  teamCountBase: number
  onTeamCountBaseChange: (points: number) => void
  teamCountStep: number
  onTeamCountStepChange: (points: number) => void
  registeredTeamCount?: number
}

const modes: { value: FixedRankingMode; label: string; desc: string }[] = [
  {
    value: "PARTIAL",
    label: "Mõned kohad + valem",
    desc: "Määra tähtsamad kohad täpselt. Ülejäänud kohad jaotatakse lineaarselt halvima koha väärtuseni.",
  },
  {
    value: "MANUAL_ALL",
    label: "Kõik kohad käsitsi",
    desc: "Igal kohal on täpne väärtus. Kohtade arvu ja punktirea saab korraga genereerida.",
  },
  {
    value: "REGISTERED_COUNT",
    label: "Registreeritud võistkondade arvust",
    desc: "Punktiskaala pikkus tekib registreeritud võistkondade arvust, valitud algpunktist ja sammust.",
  },
]

function rounded(value: number) {
  return String(Math.round(value * 1000) / 1000)
}

export function FixedRankingSettings({
  scoringMode,
  mode,
  onModeChange,
  fixedPoints,
  onFixedPointsChange,
  minPoints,
  onMinPointsChange,
  teamCountScope,
  onTeamCountScopeChange,
  teamCountBase,
  onTeamCountBaseChange,
  teamCountStep,
  onTeamCountStepChange,
  registeredTeamCount,
}: Props) {
  const [generatorFirst, setGeneratorFirst] = useState(scoringMode === "PLUS" ? 30 : 0)
  const [generatorStep, setGeneratorStep] = useState(1)

  function generatedManualPoints(count: number) {
    const safeCount = Math.min(500, Math.max(1, Math.round(count || 1)))
    const delta = scoringMode === "PLUS" ? -generatorStep : generatorStep
    return Array.from({ length: safeCount }, (_, index) =>
      rounded(Math.max(0, generatorFirst + index * delta))
    )
  }

  function resizeManualPoints(count: number) {
    const safeCount = Math.min(500, Math.max(1, Math.round(count || 1)))
    const next = fixedPoints.slice(0, safeCount)
    while (next.length < safeCount) {
      const previous = Number(next[next.length - 1] ?? generatorFirst)
      const delta = scoringMode === "PLUS" ? -generatorStep : generatorStep
      next.push(rounded(Math.max(0, previous + delta)))
    }
    onFixedPointsChange(next)
  }

  function generateManualPoints() {
    const count = Math.max(1, fixedPoints.length || registeredTeamCount || 1)
    onFixedPointsChange(generatedManualPoints(count))
  }

  const previewCount = registeredTeamCount && registeredTeamCount > 0 ? registeredTeamCount : 5
  const bestPreview = teamCountBase + (scoringMode === "PLUS" ? (previewCount - 1) * teamCountStep : 0)
  const worstPreview = teamCountBase + (scoringMode === "PENALTY" ? (previewCount - 1) * teamCountStep : 0)

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {modes.map((item) => (
          <label
            key={item.value}
            className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer ${mode === item.value ? "border-blue-500 bg-blue-50" : "hover:bg-gray-50"}`}
          >
            <input
              type="radio"
              name="fixedRankingMode"
              value={item.value}
              checked={mode === item.value}
              onChange={() => {
                onModeChange(item.value)
                if (item.value === "MANUAL_ALL" && fixedPoints.length === 0) {
                  onFixedPointsChange(generatedManualPoints(registeredTeamCount ?? 1))
                }
              }}
              className="mt-0.5 accent-blue-600"
            />
            <span>
              <span className="block text-sm font-medium text-gray-900">{item.label}</span>
              <span className="block text-xs text-gray-500 mt-0.5">{item.desc}</span>
            </span>
          </label>
        ))}
      </div>

      {mode === "REGISTERED_COUNT" ? (
        <div className="space-y-3 rounded-lg border bg-gray-50 p-4">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Keda loetakse ühte pingeritta</label>
            <Select value={teamCountScope} onChange={(event) => onTeamCountScopeChange(event.target.value as TeamCountScope)}>
              <option value="ALL">Kõik võistkonnad koos</option>
              <option value="CLASS">Iga klass eraldi</option>
              <option value="GROUP">Klassigrupid</option>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">
                {scoringMode === "PLUS" ? "Halvima koha punktid" : "Parima koha karistuspunktid"}
              </label>
              <Input type="number" min={0} step={0.5} value={teamCountBase}
                onChange={(event) => onTeamCountBaseChange(Number(event.target.value))} onFocus={(event) => event.target.select()} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Samm koha kohta</label>
              <Input type="number" min={0} step={0.5} value={teamCountStep}
                onChange={(event) => onTeamCountStepChange(Number(event.target.value))} onFocus={(event) => event.target.select()} />
            </div>
          </div>
          <p className="text-xs text-gray-500">
            {registeredTeamCount ? `${registeredTeamCount} registreeritud võistkonda` : `Näide ${previewCount} võistkonnaga`}: parim saab {rounded(bestPreview)} p ja halvim {rounded(worstPreview)} p.
            Arvestusvälised võistkonnad skaalat ei suurenda.
          </p>
        </div>
      ) : (
        <div className="space-y-3 rounded-lg border bg-gray-50 p-4">
          {mode === "MANUAL_ALL" && (
            <div className="space-y-3 border-b pb-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Kohti</label>
                  <Input type="number" min={1} max={500} step={1} value={Math.max(1, fixedPoints.length)}
                    onChange={(event) => resizeManualPoints(Number(event.target.value))} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">1. koha punktid</label>
                  <Input type="number" min={0} step={0.5} value={generatorFirst}
                    onChange={(event) => setGeneratorFirst(Number(event.target.value))} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Samm</label>
                  <Input type="number" min={0} step={0.5} value={generatorStep}
                    onChange={(event) => setGeneratorStep(Number(event.target.value))} />
                </div>
              </div>
              <button type="button" onClick={generateManualPoints} className="text-sm font-medium text-blue-600 hover:text-blue-700">
                Täida kogu punktirida
              </button>
              <p className="text-xs text-gray-400">
                {scoringMode === "PLUS" ? "Iga järgmine koht saab sammu võrra vähem." : "Iga järgmine koht saab sammu võrra rohkem karistuspunkte."}
              </p>
            </div>
          )}

          <div className="flex items-center justify-between">
            <label className="text-xs text-gray-500">Punktid kohade kaupa</label>
            {mode === "PARTIAL" && (
              <button type="button" onClick={() => onFixedPointsChange([...fixedPoints, ""])} className="text-xs text-blue-600 hover:text-blue-700">
                + Lisa koht
              </button>
            )}
          </div>
          {fixedPoints.length === 0 ? (
            <p className="text-xs text-gray-400 italic">Ühtegi kohta pole määratud.</p>
          ) : (
            <div className="grid max-h-80 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
              {fixedPoints.map((points, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-14 shrink-0">{index + 1}. koht</span>
                  <Input type="number" min={0} step={0.5} value={points}
                    onChange={(event) => {
                      const next = [...fixedPoints]
                      next[index] = event.target.value
                      onFixedPointsChange(next)
                    }} onFocus={(event) => event.target.select()} className="py-1.5" />
                  {mode === "PARTIAL" && (
                    <button type="button" onClick={() => onFixedPointsChange(fixedPoints.filter((_, itemIndex) => itemIndex !== index))}
                      aria-label={`Eemalda ${index + 1}. koht`} className="text-sm text-red-400 hover:text-red-600">✕</button>
                  )}
                </div>
              ))}
            </div>
          )}

          {mode === "PARTIAL" && (
            <div className="flex items-center gap-2 border-t pt-3">
              <label className="text-xs text-gray-500 flex-1">Halvima koha punktid</label>
              <Input type="number" min={0} step={0.5} value={minPoints}
                onChange={(event) => onMinPointsChange(Number(event.target.value))} onFocus={(event) => event.target.select()} className="w-32" />
            </div>
          )}
          <p className="text-xs text-gray-400">
            {mode === "PARTIAL"
              ? "Määramata kohad arvutatakse viimasest fikseeritud väärtusest lineaarselt halvima koha punktideni."
              : "Viigi korral saavad võistkonnad sama kõrgema koha punktid. Kui registreerunuid lisandub, kasutavad üleliigsed kohad viimast määratud väärtust."}
          </p>
        </div>
      )}
    </div>
  )
}
