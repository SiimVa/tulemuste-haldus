import { CalcMethod, Result, FieldDefinition } from "@prisma/client"

// Minimaalne tulemuse kuju, mida skoorimine vajab (täielik Result rahuldab seda samuti)
export type ScoreInput = {
  teamId: string
  values: string
  exceptionLabel: string | null
  exceptionPenalty: number | null
  team: { id: string; isHorsDeCompetition?: boolean }
}
import { evaluate } from "mathjs"

type CalcType = "RELATIVE_RANKING" | "ABSOLUTE_TIME" | "ABSOLUTE_POINTS" | "CUSTOM" | "ABSOLUTE_PENALTY" | "FIXED_RANKING" | "VALUE_BASED" | "PERFORMANCE_BASED" | "DIRECT_ENTRY"
export type ScoringMode = "PENALTY" | "PLUS"

export type FieldValues = Record<string, string | number>

export interface ScoredEntry {
  teamId: string
  rawValue: number | null
  allValues: FieldValues   // kõik arvutatud välja väärtused (tiebreakerite jaoks)
  exceptionPenalty: number | null
  // PENALTY: positiivne arv (väiksem = parem)
  // PLUS: positiivne = teenitud punktid, negatiivne = erandi karistus
  penaltyPoints: number
  isHorsDeCompetition?: boolean
}

interface ElementWithConfig {
  id: string
  calcMethod: CalcMethod | null
  fields: FieldDefinition[]
  exceptions: { label: string; penalty: number }[]
  maxValue?: number | null
}

interface CompetitionConfig {
  scoringMode: ScoringMode
  defaultKPMaxValue: number
  defaultPKMaxValue: number
}

// ─── Arvestusväline alates elemendist X ──────────────────────────────────────
// Tagastab tulemused, kus iga tiimi isHorsDeCompetition on efektiivne selle
// elemendi kohta: kui tiim on kogu võistluse arvestusväline VÕI tema
// hcFromElementOrder on määratud ja elemendi järjekord >= sellest.
export function withEffectiveHC<T extends { team: { isHorsDeCompetition?: boolean; hcFromElementOrder?: number | null } }>(
  results: T[],
  elementOrder: number | null | undefined
): T[] {
  return results.map((r) => ({
    ...r,
    team: {
      ...r.team,
      isHorsDeCompetition:
        (r.team.isHorsDeCompetition ?? false) ||
        (r.team.hcFromElementOrder != null && elementOrder != null && elementOrder >= r.team.hcFromElementOrder),
    },
  }))
}

// ─── Aeg → sekundid (formaat h:mm:ss või mm:ss) ──────────────────────────────
export function parseTimeToSeconds(value: string | number): number {
  if (typeof value === "number") return value
  const str = String(value).trim()
  const parts = str.split(":")
  if (parts.length === 3) {
    return (parseInt(parts[0]) || 0) * 3600 + (parseInt(parts[1]) || 0) * 60 + (parseInt(parts[2]) || 0)
  }
  if (parts.length === 2) {
    return (parseInt(parts[0]) || 0) * 60 + (parseInt(parts[1]) || 0)
  }
  return parseFloat(str) || 0
}

