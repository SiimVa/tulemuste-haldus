import { parseTimeToSeconds, computeFields } from "@/lib/calculators"

export interface TeamBreakdown {
  teamId: string
  teamName: string
  teamCode: string
  isHorsDeCompetition: boolean
  isException: boolean
  exceptionLabel?: string | null
  rawValues: Record<string, string | number>
  rank?: number           // koht arvestuses
  totalTeams?: number
  score: number
  explanation: string     // inimloetav selgitus
  sections?: SectionBreakdown[]
  miscBonus?: number
}

export interface SectionBreakdown {
  sectionName: string
  score: number
  rank?: number
  totalTeams?: number
  explanation: string
}

interface FieldDef {
  name: string
  label: string
  type: string
  isResultField: boolean
  rankingPriority?: number | null
  formula?: string | null
  meta?: string | null
}

interface CalcMethodDef {
  type: string
  params: string
  customFormula?: string | null
}

interface SectionDef {
  id: string
  name: string
  maxValue?: number | null
  fields: FieldDef[]
  calcMethod?: CalcMethodDef | null
}

interface ElementDef {
  type: string
  maxValue?: number | null
  fields: FieldDef[]
  calcMethod?: CalcMethodDef | null
  sections?: SectionDef[]
}

interface ResultDef {
  teamId: string
  values: string
  exceptionLabel?: string | null
  exceptionPenalty?: number | null
}

interface TeamDef {
  id: string
  name: string
  code: string
  isHorsDeCompetition?: boolean
}

interface ScoreDef {
  teamId: string
  penaltyPoints: number
}

interface Config {
  scoringMode: "PENALTY" | "PLUS"
  defaultKPMaxValue: number
}

function fmt(v: number | string | undefined | null, type: string): string {
  if (v === undefined || v === null || v === "") return "—"
  if (type === "TIME" || type === "TIME_RANGE") {
    const s = typeof v === "number" ? v : parseTimeToSeconds(String(v))
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    return `${m}:${String(sec).padStart(2, "0")}`
  }
  return String(v)
}

function getResultField(fields: FieldDef[]) {
  return fields.find(f => f.isResultField || f.rankingPriority === 1)
}

function getRawValue(values: Record<string, string | number>, fields: FieldDef[]): number | null {
  const computed = computeFields(values, fields as Parameters<typeof computeFields>[1])
  const rf = getResultField(fields)
  if (!rf) return null
  const v = computed[rf.name]
  if (v === undefined || v === null) return null
  return rf.type === "TIME" ? parseTimeToSeconds(String(v)) : parseFloat(String(v))
}

