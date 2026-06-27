import { calculateScores, withEffectiveHC, type ScoringMode } from "./calculators"
import type { FieldDefinition, CalcMethod } from "@prisma/client"

export type ComputeTeam = {
  id: string
  isHorsDeCompetition: boolean
  hcFromElementOrder: number | null
  dnfFromElementOrder: number | null
}

export type ComputeResult = {
  elementId: string
  teamId: string
  values: string
  exceptionLabel: string | null
  exceptionPenalty: number | null
  team: ComputeTeam
}

export type ComputeElement = {
  id: string
  type: string
  order: number
  isCancelled: boolean
  maxValue: number | null
  fields: FieldDefinition[]
  calcMethod: CalcMethod | null
  sections: { calcMethod: CalcMethod | null; fields: FieldDefinition[]; maxValue: number | null }[]
  miscEntries: { teamId: string; points: number }[]
}

export type ComputeConfig = { scoringMode: ScoringMode; defaultKPMaxValue: number; defaultPKMaxValue: number }

const round3 = (n: number) => Math.round(n * 1000) / 1000

// Arvutab kõigi elementide skoorid mälus (ei kirjuta andmebaasi).
// Peegeldab recalculate route loogikat: sektsioonid, DNF, HC, misc, OTHER/ABANDONMENT.
export function computeAllScores(
  elements: ComputeElement[],
  results: ComputeResult[],
  config: ComputeConfig
): Map<string, Map<string, number>> {
  const isPlusMode = config.scoringMode === "PLUS"
  const byElement = new Map<string, Map<string, number>>()

  const resultsByElement = new Map<string, ComputeResult[]>()
  for (const r of results) {
    const a = resultsByElement.get(r.elementId) ?? []
    a.push(r)
    resultsByElement.set(r.elementId, a)
  }

  for (const element of elements) {
    const scores = new Map<string, number>()
    byElement.set(element.id, scores)
    if (element.isCancelled) continue // tühistatud → 0 panus

    if (element.type === "OTHER" || element.type === "ABANDONMENT") {
      for (const e of element.miscEntries) scores.set(e.teamId, round3((scores.get(e.teamId) ?? 0) + e.points))
      continue
    }

    const miscByTeam = new Map<string, number>()
    for (const e of element.miscEntries) miscByTeam.set(e.teamId, (miscByTeam.get(e.teamId) ?? 0) + e.points)

    const elResults = resultsByElement.get(element.id) ?? []

    if (element.sections.length > 0) {
      const activeResults = elResults.filter((r) => { const d = r.team.dnfFromElementOrder; return d == null || element.order < d })
      const exceptionResults = activeResults.filter((r) => r.exceptionLabel)
      const normalResults = activeResults.filter((r) => !r.exceptionLabel)
      const teamScores = new Map<string, number>()
      for (const r of exceptionResults) { const m = Math.abs(r.exceptionPenalty ?? 0); teamScores.set(r.teamId, isPlusMode ? -m : m) }
      for (const section of element.sections) {
        if (!section.calcMethod || section.fields.length === 0) continue
        const mockElement = { id: element.id, calcMethod: section.calcMethod, fields: section.fields, exceptions: [], maxValue: section.maxValue }
        const sectionScored = calculateScores(mockElement, withEffectiveHC(normalResults, element.order), config)
        for (const s of sectionScored) teamScores.set(s.teamId, round3((teamScores.get(s.teamId) ?? 0) + s.penaltyPoints))
      }
      const dnfResults = elResults.filter((r) => { const d = r.team.dnfFromElementOrder; return d != null && element.order >= d })
      for (const r of dnfResults) {
        const secMax = element.sections.reduce((s, sec) => s + (sec.maxValue ?? config.defaultKPMaxValue), 0)
        teamScores.set(r.teamId, isPlusMode ? 0 : secMax)
      }
      for (const [teamId, bonus] of miscByTeam) if (teamScores.has(teamId)) teamScores.set(teamId, round3((teamScores.get(teamId) ?? 0) + bonus))
      for (const [t, s] of teamScores) scores.set(t, s)
      continue
    }

    // Tavaline element
    const activeResults = elResults.filter((r) => { const d = r.team.dnfFromElementOrder; return d == null || element.order < d })
    const scored = calculateScores(
      { id: element.id, calcMethod: element.calcMethod, fields: element.fields, exceptions: [], maxValue: element.maxValue },
      withEffectiveHC(activeResults, element.order),
      config
    )
    const dnfScores = elResults
      .filter((r) => { const d = r.team.dnfFromElementOrder; return d != null && element.order >= d })
      .map((r) => ({ teamId: r.teamId, penaltyPoints: isPlusMode ? 0 : (element.maxValue ?? config.defaultKPMaxValue) }))
    for (const s of [...scored, ...dnfScores]) scores.set(s.teamId, round3(s.penaltyPoints + (miscByTeam.get(s.teamId) ?? 0)))
  }

  return byElement
}