// ─── Vahearvutused ────────────────────────────────────────────────────────────
export function computeFields(
  values: FieldValues,
  fields: FieldDefinition[]
): FieldValues {
  const result = { ...values }

  // Konverteeri kõik sisendväljad õigesse tüüpi (stringid → arvud), et mathjs saaks arvutada
  for (const field of fields) {
    if (field.type === "COMPUTED") continue
    if (result[field.name] === undefined) continue
    if (field.type === "TIME") {
      result[field.name] = parseTimeToSeconds(String(result[field.name]))
    } else if (field.type === "NUMBER" || field.type === "CHECKBOX") {
      const n = parseFloat(String(result[field.name]))
      result[field.name] = isNaN(n) ? 0 : n
    }
  }

  // TIME_RANGE: arvuta kestvus = lõpp − algus (sekundites)
  for (const field of fields) {
    if (field.type !== "TIME_RANGE") continue
    const start = parseTimeToSeconds(String(result[field.name + "_start"] ?? "0"))
    const end = parseTimeToSeconds(String(result[field.name + "_end"] ?? "0"))
    const dur = end >= start ? end - start : end + 86400 - start
    result[field.name] = dur
  }

  const computed = fields
    .filter((f) => f.type === "COMPUTED" && f.formula)
    .sort((a, b) => a.order - b.order)

  for (const field of computed) {
    try {
      // Kasutame sama New Function lähenemist nagu FormulaInput eelvaade, et tagada ühtsus
      const scope: Record<string, number> = {}
      for (const [k, v] of Object.entries(result)) {
        const n = typeof v === "number" ? v : parseFloat(String(v))
        if (!isNaN(n)) scope[k] = n
      }
      const argNames = Object.keys(scope)
      const argValues = Object.values(scope)
      // eslint-disable-next-line no-new-func
      const fn = new Function(...argNames, "min", "max", "floor", "round", "abs", `return (${field.formula!})`)
      const val = fn(...argValues, Math.min, Math.max, Math.floor, Math.round, Math.abs)
      result[field.name] = typeof val === "number" && isFinite(val) ? val : 0
    } catch {
      result[field.name] = 0
    }
  }
  return result
}

// ─── Peamine arvutusfunktsioon ────────────────────────────────────────────────
export function calculateScores(
  element: ElementWithConfig,
  results: ScoreInput[],
  competition: CompetitionConfig = { scoringMode: "PENALTY", defaultKPMaxValue: 30, defaultPKMaxValue: 30 }
): ScoredEntry[] {
  const { scoringMode } = competition
  const fields = element.fields
  const resultField = fields.find((f) => f.isResultField)
    ?? fields.find((f) => f.rankingPriority === 1 && f.type !== "COMPUTED")
  const calcMethod = element.calcMethod

  // Elemendi maksimaalne väärtus: elemendi oma või võistluse vaikeväärtus
  const maxValue = element.maxValue ?? competition.defaultKPMaxValue

  const entries: ScoredEntry[] = results.map((r) => {
    const isHC = r.team.isHorsDeCompetition ?? false
    if (r.exceptionLabel !== null && r.exceptionPenalty !== null) {
      const magnitude = Math.abs(r.exceptionPenalty)
      const stored = scoringMode === "PLUS" ? -magnitude : magnitude
      return {
        teamId: r.teamId,
        rawValue: null,
        allValues: {},
        exceptionPenalty: magnitude,
        penaltyPoints: stored,
        isHorsDeCompetition: isHC,
      }
    }

    let rawValues: FieldValues = {}
    try { rawValues = JSON.parse(r.values || "{}") } catch {}

    // Kui ühtegi väärtust pole sisestatud (kõik lahtrid tühjad) → ei loeta sisestatuks
    const hasAnyValue = Object.values(rawValues).some((v) => String(v ?? "").trim() !== "")
    if (!hasAnyValue) {
      return { teamId: r.teamId, rawValue: null, allValues: {}, exceptionPenalty: null, penaltyPoints: 0, isHorsDeCompetition: isHC }
    }

    const computed = computeFields(rawValues, fields)
    const rawValue = resultField
      ? (resultField.type === "TIME"
          ? parseTimeToSeconds(String(computed[resultField.name] ?? "0"))
          : parseFloat(String(computed[resultField.name] ?? 0)))
      : 0

    return { teamId: r.teamId, rawValue, allValues: computed, exceptionPenalty: null, penaltyPoints: 0, isHorsDeCompetition: isHC }
  })

  if (!calcMethod) return entries

  const normal = entries.filter((e) => e.rawValue !== null)
  const exceptions = entries.filter((e) => e.exceptionPenalty !== null)

  if (normal.length === 0) return entries

  switch (calcMethod.type as CalcType) {
    case "RELATIVE_RANKING": {
      const inComp = normal.filter((e) => !e.isHorsDeCompetition)
      const horsComp = normal.filter((e) => e.isHorsDeCompetition)
      if (horsComp.length > 0) {
        if (inComp.length > 0) applyRelativeRanking(inComp, calcMethod.params, maxValue, scoringMode, fields)
        const allCopy = normal.map((e) => ({ ...e }))
        applyRelativeRanking(allCopy, calcMethod.params, maxValue, scoringMode, fields)
        for (const hc of horsComp) {
          const scored = allCopy.find((e) => e.teamId === hc.teamId)
          if (scored) hc.penaltyPoints = scored.penaltyPoints
        }
      } else {
        applyRelativeRanking(normal, calcMethod.params, maxValue, scoringMode, fields)
      }
      break
    }
    case "ABSOLUTE_TIME":
      applyAbsoluteTime(normal, scoringMode)
      break
    case "ABSOLUTE_POINTS":
      applyAbsolutePoints(normal, maxValue, scoringMode)
      break
    case "CUSTOM":
      applyCustom(normal, calcMethod.customFormula || "0", fields)
      break
    case "ABSOLUTE_PENALTY":
      applyAbsolutePenalty(normal, calcMethod.customFormula || "result", scoringMode)
      break
    case "FIXED_RANKING": {
      const inComp = normal.filter((e) => !e.isHorsDeCompetition)
      const horsComp = normal.filter((e) => e.isHorsDeCompetition)
      if (horsComp.length > 0) {
        if (inComp.length > 0) applyFixedRanking(inComp, calcMethod.params, maxValue, scoringMode, fields)
        const allCopy = normal.map((e) => ({ ...e }))
        applyFixedRanking(allCopy, calcMethod.params, maxValue, scoringMode, fields)
        for (const hc of horsComp) {
          const scored = allCopy.find((e) => e.teamId === hc.teamId)
          if (scored) hc.penaltyPoints = scored.penaltyPoints
        }
      } else {
        applyFixedRanking(normal, calcMethod.params, maxValue, scoringMode, fields)
      }
      break
    }
    case "VALUE_BASED": {
      const inComp = normal.filter((e) => !e.isHorsDeCompetition)
      const horsComp = normal.filter((e) => e.isHorsDeCompetition)
      if (horsComp.length > 0) {
        if (inComp.length > 0) applyValueBased(inComp, calcMethod.params, maxValue, scoringMode, fields)
        const allCopy = normal.map((e) => ({ ...e }))
        applyValueBased(allCopy, calcMethod.params, maxValue, scoringMode, fields)
        for (const hc of horsComp) {
          const scored = allCopy.find((e) => e.teamId === hc.teamId)
          if (scored) hc.penaltyPoints = scored.penaltyPoints
        }
      } else {
        applyValueBased(normal, calcMethod.params, maxValue, scoringMode, fields)
      }
      break
    }
    case "PERFORMANCE_BASED":
      applyPerformanceBased(normal, calcMethod.params, maxValue, scoringMode)
      break
    case "DIRECT_ENTRY":
      for (const entry of normal) {
        entry.penaltyPoints = entry.rawValue ?? 0
      }
      break
  }

  return [...normal, ...exceptions]
}