function explainCalc(
  calcMethod: CalcMethodDef,
  rawValue: number | null,
  allRawValues: (number | null)[],
  score: number,
  maxValue: number,
  scoringMode: "PENALTY" | "PLUS",
  fields: FieldDef[],
  resultField: FieldDef | undefined,
  teamComputed?: Record<string, string | number>,
  overrideRank?: number
): { explanation: string; rank?: number; totalTeams?: number } {
  const params: Record<string, unknown> = (() => {
    try { return JSON.parse(calcMethod.params) } catch { return {} }
  })()
  const globalHigher = params.higherIsBetter as boolean ?? false
  // Esmase välja suund meta-st (tühistab globaalse)
  const primaryField = fields.find(f => f.isResultField || f.rankingPriority === 1)
  let higherIsBetter = globalHigher
  if (primaryField?.meta) {
    try {
      const m = JSON.parse(primaryField.meta)
      if (typeof m.higherIsBetter === "boolean") higherIsBetter = m.higherIsBetter
    } catch {}
  }
  const minPoints = (params.minPoints as number) ?? 0

  const nonNull = allRawValues.filter(v => v !== null) as number[]
  const n = nonNull.length

  switch (calcMethod.type) {
    case "RELATIVE_RANKING":
    case "FIXED_RANKING": {
      if (rawValue === null || n === 0) return { explanation: `${score}p` }
      const sortedAsc = [...nonNull].sort((a, b) => a - b)
      const computedRank = higherIsBetter
        ? n - sortedAsc.indexOf(rawValue)
        : sortedAsc.indexOf(rawValue) + 1
      // Kasuta skoori-põhist kohta (arvestab viigilahendajaid) kui antud
      const rank = overrideRank ?? computedRank
      const bestVal = higherIsBetter ? Math.max(...nonNull) : Math.min(...nonNull)
      const worstVal = higherIsBetter ? Math.min(...nonNull) : Math.max(...nonNull)
      const fieldType = resultField?.type ?? "NUMBER"
      // Viigilahendajad (rankingPriority >= 2): näita nende välju ja väärtusi
      const tiebreakers = fields
        .filter(f => (f.rankingPriority ?? 0) >= 2)
        .sort((a, b) => (a.rankingPriority ?? 0) - (b.rankingPriority ?? 0))
      const tbStr = tiebreakers.length > 0 && teamComputed
        ? ` | Viik: ${tiebreakers.map(f => `${f.label} ${fmt(teamComputed[f.name], f.type)}`).join(", ")}`
        : ""
      return {
        rank,
        totalTeams: n,
        explanation: `Koht ${rank}/${n} | ${resultField?.label ?? "Tulemus"}: ${fmt(rawValue, fieldType)} (parim: ${fmt(bestVal, fieldType)}, halvim: ${fmt(worstVal, fieldType)})${tbStr} → ${score}p`,
      }
    }

    case "VALUE_BASED": {
      if (rawValue === null || n === 0) return { explanation: `${score}p` }
      const bestVal = higherIsBetter ? Math.max(...nonNull) : Math.min(...nonNull)
      const worstVal = higherIsBetter ? Math.min(...nonNull) : Math.max(...nonNull)
      const range = Math.abs(worstVal - bestVal)
      const fieldType = resultField?.type ?? "NUMBER"
      const pct = range > 0 ? Math.round(Math.abs(rawValue - bestVal) / range * 100) : 0
      return {
        explanation: `${resultField?.label ?? "Tulemus"}: ${fmt(rawValue, fieldType)} | Vahemik: ${fmt(bestVal, fieldType)}–${fmt(worstVal, fieldType)} | Kaugus parimast: ${pct}% → ${score}p`,
      }
    }

    case "ABSOLUTE_TIME": {
      if (rawValue === null) return { explanation: `${score}p` }
      return { explanation: `Aeg: ${fmt(rawValue, "TIME")} = ${rawValue}s → ${score}p` }
    }

    case "ABSOLUTE_POINTS": {
      if (rawValue === null) return { explanation: `${score}p` }
      if (scoringMode === "PLUS") {
        return { explanation: `Tulemus: ${rawValue}p → ${score}p` }
      }
      const maxV = Math.max(...nonNull)
      return { explanation: `Tulemus: ${rawValue} | Parim: ${maxV} | Karistus: ${maxV}–${rawValue} = ${score}p` }
    }

    case "ABSOLUTE_PENALTY": {
      if (rawValue === null) return { explanation: `${score}p` }
      const formula = calcMethod.customFormula ?? "result"
      return { explanation: `Valem: ${formula} | result = ${rawValue} → ${Math.abs(score)}p` }
    }

    case "CUSTOM": {
      if (rawValue === null) return { explanation: `${score}p` }
      const formula = calcMethod.customFormula ?? "?"
      return { explanation: `Valem: ${formula} | result = ${rawValue}, n = ${n} → ${score}p` }
    }

    case "PERFORMANCE_BASED": {
      if (rawValue === null) return { explanation: `${score}p` }
      const totalEl = Math.max(1, (params.totalElements as number) ?? 1)
      const elementValue = Math.round(maxValue / totalEl * 100) / 100
      return { explanation: `Õigeid: ${rawValue}/${totalEl} | Iga õige = ${elementValue}p → ${Math.abs(score)}p` }
    }

    default:
      return { explanation: `${score}p` }
  }

  void minPoints // suppress unused warning
}

