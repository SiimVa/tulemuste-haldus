import { computeFields } from "./calculators"
import { pointFieldLabel, readPointMeta, compareElementTimes } from "./pointFields"
import { resultExceptionKind } from "./exceptionKinds"
import type { SeriesCompetitionData, SeriesRanking, SeriesAnalysisField } from "./seriesRanking"

const average = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
const numeric = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null
export function seriesRawDirection(method: { type: string; params: string } | null, scoringMode: string): boolean {
  if (method?.type === "ABSOLUTE_POINTS" || method?.type === "PERFORMANCE_BASED") return true
  if (method?.type === "ABSOLUTE_TIME") return false
  let params: { higherIsBetter?: boolean } = {}
  try { params = JSON.parse(method?.params ?? "{}") ?? {} } catch {}
  return method?.type === "DIRECT_ENTRY" ? params.higherIsBetter ?? scoringMode === "PLUS" : Boolean(params.higherIsBetter)
}
function display(value: unknown, field: SeriesAnalysisField, raw: Record<string, unknown>): string {
  if (["POINTS_SELECT", "TIME_POINTS", "ESTIMATION"].includes(field.type)) return pointFieldLabel(field, raw[field.name])
  if (value == null || value === "") return "–"
  if (["TIME", "TIME_RANGE"].includes(field.type) && typeof value === "number") {
    const seconds = Math.round(value)
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor(seconds / 60) % 60
    return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}` : `${minutes}:${String(seconds % 60).padStart(2, "0")}`
  }
  return typeof value === "number" ? String(Math.round(value * 100) / 100) : String(value)
}

// An adapter for the same team/KP analysis component used by competitions.
// Ranks and totals come from the national calculation, including its N best rule.
export function seriesAnalysisData(data: SeriesCompetitionData[], ranking: SeriesRanking) {
  const plus = ranking.scoringMode !== "PENALTY"
  const codes = [...new Set(ranking.rows.flatMap((row) => row.kpScores.map((kp) => kp.code)))]
    .sort((a, b) => a.localeCompare(b, "et", { numeric: true }))
  const teams = ranking.rows.map((row) => ({
    ...row.team, isHorsDeCompetition: false, isDnf: false,
    totalScore: row.total, overallRank: row.rank, totalInComp: ranking.rows.length,
    classRank: row.classRank, classTotal: ranking.rows.filter((r) => r.team.class === row.team.class).length,
    selectionLabel: `${row.rank}. ${row.team.name}${row.team.class ? ` · ${row.team.class}` : ""} · ${row.competitionName}`,
    scoreSummary: `${row.competitionName} · KP ${row.kpTotal.toFixed(2)} · karistused ${row.penaltyTotal.toFixed(2)} · arvestatud ${row.kpScores.filter((kp) => kp.counted).length} KP-d`,
  }))
  const elements = codes.map((code) => {
    const element = data.flatMap((c) => c.elements).find((e) => e.type === "CHECKPOINT" && e.code === code && !e.isCancelled)
    return { id: code, code, name: element?.name ?? code, isCancelled: false, fields: element?.fields ?? [], rawHigherIsBetter: element?.rawHigherIsBetter }
  })
  const stats = ranking.rows.flatMap((row) => {
    const competition = data.find((c) => c.id === row.competitionId)!
    return row.kpScores.map((kp) => {
      const element = competition.elements.find((e) => e.id === kp.elementId)!
      const result = competition.results.find((r) => r.elementId === kp.elementId && r.teamId === row.team.id)
      const fields = element.fields ?? []
      let rawValues: Record<string, string | number> = {}
      try { const parsed = JSON.parse(result?.values ?? "{}"); if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) rawValues = parsed } catch {}
      const computed = computeFields(rawValues, fields.map((field) => ({ ...field, id: field.name, elementId: element.id, sectionId: null, validation: null })))
      const primary = fields.find((f) => f.isResultField) ?? fields.find((f) => f.rankingPriority === 1)
      const primaryValue = primary ? computed[primary.name] : kp.points
      const failed = resultExceptionKind(result?.exceptionLabel ?? null, element.exceptions) === "FAILED"
      const showValues = !result?.exceptionLabel || failed
      return {
        teamId: row.team.id, elementId: kp.code, score: kp.points, counted: kp.counted,
        exceptionLabel: result?.exceptionLabel ?? null,
        failed,
        rawValues: showValues ? rawValues : {}, computed,
        rawResultValue: showValues ? (primary ? display(primaryValue, primary, rawValues) : kp.points) : null,
        primaryNumeric: showValues ? numeric(primaryValue) : null,
        fieldDisplay: showValues ? Object.fromEntries(fields.map((field) => [field.name, display(computed[field.name], field, rawValues)])) : {},
      }
    })
  })
  const compare = (a: typeof stats[number], b: typeof stats[number]) =>
    (plus ? b.score - a.score : a.score - b.score) || compareElementTimes(elements.find((e) => e.id === a.elementId)?.fields ?? [], a.rawValues, b.rawValues)
  const teamElementStats = stats.map((stat) => {
    const peers = stats.filter((s) => s.elementId === stat.elementId)
    const cls = teams.find((t) => t.id === stat.teamId)?.class
    const classPeers = peers.filter((s) => teams.find((t) => t.id === s.teamId)?.class === cls)
    const rank = 1 + peers.filter((s) => compare(s, stat) < 0).length
    return {
      ...stat, rank,
      percentile: peers.length > 1 ? Math.round(100 * (peers.length - rank) / (peers.length - 1)) : 100,
      classRank: cls ? 1 + classPeers.filter((s) => compare(s, stat) < 0).length : null,
      outOf: peers.length, classOutOf: cls ? classPeers.length : 0,
    }
  })
  const elementStats = elements.map((element) => {
    const peers = stats.filter((s) => s.elementId === element.id && !s.exceptionLabel)
    const primary = element.fields.find((f) => f.isResultField) ?? element.fields.find((f) => f.rankingPriority === 1)
    const values = peers.map((s) => s.primaryNumeric).filter((n): n is number => n !== null)
    const higher = primary ? readPointMeta(primary.meta).higherIsBetter ?? element.rawHigherIsBetter ?? !["TIME", "TIME_RANGE"].includes(primary.type) : plus
    return {
      elementId: element.id, avgRawValue: average(values),
      bestRawValue: values.length ? (higher ? Math.max(...values) : Math.min(...values)) : null,
      worstRawValue: values.length ? (higher ? Math.min(...values) : Math.max(...values)) : null,
      resultFieldType: primary?.type ?? "NUMBER", totalCount: stats.filter((s) => s.elementId === element.id).length, performedCount: peers.length,
      fieldStats: element.fields.map((field) => {
        const values = peers.map((s) => numeric(s.computed[field.name])).filter((n): n is number => n !== null)
        const higher = readPointMeta(field.meta).higherIsBetter ?? (field.name === primary?.name ? element.rawHigherIsBetter : undefined) ?? !["TIME", "TIME_RANGE"].includes(field.type)
        return { name: field.name, label: field.label, type: field.type, avg: average(values), best: values.length ? (higher ? Math.max(...values) : Math.min(...values)) : null, worst: values.length ? (higher ? Math.min(...values) : Math.max(...values)) : null }
      }),
    }
  })
  // Raw dictionaries are used to build safe display strings above. Do not send
  // extra internal intermediate values to the browser.
  return { teams, elements, elementStats, teamElementStats: teamElementStats.map((stat) => ({ teamId: stat.teamId, elementId: stat.elementId, score: stat.score, counted: stat.counted, exceptionLabel: stat.exceptionLabel, failed: stat.failed, rawValues: stat.rawValues, rawResultValue: stat.rawResultValue, fieldDisplay: stat.fieldDisplay, rank: stat.rank, percentile: stat.percentile, classRank: stat.classRank, outOf: stat.outOf, classOutOf: stat.classOutOf })) }
}