// ─── Viigi lahendaja sort ─────────────────────────────────────────────────────
// Sorteerib entries: esimesena rankingPriority=1 väli, siis 2, 3 jne.
// Tagastab ka rankMap-i (tiimId → rank, kus viigis olevad tiimid saavad sama rangi).
function sortByRankingFields(
  entries: ScoredEntry[],
  fields: FieldDefinition[],
  defaultHigherIsBetter: boolean
): { sorted: ScoredEntry[]; rankMap: Map<string, number> } {
  const rankFields = fields
    .filter((f) => f.rankingPriority != null)
    .sort((a, b) => (a.rankingPriority ?? 0) - (b.rankingPriority ?? 0))

  function getFieldDir(field: FieldDefinition): boolean {
    if (field.meta) {
      try {
        const m = JSON.parse(field.meta)
        if (typeof m.higherIsBetter === "boolean") return m.higherIsBetter
      } catch {}
    }
    return defaultHigherIsBetter
  }

  function getVal(entry: ScoredEntry, field: FieldDefinition): number {
    const v = entry.allValues[field.name]
    if (v === undefined || v === null || v === "") return 0
    return typeof v === "number" ? v : parseFloat(String(v)) || 0
  }

  function compareEntries(a: ScoredEntry, b: ScoredEntry): number {
    if (rankFields.length === 0) {
      // Fallback: kui ühtegi rankingPriority välja pole, kasuta rawValue
      return defaultHigherIsBetter ? (b.rawValue ?? 0) - (a.rawValue ?? 0) : (a.rawValue ?? 0) - (b.rawValue ?? 0)
    }
    for (const f of rankFields) {
      const av = getVal(a, f)
      const bv = getVal(b, f)
      const diff = getFieldDir(f) ? bv - av : av - bv
      if (diff !== 0) return diff
    }
    return 0
  }

  const sorted = [...entries].sort(compareEntries)

  const rankMap = new Map<string, number>()
  let rank = 1
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && compareEntries(sorted[i], sorted[i - 1]) !== 0) rank = i + 1
    rankMap.set(sorted[i].teamId, rank)
  }

  return { sorted, rankMap }
}

