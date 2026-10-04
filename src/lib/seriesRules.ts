import { EXCEPTION_KIND_LABELS, exceptionKind } from "./exceptionKinds"
import { elementFieldLabel } from "./elementFieldTypes"
import { fixedRankingParamsForStorage, parseFixedRankingParams } from "./fixedRanking"
import { seriesElementRole } from "./seriesRanking"

// Üleriikliku arvestuse reeglite kontroll: kas osavõistluste sama tähisega
// elemendid (KP-d ja karistuselemendid) hinnatakse samade reeglite järgi.
// Võrreldakse hindamist mõjutavaid seadeid, mitte nimesid ega asukohti.

export type RuleField = {
  name: string
  label: string
  type: string
  order: number
  isResultField: boolean
  rankingPriority: number | null
  formula: string | null
  meta: string | null
}
export type RuleCalcMethod = { type: string; params: string; customFormula: string | null }
export type RuleElement = {
  id: string
  code: string
  name: string
  type: string
  order: number
  isCancelled: boolean
  maxValue: number | null
  directPointsEntry: boolean
  config: string
  calcMethod: RuleCalcMethod | null
  exceptions: { label: string; kind?: string | null; penalty: number; order: number }[]
  fields: RuleField[]
  sections: { name: string; order: number; maxValue: number | null; calcMethod: RuleCalcMethod | null; fields: RuleField[] }[]
}
export type RuleCompetition = {
  id: string
  name: string
  scoringMode: string
  defaultKPMaxValue: number
  defaultPKMaxValue: number
  elements: RuleElement[]
}

// Sama seadistusega osavõistlused ja selle seadistuse kirjeldus.
export type RuleVariant = { competitionIds: string[]; value: string }
export type RuleDifference = { code: string; name: string; property: string; variants: RuleVariant[] }
export type RuleMissing = { code: string; name: string; missingIn: string[] }
export type IgnoredElement = { competitionId: string; code: string; name: string; type: string }
export type SeriesRulesCheck = {
  scoringModes: RuleVariant[]
  differences: RuleDifference[]
  missing: RuleMissing[]
  ignored: IgnoredElement[]
  comparedCodes: number
}

export const ELEMENT_TYPE_LABELS: Record<string, string> = {
  CHECKPOINT: "KP",
  PENALTY_BOX: "Postkast",
  COUNTER_ACTION: "Vastutegevus",
  EQUIPMENT_CHECK: "Varustuskontroll",
  LATENESS: "Hilinemine",
  ABANDONMENT: "Katkestamine",
  MANUAL: "Käsitsi sisestatav",
  OTHER: "Muu element",
}

const CALC_LABELS: Record<string, string> = {
  RELATIVE_RANKING: "Pingerida valemiga",
  ABSOLUTE_TIME: "Absoluutne aeg",
  ABSOLUTE_POINTS: "Absoluutsed punktid",
  ABSOLUTE_PENALTY: "Absoluutsed karistuspunktid",
  FIXED_RANKING: "Fikseeritud pingerida",
  VALUE_BASED: "Tulemuspõhiselt jaotav",
  PERFORMANCE_BASED: "Soorituspõhine",
  CUSTOM: "Korraldaja valem",
  DIRECT_ENTRY: "Vaba sisestus",
}

const CONFIG_LABELS: Record<string, string> = {
  penaltyPerLife: "karistus elu kohta",
  penaltyPerItem: "karistus eseme kohta",
  penaltyPerMember: "karistus liikme kohta",
  penaltyPerInterval: "karistus intervalli kohta",
  intervalMinutes: "intervall (min)",
  maxPenalty: "suurim karistus",
  mode: "režiim",
  boxMode: "postkastide režiim",
  boxValue: "postkasti väärtus",
  totalBoxes: "postkaste",
}

// Võtmete järjekorrast sõltumatu võrdluskuju.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().filter((key) => record[key] !== undefined).map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`
  }
  return JSON.stringify(value ?? null)
}

function parseJson(text: string | null | undefined): unknown {
  if (!text) return {}
  try { return JSON.parse(text) } catch { return text }
}

const formatNumber = (value: number) => (Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000).replace(".", ","))

