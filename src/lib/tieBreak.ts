import { z } from "zod"

export const tieBreakLabels = {
  BEST_PLACES: "Rohkem kõrgemaid kohti",
  BEST_WORST: "Parem halvim koht",
  PREFERRED_ELEMENT: "Eelistatud ülesanne",
  FEWER_PENALTIES: "Vähem lisakaristusi",
  MANUAL: "Muu (käsitsi)",
} as const
export type TieBreakKind = keyof typeof tieBreakLabels
const ruleSchema = z.object({
  kind: z.enum(["BEST_PLACES", "BEST_WORST", "PREFERRED_ELEMENT", "FEWER_PENALTIES", "MANUAL"]),
  enabled: z.boolean(),
  elementId: z.string().max(100).optional(),
  reason: z.string().max(500).optional(),
  teamOrder: z.array(z.string().max(100)).max(2000).optional(),
}).strict()
export const tieBreakSchema = z.object({
  enabled: z.boolean(),
  // null means all current non-cancelled checkpoints, including subsequently added ones.
  elementIds: z.array(z.string().max(100)).max(500).nullable(),
  rules: z.array(ruleSchema).max(5),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.rules.map(rule => rule.kind)).size !== value.rules.length)
    ctx.addIssue({ code: "custom", message: "Iga reeglit saab lisada üks kord." })
  if (value.elementIds && new Set(value.elementIds).size !== value.elementIds.length)
    ctx.addIssue({ code: "custom", message: "Elemendid ei tohi korduda." })
  for (const rule of value.rules) {
    if (rule.teamOrder && new Set(rule.teamOrder).size !== rule.teamOrder.length)
      ctx.addIssue({ code: "custom", message: "Võistkond ei tohi käsitsi järjekorras korduda." })
    if (!value.enabled || !rule.enabled) continue
    if (rule.kind === "PREFERRED_ELEMENT" && !rule.elementId)
      ctx.addIssue({ code: "custom", message: "Vali eelistatud ülesanne." })
    if (rule.kind === "MANUAL" && (!rule.reason?.trim() || (rule.teamOrder?.length ?? 0) < 2))
      ctx.addIssue({ code: "custom", message: "Määra käsitsi vähemalt kahe võistkonna järjekord ja avalik põhjendus." })
  }
})
export type TieBreakConfig = z.infer<typeof tieBreakSchema>
export const defaultTieBreakConfig = (): TieBreakConfig => ({
  enabled: false, elementIds: null,
  rules: (Object.keys(tieBreakLabels) as TieBreakKind[]).map(kind => ({ kind, enabled: false })),
})
export function parseTieBreakConfig(raw: string | null | undefined): TieBreakConfig {
  try {
    const config = tieBreakSchema.parse(JSON.parse(raw ?? "{}"))
    const missing = defaultTieBreakConfig().rules.filter(rule => !config.rules.some(existing => existing.kind === rule.kind))
    return { ...config, rules: [...config.rules, ...missing] }
  } catch { return defaultTieBreakConfig() }
}
export type TieBreakElement = { id: string; code: string; name: string; type: string; isCancelled: boolean }
export type TieBreakRow = {
  team: { id: string; code: string; name: string; class: string | null }
  total: number
  manualTotal: number
  byElement: Record<string, number>
}
const round = (value: number) => Math.round(value * 1000) / 1000
const compareVectors = (a: number[], b: number[]) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    if (diff) return { diff, index: i }
  }
  return { diff: 0, index: -1 }
}

/** Rank already eligible teams. Equal element points share competition ranks (1, 1, 3).
 * An incomplete criterion is skipped for the entire tied-total group, preventing
 * missing results from creating advantages or non-transitive comparisons.
 */
