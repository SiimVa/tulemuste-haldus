// Kliendiohutu simulatsiooni-loogika sportlase vaate jaoks.
// EI impordi mathjs ega @prisma/client'i — väldib brauseri paketi paisumist.
// Toetab ainult "oma-sisendi" arvutusmeetodeid (sõltuvad ainult tiimi enda sisendist).
// Relatiivsete meetodite puhul tagastab null (= ei saa kliendipoolselt simuleerida).

export type SimField = {
  name: string
  type: string
  isResultField: boolean
  rankingPriority: number | null
  formula: string | null
  order: number
}

export function simParseTime(value: string | number): number {
  if (typeof value === "number") return value
  const parts = String(value).trim().split(":")
  if (parts.length === 3) return (+parts[0] || 0) * 3600 + (+parts[1] || 0) * 60 + (+parts[2] || 0)
  if (parts.length === 2) return (+parts[0] || 0) * 60 + (+parts[1] || 0)
  return parseFloat(String(value)) || 0
}

function computeFields(values: Record<string, string | number>, fields: SimField[]): Record<string, number> {
  const result: Record<string, string | number> = { ...values }

  for (const field of fields) {
    if (field.type === "COMPUTED") continue
    if (result[field.name] === undefined) continue
    if (field.type === "TIME") {
      result[field.name] = simParseTime(String(result[field.name]))
    } else if (field.type === "NUMBER" || field.type === "CHECKBOX") {
      const n = parseFloat(String(result[field.name]))
      result[field.name] = isNaN(n) ? 0 : n
    }
  }

  // TIME_RANGE: kestvus = lõpp − algus (sh üle südaöö)
  for (const field of fields) {
    if (field.type !== "TIME_RANGE") continue
    const start = simParseTime(String(result[field.name + "_start"] ?? "0"))
    const end = simParseTime(String(result[field.name + "_end"] ?? "0"))
    result[field.name] = end >= start ? end - start : end + 86400 - start
  }

  // COMPUTED väljad valemiga (sama New Function lähenemine nagu serveris)
  const computed = fields.filter((f) => f.type === "COMPUTED" && f.formula).sort((a, b) => a.order - b.order)
  for (const field of computed) {
    try {
      const scope: Record<string, number> = {}
      for (const [k, v] of Object.entries(result)) {
        const n = typeof v === "number" ? v : parseFloat(String(v))
        if (!isNaN(n)) scope[k] = n
      }
      // eslint-disable-next-line no-new-func
      const fn = new Function(...Object.keys(scope), "min", "max", "floor", "round", "abs", `return (${field.formula})`)
      const val = fn(...Object.values(scope), Math.min, Math.max, Math.floor, Math.round, Math.abs)
      result[field.name] = typeof val === "number" && isFinite(val) ? val : 0
    } catch {
      result[field.name] = 0
    }
  }

  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(result)) {
    const n = typeof v === "number" ? v : parseFloat(String(v))
    out[k] = isNaN(n) ? 0 : n
  }
  return out
}

function evalFormula(formula: string, resultVal: number): number {
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function("result", "min", "max", "floor", "round", "abs", `return (${formula})`)
    const v = fn(resultVal, Math.min, Math.max, Math.floor, Math.round, Math.abs)
    return typeof v === "number" && isFinite(v) ? v : 0
  } catch {
    return 0
  }
}

const round3 = (n: number) => Math.round(n * 1000) / 1000

// Tagastab hüpoteetilise elemendi skoori, VÕI null kui pole kliendipoolselt simuleeritav.
export function simulateElementScore(opts: {
  calcType: string | null
  customFormula: string | null
  calcParams: Record<string, unknown>
  fields: SimField[]
  values: Record<string, string>
  maxValue: number
  scoringMode: "PENALTY" | "PLUS"
}): number | null {
  const { calcType, customFormula, calcParams, fields, values, maxValue, scoringMode } = opts
  const resultField = fields.find((f) => f.isResultField) ?? fields.find((f) => f.rankingPriority === 1 && f.type !== "COMPUTED")
  if (!resultField) return null

  const computed = computeFields(values, fields)
  const rawValue = resultField.type === "TIME"
    ? simParseTime(String(computed[resultField.name] ?? 0))
    : (computed[resultField.name] ?? 0)

  const isPlus = scoringMode === "PLUS"

  switch (calcType) {
    case "DIRECT_ENTRY":
      return round3(rawValue)
    case "ABSOLUTE_TIME":
      return round3(isPlus ? -rawValue : rawValue)
    case "ABSOLUTE_PENALTY": {
      const p = Math.abs(evalFormula(customFormula || "result", rawValue))
      return round3(isPlus ? -p : p)
    }
    case "PERFORMANCE_BASED": {
      const total = Math.max(1, Number(calcParams.totalElements ?? 1))
      const ev = maxValue / total
      const correct = Math.max(0, Math.min(total, rawValue))
      return round3(isPlus ? correct * ev : (total - correct) * ev)
    }
    case "ABSOLUTE_POINTS":
      // PLUS: punktid otse. PENALTY: max − oma tulemus (sõltub teistest) → ei saa simuleerida.
      return isPlus ? round3(rawValue) : null
    default:
      // RELATIVE_RANKING, FIXED_RANKING, VALUE_BASED, COMBINED jt → sõltuvad teistest
      return null
  }
}