// ─── Relatiivne ranking ───────────────────────────────────────────────────────
function applyRelativeRanking(
  entries: ScoredEntry[],
  paramsJson: string,
  maxValue: number,
  scoringMode: ScoringMode,
  fields: FieldDefinition[] = []
) {
  const params: { higherIsBetter?: boolean; minPoints?: number } = (() => {
    try { return JSON.parse(paramsJson) } catch { return {} }
  })()

  const minPoints = params.minPoints ?? 0
  const higherIsBetter = params.higherIsBetter ?? false

  const n = entries.length
  if (n <= 1) {
    entries.forEach((e) => (e.penaltyPoints = scoringMode === "PLUS" ? maxValue : minPoints))
    return
  }

  const { rankMap } = sortByRankingFields(entries, fields, higherIsBetter)

  const range = maxValue - minPoints
  const step = range / (n - 1)
  for (const entry of entries) {
    const r = rankMap.get(entry.teamId) ?? 1
    const offset = Math.round(((r - 1) * step) * 1000) / 1000
    entry.penaltyPoints = scoringMode === "PLUS" ? maxValue - offset : minPoints + offset
  }
}

// ─── Absoluutne aeg ───────────────────────────────────────────────────────────
function applyAbsoluteTime(entries: ScoredEntry[], scoringMode: ScoringMode) {
  // Aeg on alati karistuspunktina (väiksem = parem), olenemata süsteemist
  for (const entry of entries) {
    entry.penaltyPoints = scoringMode === "PLUS" ? -(entry.rawValue ?? 0) : (entry.rawValue ?? 0)
  }
}

// ─── Absoluutsed punktid ──────────────────────────────────────────────────────
function applyAbsolutePoints(entries: ScoredEntry[], maxValue: number, scoringMode: ScoringMode) {
  if (scoringMode === "PLUS") {
    // Plusspunktid otse
    for (const entry of entries) {
      entry.penaltyPoints = entry.rawValue ?? 0
    }
  } else {
    // Karistuspunktid: max - oma tulemus
    const max = Math.max(...entries.map((e) => e.rawValue ?? 0))
    for (const entry of entries) {
      entry.penaltyPoints = max - (entry.rawValue ?? 0)
    }
  }
  void maxValue
}

// ─── Absoluutne karistus (Vastutegevus, Varustus, Hilinemine) ────────────────
function applyAbsolutePenalty(
  entries: ScoredEntry[],
  formula: string,
  scoringMode: ScoringMode
) {
  for (const entry of entries) {
    try {
      const scope = { result: Number(entry.rawValue ?? 0) }
      const penalty = Number(evaluate(formula, scope))
      entry.penaltyPoints = scoringMode === "PLUS" ? -Math.abs(penalty) : Math.abs(penalty)
    } catch {
      entry.penaltyPoints = Number(entry.rawValue ?? 0)
    }
  }
}