export function rankLeaderboard<T extends TieBreakRow>(rows: T[], elements: TieBreakElement[], scoringMode: string, config: TieBreakConfig) {
  const direction = scoringMode === "PLUS" ? -1 : 1
  const selected = elements.filter(el => !el.isCancelled && (config.elementIds === null ? el.type === "CHECKPOINT" : config.elementIds.includes(el.id)))
  const activeRules = config.enabled ? config.rules.filter(rule => rule.enabled) : []
  function scopeRank(scopeRows: T[]) {
    const places = new Map<string, Map<string, number>>()
    for (const el of selected) {
      const sorted = scopeRows.filter(row => Number.isFinite(row.byElement[el.id]))
        .sort((a, b) => direction * (round(a.byElement[el.id]) - round(b.byElement[el.id])))
      let rank = 1
      const map = new Map<string, number>()
      sorted.forEach((row, index) => {
        if (index && round(row.byElement[el.id]) !== round(sorted[index - 1].byElement[el.id])) rank = index + 1
        map.set(row.team.id, rank)
      })
      places.set(el.id, map)
    }
    const groups = new Map<number, T[]>()
    scopeRows.forEach(row => { const total = round(row.total); groups.set(total, [...(groups.get(total) ?? []), row]) })
    const ranked: { row: T; rank: number; reason: string | null }[] = []
    for (const [, group] of [...groups].sort(([a], [b]) => direction * (a - b))) {
      const criteria = activeRules.flatMap(rule => {
        const vectors = new Map<string, number[]>()
        if (rule.kind === "BEST_PLACES" || rule.kind === "BEST_WORST") {
          if (!selected.length || group.some(row => selected.some(el => !places.get(el.id)?.has(row.team.id)))) return []
          group.forEach(row => {
            const ranks = selected.map(el => places.get(el.id)!.get(row.team.id)!)
            vectors.set(row.team.id, rule.kind === "BEST_WORST"
              ? ranks.sort((a, b) => b - a)
              : Array.from({ length: scopeRows.length }, (_, i) => -ranks.filter(rank => rank === i + 1).length))
          })
        } else if (rule.kind === "PREFERRED_ELEMENT") {
          const el = elements.find(el => el.id === rule.elementId && !el.isCancelled)
          if (!el || group.some(row => !Number.isFinite(row.byElement[el.id]))) return []
          group.forEach(row => vectors.set(row.team.id, [direction * round(row.byElement[el.id])]))
        } else if (rule.kind === "FEWER_PENALTIES") {
          group.forEach(row => vectors.set(row.team.id, [round(row.manualTotal)]))
        } else {
          // Unlisted teams remain tied after all explicitly ordered teams.
          group.forEach(row => { const index = rule.teamOrder?.indexOf(row.team.id) ?? -1; vectors.set(row.team.id, [index < 0 ? (rule.teamOrder?.length ?? 0) : index]) })
        }
        return [{ rule, vectors }]
      })
      function compare(a: T, b: T) {
        for (const { rule, vectors } of criteria) {
          const av = vectors.get(a.team.id)!, bv = vectors.get(b.team.id)!
          const { diff, index } = compareVectors(av, bv)
          if (!diff) continue
          let detail = ""
          if (rule.kind === "BEST_PLACES") detail = `${index + 1}. kohti: ${-av[index]} vs ${-bv[index]}`
          if (rule.kind === "BEST_WORST") detail = `${index === 0 ? "halvim" : `${index + 1}. halvim`} koht: ${av[index]} vs ${bv[index]}`
          if (rule.kind === "PREFERRED_ELEMENT") {
            const el = elements.find(el => el.id === rule.elementId)!
            detail = `${el.code} ${el.name}: ${a.byElement[el.id]} vs ${b.byElement[el.id]}`
          }
          if (rule.kind === "FEWER_PENALTIES") detail = `${a.manualTotal} vs ${b.manualTotal}`
          if (rule.kind === "MANUAL") detail = rule.reason ?? ""
          return { diff, reason: `${tieBreakLabels[rule.kind]} — ${detail}` }
        }
        return { diff: 0, reason: "Jagatud koht: viik jäi lahendamata." }
      }
      group.sort((a, b) => compare(a, b).diff || a.team.code.localeCompare(b.team.code, "et", { numeric: true }) || a.team.id.localeCompare(b.team.id))
      const offset = ranked.length
      let rank = offset + 1
      group.forEach((row, index) => {
        if (index && compare(group[index - 1], row).diff) rank = offset + index + 1
        // Explain a decisive comparison with the nearest differently ranked tied team.
        const next = group.slice(index + 1).find(other => compare(row, other).diff !== 0)
        const previous = group.slice(0, index).reverse().find(other => compare(row, other).diff !== 0)
        const opponent = next ?? previous
        const reason = group.length < 2 ? null : opponent
          ? `${next ? "Eespool kui" : "Tagapool kui"} ${opponent.team.name}: ${compare(row, opponent).reason}`
          : "Jagatud koht: viik jäi lahendamata."
        ranked.push({ row, rank, reason })
      })
    }
    return ranked
  }
  const classRanks = new Map<string, { rank: number; reason: string | null }>()
  for (const cls of new Set(rows.map(row => row.team.class))) {
    if (!cls) continue
    for (const entry of scopeRank(rows.filter(row => row.team.class === cls))) classRanks.set(entry.row.team.id, entry)
  }
  return scopeRank(rows).map(({ row, rank, reason }) => ({
    ...row, rank, classRank: classRanks.get(row.team.id)?.rank ?? null,
    tieBreakReason: reason, classTieBreakReason: classRanks.get(row.team.id)?.reason ?? null,
  }))
}