function computeSectionScores(
  calcMethod: CalcMethodDef,
  results: ResultDef[],
  fields: FieldDef[],
  maxValue: number,
  scoringMode: "PENALTY" | "PLUS"
): Map<string, number> {
  const params: Record<string, unknown> = (() => { try { return JSON.parse(calcMethod.params) } catch { return {} } })()
  const globalHigher = params.higherIsBetter as boolean ?? false
  const primaryField = fields.find(f => f.isResultField || f.rankingPriority === 1)
  let higherIsBetter = globalHigher
  if (primaryField?.meta) {
    try { const m = JSON.parse(primaryField.meta); if (typeof m.higherIsBetter === "boolean") higherIsBetter = m.higherIsBetter } catch {}
  }
  const minPoints = (params.minPoints as number) ?? 0
  const scores = new Map<string, number>()

  const normal = results
    .filter(r => !r.exceptionLabel)
    .map(r => {
      const rv: Record<string, string | number> = (() => { try { return JSON.parse(r.values || "{}") } catch { return {} } })()
      return { teamId: r.teamId, rawValue: getRawValue(rv, fields) }
    })
    .filter((e): e is { teamId: string; rawValue: number } => e.rawValue !== null)

  const rawVals = normal.map(e => e.rawValue)
  const n = normal.length
  if (n === 0) return scores

  switch (calcMethod.type) {
    case "RELATIVE_RANKING":
    case "FIXED_RANKING": {
      const sorted = higherIsBetter ? [...rawVals].sort((a, b) => b - a) : [...rawVals].sort((a, b) => a - b)
      const range = maxValue - minPoints
      for (const e of normal) {
        const rank = sorted.indexOf(e.rawValue) + 1
        const step = n > 1 ? range / (n - 1) : 0
        const pts = scoringMode === "PLUS" ? maxValue - (rank - 1) * step : minPoints + (rank - 1) * step
        scores.set(e.teamId, Math.round(pts * 1000) / 1000)
      }
      break
    }
    case "VALUE_BASED": {
      const bestVal = higherIsBetter ? Math.max(...rawVals) : Math.min(...rawVals)
      const worstVal = higherIsBetter ? Math.min(...rawVals) : Math.max(...rawVals)
      const range = Math.abs(worstVal - bestVal)
      for (const e of normal) {
        const proportion = range > 0 ? Math.abs(e.rawValue - bestVal) / range : 0
        const raw = minPoints + proportion * (maxValue - minPoints)
        const pts = scoringMode === "PLUS" ? maxValue - raw + minPoints : raw
        scores.set(e.teamId, Math.round(pts * 1000) / 1000)
      }
      break
    }
    case "PERFORMANCE_BASED": {
      const totalEl = Math.max(1, (params.totalElements as number) ?? 1)
      const ev = maxValue / totalEl
      for (const e of normal) {
        const correct = Math.max(0, Math.min(totalEl, e.rawValue))
        scores.set(e.teamId, Math.round((scoringMode === "PLUS" ? correct * ev : (totalEl - correct) * ev) * 1000) / 1000)
      }
      break
    }
    case "ABSOLUTE_POINTS": {
      const maxV = Math.max(...rawVals)
      for (const e of normal) scores.set(e.teamId, scoringMode === "PLUS" ? e.rawValue : maxV - e.rawValue)
      break
    }
    case "ABSOLUTE_TIME": {
      for (const e of normal) scores.set(e.teamId, scoringMode === "PLUS" ? -e.rawValue : e.rawValue)
      break
    }
    case "DIRECT_ENTRY": {
      for (const e of normal) scores.set(e.teamId, e.rawValue)
      break
    }
  }
  return scores
}