// Arvutusmeetodi parameetrid koos vaikeväärtustega, et puuduv ja vaikimisi
// väärtus ei paistaks erinevusena.
function calcParams(method: RuleCalcMethod): Record<string, unknown> {
  const params = parseJson(method.params)
  const record = params && typeof params === "object" && !Array.isArray(params) ? (params as Record<string, unknown>) : {}
  if (method.type === "FIXED_RANKING") return fixedRankingParamsForStorage(parseFixedRankingParams(record))
  if (method.type === "RELATIVE_RANKING" || method.type === "VALUE_BASED") {
    return { ...record, higherIsBetter: Boolean(record.higherIsBetter ?? false), minPoints: Number(record.minPoints ?? 0) }
  }
  return record
}

function describeCalc(method: RuleCalcMethod | null, directPointsEntry = false): { key: string; value: string } {
  if (!method) return { key: canonical({ none: true, directPointsEntry }), value: directPointsEntry ? "otse punktid" : "puudub" }
  const params = calcParams(method)
  const parts = [CALC_LABELS[method.type] ?? method.type]
  if (typeof params.higherIsBetter === "boolean") parts.push(params.higherIsBetter ? "suurem on parem" : "väiksem on parem")
  if (method.type === "FIXED_RANKING") {
    if (params.fixedRankingMode === "REGISTERED_COUNT") parts.push(`registreerunute arvu järgi (alus ${params.teamCountBase}, samm ${params.teamCountStep})`)
    else {
      const points = Array.isArray(params.fixedPoints) ? (params.fixedPoints as number[]) : []
      if (points.length > 0) parts.push(`punktid ${points.map(formatNumber).join(", ")}`)
      parts.push(params.fixedRankingMode === "MANUAL_ALL" ? "kõik kohad käsitsi" : `edasi kuni ${formatNumber(Number(params.minPoints ?? 0))} p`)
    }
  } else if (typeof params.minPoints === "number") parts.push(`miinimum ${formatNumber(params.minPoints)} p`)
  if (method.customFormula) parts.push(`valem ${method.customFormula}`)
  if (typeof params.totalElements === "number") parts.push(`${params.totalElements} osa`)
  if (directPointsEntry) parts.push("otse punktid")
  return { key: canonical({ type: method.type, params, customFormula: method.customFormula ?? null, directPointsEntry }), value: parts.join(", ") }
}

function fieldsKey(fields: RuleField[]) {
  return canonical([...fields].sort((a, b) => a.order - b.order).map((field) => ({
    name: field.name, type: field.type, isResultField: field.isResultField, rankingPriority: field.rankingPriority,
    formula: field.formula ?? null, meta: parseJson(field.meta),
  })))
}

function describeFields(fields: RuleField[]): { key: string; value: string } {
  const sorted = [...fields].sort((a, b) => a.order - b.order)
  const value = sorted.length === 0
    ? "puuduvad"
    : sorted.map((field) => `${field.label} (${elementFieldLabel(field.type)}${field.rankingPriority === 1 ? ", esmane" : ""})`).join("; ")
  return { key: fieldsKey(fields), value }
}

const CONFIG_VALUE_LABELS: Record<string, string> = {
  PER_INTERVAL: "intervalliga",
  ONE_TIME: "ühekordne",
  FIXED: "fikseeritud",
  CUSTOM: "käsitsi",
  SAME_VALUE: "sama väärtusega",
  DIFFERENT_VALUES: "eri väärtustega",
  DIRECT: "otse",
}

function describeConfig(config: string): { key: string; value: string } {
  const parsed = parseJson(config)
  const record = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
  const entries = Object.entries(record).filter(([, value]) => value !== undefined && value !== null && value !== "")
  const value = entries.length === 0
    ? "—"
    : entries.sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => {
      const text = typeof item === "object" ? JSON.stringify(item) : String(item)
      return `${CONFIG_LABELS[key] ?? key}: ${CONFIG_VALUE_LABELS[text] ?? text}`
    }).join(", ")
  return { key: canonical(record), value }
}

type Descriptor = { property: string; describe: (element: RuleElement, competition: RuleCompetition) => { key: string; value: string } }