// ─── Fikseeritud pingerida (Variant 2 & 4) ────────────────────────────────────
// fixedPoints = punktid koha järgi [1.koht, 2.koht, ...].
// Kui pingereas on rohkem tiime kui fixedPoints pikkus, arvutatakse ülejäänud
// valemiga: viimasest fikseeritud väärtusest lineaarselt minPoints-ini.
function applyFixedRanking(
  entries: ScoredEntry[],
  paramsJson: string,
  maxValue: number,
  scoringMode: ScoringMode,
  fields: FieldDefinition[] = []
) {
  const params: { higherIsBetter?: boolean; fixedPoints?: number[]; minPoints?: number } = (() => {
    try { return JSON.parse(paramsJson) } catch { return {} }
  })()

  const fixedPoints: number[] = params.fixedPoints ?? []
  const minPoints = params.minPoints ?? 0
  const higherIsBetter = params.higherIsBetter ?? false

  const n = entries.length
  const { rankMap } = sortByRankingFields(entries, fields, higherIsBetter)

  for (const entry of entries) {
    const r = rankMap.get(entry.teamId) ?? 1
    let pts: number

    if (fixedPoints.length === 0) {
      // Puhtalt valemiga (nagu RELATIVE_RANKING)
      const range = maxValue - minPoints
      const step = n > 1 ? range / (n - 1) : 0
      pts = scoringMode === "PLUS" ? maxValue - (r - 1) * step : minPoints + (r - 1) * step
    } else if (r <= fixedPoints.length) {
      pts = fixedPoints[r - 1]
    } else {
      // Valem: viimasest fikseeritud väärtusest → minPoints
      const lastFixed = fixedPoints[fixedPoints.length - 1]
      const remainingPositions = n - fixedPoints.length
      if (remainingPositions <= 0) {
        pts = minPoints
      } else {
        const range = lastFixed - minPoints
        const step = range / remainingPositions
        pts = lastFixed - (r - fixedPoints.length) * step
      }
    }

    entry.penaltyPoints = Math.round(pts * 1000) / 1000
  }
}

// ─── Tulemuspõhine jaotus (Variant 5) ────────────────────────────────────────
// Punktid jaotatakse parima ja halvima tulemuse vahe järgi proportsionaalselt.
// Viigi korral (sama põhiväärtus) jagatakse punktid kahe naabri grupi vahel
// proportsionaalselt tiebreaker järjestuse alusel (PDF Variant 5 Excel loogika):
//   N = (M - H) / (K + 1)   kus M = naabri grupi punktid, H = grupi baasväärtus, K = viikide arv
//   Halvima grupi korral kasutatakse parema grupi M-i (spread on negatiivne/positiivne)
function applyValueBased(
  entries: ScoredEntry[],
  paramsJson: string,
  maxValue: number,
  scoringMode: ScoringMode,
  fields: FieldDefinition[] = []
) {
  const params: { higherIsBetter?: boolean; minPoints?: number } = (() => {
    try { return JSON.parse(paramsJson) } catch { return {} }
  })()

  const minPoints = params.minPoints ?? 0
  const higherIsBetter = params.higherIsBetter ?? false

  // Esmase välja suund meta-st (tühistab globaalse)
  const primaryField = fields.find(f => f.rankingPriority === 1)
  let effectiveHigher = higherIsBetter
  if (primaryField?.meta) {
    try {
      const m = JSON.parse(primaryField.meta)
      if (typeof m.higherIsBetter === "boolean") effectiveHigher = m.higherIsBetter
    } catch {}
  }

  const values = entries.map((e) => e.rawValue ?? 0)
  const bestVal = effectiveHigher ? Math.max(...values) : Math.min(...values)
  const worstVal = effectiveHigher ? Math.min(...values) : Math.max(...values)
  const range = Math.abs(worstVal - bestVal)

  // Baasväärtus iga kirje jaoks (ilma tiebreakerita)
  const baseScore = (v: number): number => {
    if (range === 0) return scoringMode === "PLUS" ? maxValue : minPoints
    const proportion = Math.abs(v - bestVal) / range
    const pts = minPoints + proportion * (maxValue - minPoints)
    return scoringMode === "PLUS" ? maxValue - pts + minPoints : pts
  }

  const hasTiebreakers = fields.some((f) => f.rankingPriority != null && (f.rankingPriority ?? 0) > 1)

  if (!hasTiebreakers) {
    for (const entry of entries) {
      entry.penaltyPoints = Math.round(baseScore(entry.rawValue ?? 0) * 1000) / 1000
    }
    return
  }

  // Grupeeri kirjed sama põhiväärtuse järgi
  const round9 = (v: number) => Math.round(v * 1e9) / 1e9
  const valueGroups = new Map<number, ScoredEntry[]>()
  for (const e of entries) {
    const key = round9(e.rawValue ?? 0)
    if (!valueGroups.has(key)) valueGroups.set(key, [])
    valueGroups.get(key)!.push(e)
  }

  // Iga grupi baasväärtus H
  const groupH = new Map<number, number>()
  for (const key of valueGroups.keys()) groupH.set(key, baseScore(key))

  // Järjesta grupid tulemuslikkuse järgi: parim → halvim
  // PENALTY: madalam H = parem; PLUS: kõrgem H = parem
  const sortedKeys = [...valueGroups.keys()].sort((a, b) => {
    const ha = groupH.get(a) ?? 0
    const hb = groupH.get(b) ?? 0
    return scoringMode === "PENALTY" ? ha - hb : hb - ha
  })
  const lastSortedIdx = sortedKeys.length - 1

  sortedKeys.forEach((key, sortedIdx) => {
    const group = valueGroups.get(key)!
    const H = groupH.get(key) ?? 0
    const K = group.length

    // Üksik kirje grupis: lihtsalt baasväärtus
    if (K === 1) {
      group[0].penaltyPoints = Math.round(H * 10000) / 10000
      return
    }

    // Leia naabri grupi punktid M
    const isWorstGroup = sortedIdx === lastSortedIdx
    let M = H
    if (!isWorstGroup) {
      // Halvema naabri punktid (N positiivne PENALTY-s, negatiivne PLUS-is)
      M = groupH.get(sortedKeys[sortedIdx + 1]) ?? H
    } else if (sortedIdx > 0) {
      // Halvim grupp: kasuta parema naabri punkte
      M = groupH.get(sortedKeys[sortedIdx - 1]) ?? H
    }

    const spread = M !== H ? (M - H) / (K + 1) : 0

    if (spread === 0) {
      group.forEach((e) => { e.penaltyPoints = Math.round(H * 10000) / 10000 })
      return
    }

    // Sorteeri grupp tiebreakeri järgi: idx=0 = parim tiebreaker
    const { sorted } = sortByRankingFields(group, fields, higherIsBetter)

    sorted.forEach((entry, idx) => {
      // Halvima grupi korral: parim tiebreaker (idx=0) saab kõige suurema korrektsioon suunas M
      // Teiste gruppide korral: parim tiebreaker (idx=0) jääb H juurde, halvim liigub M suunas
      const j = isWorstGroup ? (K - 1 - idx) : idx
      entry.penaltyPoints = Math.round((H + spread * j) * 10000) / 10000
    })
  })
}