export function explainElementScores(
  element: ElementDef,
  results: ResultDef[],
  teams: TeamDef[],
  computedScores: ScoreDef[],
  config: Config
): TeamBreakdown[] {
  const teamMap = new Map(teams.map(t => [t.id, t]))
  const scoreMap = new Map(computedScores.map(s => [s.teamId, s.penaltyPoints]))
  const maxValue = element.maxValue ?? config.defaultKPMaxValue
  const scoringMode = config.scoringMode

  const hasSections = (element.sections?.length ?? 0) > 0

  // Kõikide tiimide raw values (tulemusvälja jaoks)
  const teamRawValues = new Map<string, Record<string, string | number>>()
  for (const r of results) {
    try { teamRawValues.set(r.teamId, JSON.parse(r.values || "{}")) } catch { teamRawValues.set(r.teamId, {}) }
  }

  const breakdowns: TeamBreakdown[] = []

  // Skoori-põhine koht (arvestab viigilahendajaid) — tavaliste elementide jaoks
  const rankByTeam = new Map<string, number>()
  if (!hasSections) {
    const ranked = results
      .filter(r => !r.exceptionLabel)
      .map(r => ({ teamId: r.teamId, score: scoreMap.get(r.teamId) ?? 0 }))
      .sort((a, b) => (scoringMode === "PLUS" ? b.score - a.score : a.score - b.score))
    let rk = 1
    for (let i = 0; i < ranked.length; i++) {
      if (i > 0 && ranked[i].score !== ranked[i - 1].score) rk = i + 1
      rankByTeam.set(ranked[i].teamId, rk)
    }
  }

  // Pre-compute per-section scores so explainCalc can show the real contribution
  const sectionScoreMaps: Map<string, number>[] = hasSections && element.sections
    ? element.sections.map(section =>
        section.calcMethod && section.fields.length > 0
          ? computeSectionScores(section.calcMethod, results.filter(r => !r.exceptionLabel), section.fields, section.maxValue ?? maxValue, scoringMode)
          : new Map<string, number>()
      )
    : []

  for (const result of results) {
    const team = teamMap.get(result.teamId)
    if (!team) continue
    const score = scoreMap.get(result.teamId) ?? 0
    const rawValues = teamRawValues.get(result.teamId) ?? {}

    if (result.exceptionLabel) {
      breakdowns.push({
        teamId: result.teamId,
        teamName: team.name,
        teamCode: team.code,
        isHorsDeCompetition: team.isHorsDeCompetition ?? false,
        isException: true,
        exceptionLabel: result.exceptionLabel,
        rawValues,
        score,
        explanation: `Erand: "${result.exceptionLabel}" → ${Math.abs(result.exceptionPenalty ?? 0)}p karistust`,
      })
      continue
    }

    if (hasSections && element.sections) {
      const sections: SectionBreakdown[] = []
      for (let si = 0; si < element.sections.length; si++) {
        const section = element.sections[si]
        if (!section.calcMethod || section.fields.length === 0) continue
        const secMaxValue = section.maxValue ?? maxValue
        const resultField = getResultField(section.fields)
        const computed = computeFields(rawValues, section.fields as Parameters<typeof computeFields>[1])
        const rawValue = getRawValue(rawValues, section.fields)

        const allSectionRaws = results
          .filter(r => !r.exceptionLabel)
          .map(r => {
            const rv: Record<string, string | number> = (() => { try { return JSON.parse(r.values || "{}") } catch { return {} } })()
            return getRawValue(rv, section.fields)
          })

        const sectionScore = sectionScoreMaps[si]?.get(result.teamId) ?? 0

        const { explanation, rank, totalTeams } = explainCalc(
          section.calcMethod,
          rawValue,
          allSectionRaws,
          sectionScore,
          secMaxValue,
          scoringMode,
          section.fields,
          resultField,
          computed
        )

        const displayVals: Record<string, string> = {}
        for (const f of section.fields) {
          if (f.type !== "COMPUTED" && rawValues[f.name] !== undefined) {
            displayVals[f.label] = fmt(computed[f.name] ?? rawValues[f.name], f.type)
          }
        }

        sections.push({
          sectionName: section.name,
          score: sectionScore,
          rank,
          totalTeams,
          explanation,
        })
      }

      const miscBonus = 0 // kuvatakse eraldi

      breakdowns.push({
        teamId: result.teamId,
        teamName: team.name,
        teamCode: team.code,
        isHorsDeCompetition: team.isHorsDeCompetition ?? false,
        isException: false,
        rawValues,
        score,
        explanation: `Kombineeritud: ${sections.length} osa → ${score}p`,
        sections,
        miscBonus,
      })
      continue
    }

    // Tavaline element
    const resultField = getResultField(element.fields)
    const computed = computeFields(rawValues, element.fields as Parameters<typeof computeFields>[1])
    const rawValue = getRawValue(rawValues, element.fields)
    const allRawValues = results
      .filter(r => !r.exceptionLabel)
      .map(r => {
        const rv: Record<string, string | number> = (() => { try { return JSON.parse(r.values || "{}") } catch { return {} } })()
        return getRawValue(rv, element.fields)
      })

    const { explanation, rank, totalTeams } = element.calcMethod
      ? explainCalc(element.calcMethod, rawValue, allRawValues, score, maxValue, scoringMode, element.fields, resultField, computed, rankByTeam.get(result.teamId))
      : { explanation: `${score}p`, rank: undefined, totalTeams: undefined }

    const displayVals: Record<string, string> = {}
    for (const f of element.fields) {
      if (f.type !== "COMPUTED" && rawValues[f.name] !== undefined) {
        displayVals[f.label] = fmt(computed[f.name] ?? rawValues[f.name], f.type)
      }
    }

    breakdowns.push({
      teamId: result.teamId,
      teamName: team.name,
      teamCode: team.code,
      isHorsDeCompetition: team.isHorsDeCompetition ?? false,
      isException: false,
      rawValues: displayVals as Record<string, string | number>,
      rank,
      totalTeams,
      score,
      explanation,
    })
  }

  // Sorteeri: PENALTY → väiksem parem; PLUS → suurem parem
  breakdowns.sort((a, b) =>
    scoringMode === "PLUS" ? b.score - a.score : a.score - b.score
  )

  return breakdowns
}