const DESCRIPTORS: Descriptor[] = [
  { property: "Tüüp", describe: (element) => ({ key: element.type, value: ELEMENT_TYPE_LABELS[element.type] ?? element.type }) },
  { property: "Tühistatud", describe: (element) => ({ key: String(element.isCancelled), value: element.isCancelled ? "tühistatud" : "kehtib" }) },
  {
    property: "Maksimum",
    describe: (element, competition) => {
      const max = element.maxValue ?? (element.type === "CHECKPOINT" ? competition.defaultKPMaxValue : element.type === "PENALTY_BOX" ? competition.defaultPKMaxValue : null)
      return { key: String(max), value: max === null ? "—" : `${formatNumber(max)} p` }
    },
  },
  { property: "Arvutusmeetod", describe: (element) => describeCalc(element.calcMethod, element.directPointsEntry) },
  {
    property: "Erandid",
    describe: (element) => {
      const exceptions = [...element.exceptions].sort((a, b) => a.order - b.order)
      return {
        key: canonical(exceptions.map((item) => [item.label, exceptionKind(item), item.penalty])),
        value: exceptions.length === 0
          ? "puuduvad"
          : exceptions.map((item) => {
            const kindLabel = EXCEPTION_KIND_LABELS[exceptionKind(item)]
            return `${item.label}${kindLabel !== item.label ? ` (${kindLabel})` : ""} ${formatNumber(item.penalty)} p`
          }).join("; "),
      }
    },
  },
  { property: "Väljad", describe: (element) => describeFields(element.fields) },
  {
    property: "Hindamisosad",
    describe: (element) => {
      const sections = [...element.sections].sort((a, b) => a.order - b.order)
      return {
        key: canonical(sections.map((section) => ({
          name: section.name, maxValue: section.maxValue, calc: describeCalc(section.calcMethod).key, fields: fieldsKey(section.fields),
        }))),
        value: sections.length === 0 ? "puuduvad" : sections.map((section) => `${section.name}${section.maxValue != null ? ` (${formatNumber(section.maxValue)} p)` : ""}: ${describeCalc(section.calcMethod).value}`).join("; "),
      }
    },
  },
  { property: "Seaded", describe: (element) => describeConfig(element.config) },
]

const VARIANT_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"

export function checkSeriesRules(competitions: RuleCompetition[]): SeriesRulesCheck {
  const modeGroups = new Map<string, string[]>()
  for (const competition of competitions) modeGroups.set(competition.scoringMode, [...(modeGroups.get(competition.scoringMode) ?? []), competition.id])
  const scoringModes = [...modeGroups].map(([mode, competitionIds]) => ({
    competitionIds,
    value: mode === "PLUS" ? "punktid (suurem on parem)" : "karistuspunktid (väiksem on parem)",
  }))

  const ignored: IgnoredElement[] = []
  const codes: string[] = []
  const nameByCode = new Map<string, string>()
  for (const competition of competitions) {
    for (const element of [...competition.elements].sort((a, b) => a.order - b.order)) {
      if (seriesElementRole(element.type) === "IGNORED") {
        ignored.push({ competitionId: competition.id, code: element.code, name: element.name, type: element.type })
        continue
      }
      if (!nameByCode.has(element.code)) {
        codes.push(element.code)
        nameByCode.set(element.code, element.name)
      }
    }
  }

  const differences: RuleDifference[] = []
  const missing: RuleMissing[] = []
  for (const code of codes) {
    const present = competitions.flatMap((competition) => {
      const element = competition.elements.find((item) => item.code === code && seriesElementRole(item.type) !== "IGNORED")
      return element ? [{ competition, element }] : []
    })
    const missingIn = competitions.filter((competition) => !present.some((item) => item.competition.id === competition.id)).map((competition) => competition.id)
    if (missingIn.length > 0) missing.push({ code, name: nameByCode.get(code) ?? code, missingIn })
    if (present.length < 2) continue
    for (const descriptor of DESCRIPTORS) {
      const groups = new Map<string, { value: string; competitionIds: string[] }>()
      for (const { competition, element } of present) {
        const { key, value } = descriptor.describe(element, competition)
        const group = groups.get(key) ?? { value, competitionIds: [] }
        group.competitionIds.push(competition.id)
        groups.set(key, group)
      }
      if (groups.size < 2) continue
      const variants = [...groups.values()]
      // Kirjeldus ei näita kõiki seadeid: eristamatud variandid saavad tähe.
      const distinctValues = new Set(variants.map((variant) => variant.value)).size
      differences.push({
        code,
        name: nameByCode.get(code) ?? code,
        property: descriptor.property,
        variants: variants.map((variant, index) => ({
          competitionIds: variant.competitionIds,
          value: distinctValues < variants.length ? `${variant.value} · variant ${VARIANT_LETTERS[index] ?? index + 1}` : variant.value,
        })),
      })
    }
  }

  return { scoringModes, differences, missing, ignored, comparedCodes: codes.length }
}