// ─── Soorituspõhine (Variant 1) ───────────────────────────────────────────────
// Tulemusväli = õigesti sooritatud elementide arv.
// elemendi väärtus = maxValue / totalElements
// PLUS: correct × elemendi_väärtus
// PENALTY: (totalElements − correct) × elemendi_väärtus
function applyPerformanceBased(
  entries: ScoredEntry[],
  paramsJson: string,
  maxValue: number,
  scoringMode: ScoringMode
) {
  const params: { totalElements?: number } = (() => {
    try { return JSON.parse(paramsJson) } catch { return {} }
  })()

  const totalElements = Math.max(1, params.totalElements ?? 1)
  const elementValue = maxValue / totalElements

  for (const entry of entries) {
    const correct = Math.max(0, Math.min(totalElements, entry.rawValue ?? 0))
    entry.penaltyPoints = scoringMode === "PLUS"
      ? Math.round(correct * elementValue * 1000) / 1000
      : Math.round((totalElements - correct) * elementValue * 1000) / 1000
  }
}

// ─── Korraldaja valem ─────────────────────────────────────────────────────────
function applyCustom(
  entries: ScoredEntry[],
  formula: string,
  _fields: FieldDefinition[]
) {
  for (const entry of entries) {
    try {
      const scope: FieldValues = {
        result: entry.rawValue ?? 0,
        n: entries.length,
        rank: entries.indexOf(entry) + 1,
      }
      entry.penaltyPoints = evaluate(formula, scope) as number
    } catch {
      entry.penaltyPoints = 0
    }
  }
}
