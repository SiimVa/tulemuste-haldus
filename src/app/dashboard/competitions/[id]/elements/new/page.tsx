"use client"

import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { FormulaInput } from "@/components/FormulaInput"
import { FieldValidationEditor } from "@/components/FieldValidationEditor"
import { FieldValidation, parseValidation } from "@/lib/fieldValidation"

type FieldRow = { name: string; label: string; type: string; rankingPriority: number | null; formula: string; displayAsTime: boolean; validation: FieldValidation; fieldHigherIsBetter: boolean | null }
type ExceptionRow = { label: string; penalty: string }
type SectionRow = {
  id: string // lokaalne key
  name: string
  maxValue: string
  fields: FieldRow[]
  calcType: string
  higherIsBetter: boolean | null
  minPoints: number
  totalElements: number
  customFormula: string
}

type CompDefs = {
  scoringMode: string
  defaultKPMaxValue: number
  defaultPKMaxValue: number
  defaultNotPassed: number
  defaultPassedNotDone: number
  defaultVastutegevusPenaltyPerLife: number
  defaultVarustusPenaltyPerItem: number
  defaultHilinemineMode: string
  defaultHilinemineIntervalMinutes: number
  defaultHilineminePenaltyPerInterval: number
  defaultHilinemineMaxPenalty: number
  defaultCalcType: string
  defaultHigherIsBetter: boolean
  defaultRankingMinPoints: number
}

const FIELD_TYPES = [
  { value: "TIME", label: "Aeg (h:mm:ss)" },
  { value: "TIME_RANGE", label: "Algus/Lõpp aeg (kestvus)" },
  { value: "NUMBER", label: "Arv" },
  { value: "TEXT", label: "Tekst" },
  { value: "COMPUTED", label: "Arvutatud (valem)" },
]

const CALC_TYPES = [
  { value: "RELATIVE_RANKING", label: "Pingerida valemiga", desc: "Parim saab 0p (PENALTY) või max (PLUS), halvim vastupidi. Rangi järgi lineaarne." },
  { value: "FIXED_RANKING", label: "Fikseeritud pingerida", desc: "Igale kohale määrad täpse punktisumma. Ülejäänud kohad arvutatakse valemiga." },
  { value: "VALUE_BASED", label: "Tulemuspõhine jaotus", desc: "Punktid jaotatakse parima ja halvima tulemuse vahe järgi proportsionaalselt." },
  { value: "PERFORMANCE_BASED", label: "Soorituspõhine", desc: "Tulemusväli = õigeid elemente. Iga element annab maxP / koguElementide arvu." },
  { value: "ABSOLUTE_TIME", label: "Absoluutne aeg", desc: "Karistuspunkt = tegelik aeg sekundites." },
  { value: "ABSOLUTE_POINTS", label: "Absoluutsed punktid (suurem = parem)", desc: "PENALTY: karistus = max − oma tulemus. PLUS: salvestatakse otse." },
  { value: "CUSTOM", label: "Korraldaja valem", desc: "Kirjuta ise valem (muutujad: result, n, rank)." },
  { value: "COMBINED", label: "Kombineeritud hindamine", desc: "Element koosneb mitmest hindamisosast. Iga osa arvutatakse eraldi, lõpptulemus = osade summa." },
  { value: "DIRECT_ENTRY", label: "Vaba sisestus", desc: "Kohtunik sisestab pluss- või karistuspunktid otse arvuna. Tulemus läheb summasse muutmata." },
]

const ELEMENT_TYPES = [
  { value: "CHECKPOINT", label: "KP – Kontrollpunkt", badge: "KP", color: "bg-blue-100 text-blue-700" },
  { value: "PENALTY_BOX", label: "PK – Postkast", badge: "PK", color: "bg-orange-100 text-orange-700" },
  { value: "COUNTER_ACTION", label: "VT – Vastutegevus", badge: "VT", color: "bg-red-100 text-red-700" },
  { value: "EQUIPMENT_CHECK", label: "VA – Varustuskontroll", badge: "VA", color: "bg-yellow-100 text-yellow-700" },
  { value: "LATENESS", label: "HL – Hilinemine", badge: "HL", color: "bg-purple-100 text-purple-700" },
  { value: "ABANDONMENT", label: "KT – Katkestamine", badge: "KT", color: "bg-rose-100 text-rose-700" },
  { value: "MANUAL", label: "Käsitsi sisestatav", badge: "KS", color: "bg-gray-100 text-gray-600" },
  { value: "OTHER", label: "Muu element", badge: "MU", color: "bg-teal-100 text-teal-700" },
]

// Tüübipõhised konfiguratsiooni vaikeväärtused
function getTypeDefaults(type: string, defs: CompDefs): {
  fields: FieldRow[], exceptions: ExceptionRow[], calcType: string, customFormula: string,
  higherIsBetter: boolean | null, maxValue: string, config: Record<string, unknown>
} {
  switch (type) {
    case "COUNTER_ACTION":
      return {
        fields: [{ name: "kaotatud_elud", label: "Kaotatud elud", type: "NUMBER", rankingPriority: 1, formula: "", displayAsTime: false, validation: {}, fieldHigherIsBetter: null }],
        exceptions: [],
        calcType: "ABSOLUTE_PENALTY",
        customFormula: `result * ${defs.defaultVastutegevusPenaltyPerLife}`,
        higherIsBetter: false, maxValue: "",
        config: { penaltyPerLife: defs.defaultVastutegevusPenaltyPerLife },
      }
    case "EQUIPMENT_CHECK":
      return {
        fields: [{ name: "puuduolevad", label: "Puuduolevad esemed", type: "NUMBER", rankingPriority: 1, formula: "", displayAsTime: false, validation: {}, fieldHigherIsBetter: null }],
        exceptions: [],
        calcType: "ABSOLUTE_PENALTY",
        customFormula: `result * ${defs.defaultVarustusPenaltyPerItem}`,
        higherIsBetter: false, maxValue: "",
        config: { penaltyPerItem: defs.defaultVarustusPenaltyPerItem },
      }
    case "LATENESS":
      if (defs.defaultHilinemineMode === "PER_INTERVAL") {
        const { defaultHilinemineIntervalMinutes: iv, defaultHilineminePenaltyPerInterval: pp, defaultHilinemineMaxPenalty: mp } = defs
        return {
          fields: [{ name: "minutid", label: "Hilinenud minuteid", type: "NUMBER", rankingPriority: 1, formula: "", displayAsTime: false, validation: {}, fieldHigherIsBetter: null }],
          exceptions: [],
          calcType: "ABSOLUTE_PENALTY",
          customFormula: `min(floor(result / ${iv}) * ${pp}, ${mp})`,
          higherIsBetter: false, maxValue: "",
          config: { mode: "PER_INTERVAL", intervalMinutes: iv, penaltyPerInterval: pp, maxPenalty: mp },
        }
      }
      return {
        fields: [],
        exceptions: [{ label: "Hilines", penalty: String(defs.defaultPassedNotDone) }],
        calcType: "RELATIVE_RANKING",
        customFormula: "", higherIsBetter: null, maxValue: "",
        config: { mode: "ONE_TIME" },
      }
    case "PENALTY_BOX":
      return {
        fields: [],
        exceptions: [
          { label: "Ei läbinud", penalty: String(defs.defaultNotPassed) },
        ],
        calcType: "ABSOLUTE_POINTS",
        customFormula: "", higherIsBetter: true,
        maxValue: String(defs.defaultPKMaxValue),
        config: { boxMode: "SAME_VALUE" },
      }
    case "OTHER":
      return {
        fields: [], exceptions: [],
        calcType: "RELATIVE_RANKING", customFormula: "",
        higherIsBetter: null, maxValue: "", config: {},
      }
    case "ABANDONMENT":
      return {
        fields: [], exceptions: [],
        calcType: "RELATIVE_RANKING", customFormula: "",
        higherIsBetter: null, maxValue: "",
        config: { mode: "FIXED", penaltyPerMember: 10 },
      }
    default: // CHECKPOINT, MANUAL
      return {
        fields: type === "MANUAL" ? [] : [{ name: "aeg", label: "Aeg", type: "TIME", rankingPriority: 1, formula: "", displayAsTime: false, validation: {}, fieldHigherIsBetter: null }],
        exceptions: type === "MANUAL" ? [] : [
          { label: "Ei läbinud", penalty: String(defs.defaultNotPassed) },
          { label: "Läbis aga ei sooritanud", penalty: String(defs.defaultPassedNotDone) },
        ],
        calcType: type === "MANUAL" ? "COMBINED" : defs.defaultCalcType,
        customFormula: "", higherIsBetter: null,
        maxValue: type === "MANUAL" ? "" : String(defs.defaultKPMaxValue),
        config: {},
      }
  }
}

export default function NewElementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: competitionId } = use(params)
  const router = useRouter()

  const [name, setName] = useState("")
  const [code, setCode] = useState("")
  const [type, setType] = useState("CHECKPOINT")
  const [maxValue, setMaxValue] = useState<string>("")
  const [fields, setFields] = useState<FieldRow[]>([
    { name: "aeg", label: "Aeg", type: "TIME", rankingPriority: 1, formula: "", displayAsTime: false, validation: {}, fieldHigherIsBetter: null },
  ])
  const [exceptions, setExceptions] = useState<ExceptionRow[]>([])
  const [calcType, setCalcType] = useState("RELATIVE_RANKING")
  const [customFormula, setCustomFormula] = useState("")
  const [minPoints, setMinPoints] = useState(0)
  const [fixedPoints, setFixedPoints] = useState<string[]>([])
  const [totalElements, setTotalElements] = useState(10)
  const [directHigherIsBetter, setDirectHigherIsBetter] = useState(false)
  const [elementConfig, setElementConfig] = useState<Record<string, unknown>>({})
  const [compDefs, setCompDefs] = useState<CompDefs | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const [sections, setSections] = useState<SectionRow[]>([
    { id: crypto.randomUUID(), name: "", maxValue: "", fields: [{ name: "", label: "", type: "NUMBER", rankingPriority: 1, formula: "", displayAsTime: false, validation: {}, fieldHigherIsBetter: null }], calcType: "RELATIVE_RANKING", higherIsBetter: null, minPoints: 0, totalElements: 10, customFormula: "" },
  ])

  // Postkast-spetsiifiline olek
  const [pkMode, setPkMode] = useState<"SAME_VALUE" | "DIFFERENT_VALUES" | "DIRECT">("SAME_VALUE")
  const [pkBoxValue, setPkBoxValue] = useState(3)
  const [pkTotalBoxes, setPkTotalBoxes] = useState(10)
  const [pkCategories, setPkCategories] = useState<{ label: string; value: number; total: number }[]>([
    { label: "Postkast", value: 3, total: 10 },
  ])

  useEffect(() => {
    fetch(`/api/competitions/${competitionId}`)
      .then(r => r.json())
      .then(data => {
        const defs: CompDefs = {
          scoringMode: data.scoringMode ?? "PENALTY",
          defaultKPMaxValue: data.defaultKPMaxValue ?? 30,
          defaultPKMaxValue: data.defaultPKMaxValue ?? 30,
          defaultNotPassed: data.defaultNotPassed ?? 40,
          defaultPassedNotDone: data.defaultPassedNotDone ?? 35,
          defaultVastutegevusPenaltyPerLife: data.defaultVastutegevusPenaltyPerLife ?? 30,
          defaultVarustusPenaltyPerItem: data.defaultVarustusPenaltyPerItem ?? 5,
          defaultHilinemineMode: data.defaultHilinemineMode ?? "ONE_TIME",
          defaultHilinemineIntervalMinutes: data.defaultHilinemineIntervalMinutes ?? 1,
          defaultHilineminePenaltyPerInterval: data.defaultHilineminePenaltyPerInterval ?? 1,
          defaultHilinemineMaxPenalty: data.defaultHilinemineMaxPenalty ?? 30,
          defaultCalcType: data.defaultCalcType ?? "RELATIVE_RANKING",
          defaultHigherIsBetter: data.defaultHigherIsBetter ?? false,
          defaultRankingMinPoints: data.defaultRankingMinPoints ?? 0,
        }
        setCompDefs(defs)
        setDirectHigherIsBetter(defs.scoringMode === "PLUS")
        // Rakenda CHECKPOINT vaikeväärtused
        const td = getTypeDefaults("CHECKPOINT", defs)
        setFields(td.fields)
        setExceptions(td.exceptions)
        setCalcType(td.calcType)
        setCustomFormula(td.customFormula)
        setMinPoints(defs.defaultRankingMinPoints)
        setMaxValue(td.maxValue)
        setElementConfig(td.config)

        const copyFromId = new URLSearchParams(window.location.search).get('copyFrom')
        if (copyFromId) {
          fetch(`/api/elements/${copyFromId}`)
            .then(r => r.json())
            .then(el => {
              setName(el.name + " - koopia")
              setCode("")
              setType(el.type)
              setMaxValue(el.maxValue != null ? String(el.maxValue) : "")
              setFields((el.fields ?? []).map((f: { name: string; label: string; type: string; isResultField: boolean; rankingPriority?: number | null; formula?: string; meta?: string; validation?: string }) => {
                let displayAsTime = false
                let fieldHigherIsBetter: boolean | null = null
                try {
                  const m = JSON.parse(f.meta ?? "{}")
                  displayAsTime = m.displayAs === "TIME"
                  if (typeof m.higherIsBetter === "boolean") fieldHigherIsBetter = m.higherIsBetter
                } catch {}
                const rankingPriority = f.rankingPriority ?? (f.isResultField ? 1 : null)
                return { name: f.name, label: f.label, type: f.type, rankingPriority, formula: f.formula ?? "", displayAsTime, validation: parseValidation(f.validation), fieldHigherIsBetter }
              }))
              setExceptions((el.exceptions ?? []).map((ex: { label: string; penalty: number }) => ({
                label: ex.label, penalty: String(ex.penalty),
              })))
              if (el.calcMethod) {
                setCalcType(el.calcMethod.type)
                setCustomFormula(el.calcMethod.customFormula ?? "")
                try {
                  const p = JSON.parse(el.calcMethod.params)
                  setMinPoints(p.minPoints ?? 0)
                  if (Array.isArray(p.fixedPoints)) setFixedPoints(p.fixedPoints.map(String))
                  if (p.totalElements != null) setTotalElements(p.totalElements)
                  if (typeof p.higherIsBetter === "boolean") {
                    setFields(prev => prev.map(f =>
                      f.rankingPriority === 1 && f.fieldHigherIsBetter === null
                        ? { ...f, fieldHigherIsBetter: p.higherIsBetter }
                        : f
                    ))
                  }
                } catch {}
              }
              const formula = el.calcMethod?.customFormula ?? ""
              if (el.type === "COUNTER_ACTION") {
                const m = formula.match(/result\s*\*\s*([\d.]+)/)
                const penaltyPerLife = m ? Number(m[1]) : defs.defaultVastutegevusPenaltyPerLife
                setElementConfig({ penaltyPerLife })
              } else if (el.type === "EQUIPMENT_CHECK") {
                const m = formula.match(/result\s*\*\s*([\d.]+)/)
                const penaltyPerItem = m ? Number(m[1]) : defs.defaultVarustusPenaltyPerItem
                setElementConfig({ penaltyPerItem })
              } else if (el.type === "LATENESS") {
                if (formula.includes("floor")) {
                  const iv = formula.match(/result\s*\/\s*([\d.]+)/)
                  const pp = formula.match(/\)\s*\*\s*([\d.]+)/)
                  const mp = formula.match(/,\s*([\d.]+)\s*\)$/)
                  setElementConfig({ mode: "PER_INTERVAL", intervalMinutes: iv ? Number(iv[1]) : 1, penaltyPerInterval: pp ? Number(pp[1]) : 1, maxPenalty: mp ? Number(mp[1]) : 30 })
                } else {
                  setElementConfig({ mode: "ONE_TIME" })
                }
              } else {
                setElementConfig(el.config ?? {})
              }
              const loadedSections = el.sections ?? []
              setSections(loadedSections)
              if (loadedSections.length > 0 && !el.calcMethod) setCalcType("COMBINED")
            })
        }
      })
  }, [competitionId])

  function handleTypeChange(newType: string) {
    if (!compDefs) return
    setType(newType)
    const td = getTypeDefaults(newType, compDefs)
    setFields(td.fields)
    setExceptions(td.exceptions)
    setCalcType(td.calcType)
    setCustomFormula(td.customFormula)
    setMinPoints(compDefs?.defaultRankingMinPoints ?? 0)
    setMaxValue(td.maxValue)
    setElementConfig(td.config)
  }

  function addSection() {
    setSections([...sections, { id: crypto.randomUUID(), name: "", maxValue: "", fields: [{ name: "", label: "", type: "NUMBER", rankingPriority: 1, formula: "", displayAsTime: false, validation: {}, fieldHigherIsBetter: null }], calcType: "RELATIVE_RANKING", higherIsBetter: null, minPoints: 0, totalElements: 10, customFormula: "" }])
  }

  function updateSection(si: number, key: keyof SectionRow, val: unknown) {
    const upd = [...sections]
    upd[si] = { ...upd[si], [key]: val }
    setSections(upd)
  }

  function updateSectionField(si: number, fi: number, key: keyof FieldRow, val: string | boolean | number | null) {
    const updSections = [...sections]
    const updFields = [...updSections[si].fields]
    updFields[fi] = { ...updFields[fi], [key]: val }
    if (key === "rankingPriority" && val === 1) {
      updFields.forEach((f, idx) => { if (idx !== fi && f.rankingPriority === 1) f.rankingPriority = null })
    }
    updSections[si] = { ...updSections[si], fields: updFields }
    setSections(updSections)
  }

  function addField() {
    setFields([...fields, { name: "", label: "", type: "NUMBER", rankingPriority: null, formula: "", displayAsTime: false, validation: {}, fieldHigherIsBetter: null }])
  }

  function moveField(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= fields.length) return
    const updated = [...fields]
    ;[updated[i], updated[j]] = [updated[j], updated[i]]
    setFields(updated)
  }

  function updateField(i: number, key: keyof FieldRow, val: string | boolean | number | null | FieldValidation) {
    const updated = [...fields]
    updated[i] = { ...updated[i], [key]: val }
    if (key === "rankingPriority" && val === 1) {
      updated.forEach((f, idx) => { if (idx !== i && f.rankingPriority === 1) f.rankingPriority = null })
    }
    setFields(updated)
  }

  function addException() {
    setExceptions([...exceptions, { label: "", penalty: "0" }])
  }

  function updateException(i: number, key: keyof ExceptionRow, val: string) {
    const updated = [...exceptions]
    updated[i] = { ...updated[i], [key]: val }
    setExceptions(updated)
  }

  function buildPKFieldsAndConfig() {
    if (pkMode === "SAME_VALUE") {
      const max = pkBoxValue * pkTotalBoxes
      return {
        fields: [
          { name: "labituid", label: `Läbitud PK arv (max ${pkTotalBoxes})`, type: "NUMBER", isResultField: false, rankingPriority: null, order: 0 },
          { name: "punktid", label: "Punktid", type: "COMPUTED", isResultField: true, rankingPriority: 1, order: 1, formula: `labituid * ${pkBoxValue}` },
        ],
        config: { boxMode: "SAME_VALUE", boxValue: pkBoxValue, totalBoxes: pkTotalBoxes },
        maxValue: max,
        calcMethod: { type: "ABSOLUTE_POINTS", params: { higherIsBetter: true }, customFormula: undefined },
      }
    }
    if (pkMode === "DIFFERENT_VALUES") {
      const catFields = pkCategories.map((c, i) => ({
        name: `kat_${i}`, label: `${c.label} (max ${c.total})`, type: "NUMBER", isResultField: false, rankingPriority: null, order: i,
      }))
      const formula = pkCategories.map((c, i) => `kat_${i} * ${c.value}`).join(" + ")
      const max = pkCategories.reduce((s, c) => s + c.value * c.total, 0)
      return {
        fields: [
          ...catFields,
          { name: "punktid", label: "Punktid kokku", type: "COMPUTED", isResultField: true, rankingPriority: 1, order: pkCategories.length, formula },
        ],
        config: { boxMode: "DIFFERENT_VALUES", categories: pkCategories },
        maxValue: max,
        calcMethod: { type: "ABSOLUTE_POINTS", params: { higherIsBetter: true }, customFormula: undefined },
      }
    }
    // DIRECT
    return {
      fields: [
        { name: "punktid", label: "Punktid kokku", type: "NUMBER", isResultField: true, rankingPriority: 1, order: 0 },
      ],
      config: { boxMode: "DIRECT" },
      maxValue: maxValue !== "" ? Number(maxValue) : null,
      calcMethod: { type: "ABSOLUTE_POINTS", params: { higherIsBetter: true }, customFormula: undefined },
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")

    const pkOverride = type === "PENALTY_BOX" ? buildPKFieldsAndConfig() : null
    const isCombined = isCombinedMode
    const isDirectEntry = calcType === "DIRECT_ENTRY"

    // Kontrolli et kõikidel väljadel on nimi ja kuvamisnimi
    if (!isCombined && !pkOverride && !isDirectEntry) {
      const badField = fields.find(f => !f.name.trim() || !f.label.trim())
      if (badField) {
        setError(`Väljal on ${!badField.name.trim() ? "masinloetav nimi" : "kuvamisnimi"} puudu.`)
        setLoading(false)
        return
      }
    }

    const needsDirection = !isCombined && !pkOverride && type !== "OTHER" &&
      ["RELATIVE_RANKING", "FIXED_RANKING", "VALUE_BASED"].includes(calcType)
    if (needsDirection) {
      const unsetRanked = fields.filter(f => f.rankingPriority != null && f.fieldHigherIsBetter === null)
      if (unsetRanked.length > 0) {
        setError(`Väljal "${unsetRanked[0].label || unsetRanked[0].name}" on suund valimata.`)
        setLoading(false)
        return
      }
    }
    if (isCombined) {
      const unset = sections.find(s => ["RELATIVE_RANKING", "FIXED_RANKING", "VALUE_BASED"].includes(s.calcType) && s.higherIsBetter === null)
      if (unset) {
        setError(`Osas "${unset.name || "nimetu"}" on suund valimata.`)
        setLoading(false)
        return
      }
    }

    const body = {
      name, code, type,
      directPointsEntry: isDirectEntry ? true : undefined,
      maxValue: isCombined ? null : (pkOverride ? pkOverride.maxValue : (maxValue !== "" ? Number(maxValue) : null)),
      config: pkOverride ? pkOverride.config : elementConfig,
      fields: isCombined ? [] : (pkOverride ? pkOverride.fields : isDirectEntry ? [
        { name: "tulemus", label: "Tulemus", type: "NUMBER", isResultField: true, rankingPriority: 1, order: 0, meta: JSON.stringify({ higherIsBetter: directHigherIsBetter }) },
      ] : fields.map((f, i) => ({
        name: f.name, label: f.label, type: f.type,
        isResultField: f.rankingPriority === 1, rankingPriority: f.rankingPriority,
        order: i,
        formula: f.type === "COMPUTED" ? f.formula : undefined,
        meta: (() => {
          const m: Record<string, unknown> = {}
          if (f.type === "COMPUTED" && f.displayAsTime) m.displayAs = "TIME"
          if (f.rankingPriority != null && typeof f.fieldHigherIsBetter === "boolean") m.higherIsBetter = f.fieldHigherIsBetter
          return Object.keys(m).length > 0 ? JSON.stringify(m) : undefined
        })(),
        validation: f.validation && Object.keys(f.validation).length ? f.validation : undefined,
      }))),
      exceptions: exceptions.map((ex, i) => ({
        label: ex.label, penalty: parseFloat(ex.penalty), order: i,
      })),
      calcMethod: isCombined ? undefined : ((type === "OTHER" || type === "ABANDONMENT") ? undefined : pkOverride ? pkOverride.calcMethod : isDirectEntry ? { type: "DIRECT_ENTRY", params: { higherIsBetter: directHigherIsBetter }, customFormula: undefined } : (() => {
        const primaryDir = fields.find(f => f.rankingPriority === 1)?.fieldHigherIsBetter ?? false
        return {
        type: calcType,
        params:
          calcType === "RELATIVE_RANKING" ? { higherIsBetter: primaryDir, minPoints } :
          calcType === "FIXED_RANKING" ? { higherIsBetter: primaryDir, fixedPoints: fixedPoints.map(Number), minPoints } :
          calcType === "VALUE_BASED" ? { higherIsBetter: primaryDir, minPoints } :
          calcType === "PERFORMANCE_BASED" ? { totalElements } :
          { higherIsBetter: primaryDir },
        customFormula: (calcType === "CUSTOM" || calcType === "ABSOLUTE_PENALTY") ? customFormula : undefined,
        }
      })()),
      sections: isCombined ? sections.map(s => ({
        name: s.name,
        maxValue: s.maxValue !== "" ? Number(s.maxValue) : null,
        fields: s.fields.filter(f => f.name && f.label).map((f, i) => ({
          name: f.name, label: f.label, type: f.type,
          isResultField: f.rankingPriority === 1, rankingPriority: f.rankingPriority,
          order: i,
          meta: (s.calcType === "DIRECT_ENTRY" && f.rankingPriority === 1) ? JSON.stringify({ higherIsBetter: s.higherIsBetter ?? false }) : undefined,
        })),
        calcMethod: {
          type: s.calcType,
          params:
            s.calcType === "RELATIVE_RANKING" || s.calcType === "VALUE_BASED"
              ? { higherIsBetter: s.higherIsBetter ?? false, minPoints: s.minPoints }
              : s.calcType === "ABSOLUTE_POINTS"
              ? { higherIsBetter: true }
              : s.calcType === "DIRECT_ENTRY"
              ? { higherIsBetter: s.higherIsBetter ?? false }
              : s.calcType === "PERFORMANCE_BASED"
              ? { totalElements: s.totalElements }
              : {},
          customFormula: (s.calcType === "CUSTOM" || s.calcType === "ABSOLUTE_PENALTY") ? s.customFormula : null,
        },
      })) : undefined,
    }

    const res = await fetch(`/api/competitions/${competitionId}/elements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    if (res.ok) {
      router.push(`/dashboard/competitions/${competitionId}`)
    } else {
      try {
        const data = await res.json()
        setError(data.error ?? "Salvestamine ebaõnnestus")
      } catch {
        setError("Salvestamine ebaõnnestus (serveri viga)")
      }
      setLoading(false)
    }
  }

  const isSpecialType = ["COUNTER_ACTION", "EQUIPMENT_CHECK", "LATENESS"].includes(type)
  const isMiscType = type === "OTHER" || type === "ABANDONMENT"
  const canCombine = !isSpecialType && !isMiscType && type !== "PENALTY_BOX"
  const isCombinedMode = calcType === "COMBINED" && canCombine

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/dashboard/competitions/${competitionId}`} className="text-gray-400 hover:text-gray-600 text-sm">
          ← Tagasi
        </Link>
        <h1 className="text-xl font-bold text-gray-900">Lisa hindamiselement</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Põhiandmed */}
        <div className="bg-white border rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">Põhiandmed</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nimi *</label>
              <input type="text" required value={name} onChange={e => setName(e.target.value)}
                placeholder="KP 1 Politsei"
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tähis *</label>
              <input type="text" required value={code} onChange={e => setCode(e.target.value)}
                placeholder="1"
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {/* Tüüp */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Tüüp</label>
            <div className="grid grid-cols-2 gap-2">
              {ELEMENT_TYPES.map(et => (
                <label key={et.value} className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors ${type === et.value ? "border-blue-500 bg-blue-50" : "hover:bg-gray-50"}`}>
                  <input type="radio" name="elementType" value={et.value}
                    checked={type === et.value} onChange={() => handleTypeChange(et.value)}
                    className="accent-blue-600" />
                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${et.color}`}>{et.badge}</span>
                  <span className="text-sm text-gray-700">{et.label.split(" – ")[1] ?? et.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Maksimumpunktid (ainult KP/PK jaoks) */}
          {(type === "CHECKPOINT" || type === "PENALTY_BOX") && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Maksimumpunktid
                <span className="ml-1 text-xs font-normal text-gray-400">
                  (tühi = vaikimisi {type === "PENALTY_BOX" ? compDefs?.defaultPKMaxValue : compDefs?.defaultKPMaxValue}p)
                </span>
              </label>
              <input type="number" min={0} step={0.5} value={maxValue}
                onChange={e => setMaxValue(e.target.value)}
                placeholder={String(type === "PENALTY_BOX" ? compDefs?.defaultPKMaxValue ?? 30 : compDefs?.defaultKPMaxValue ?? 30)}
                onFocus={e => e.target.select()}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          )}
        </div>

        {/* Vastutegevuse seaded */}
        {type === "COUNTER_ACTION" && (
          <div className="bg-white border rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium bg-red-100 text-red-700 px-2 py-0.5 rounded">VT</span>
              <h2 className="font-semibold text-gray-900">Vastutegevuse seaded</h2>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Karistus elu kaotamise eest (p)</label>
                <input type="number" min={0} step={0.5}
                  value={(elementConfig.penaltyPerLife as number) ?? compDefs?.defaultVastutegevusPenaltyPerLife ?? 30}
                  onChange={e => {
                    const v = Number(e.target.value)
                    setElementConfig({ penaltyPerLife: v })
                    setCustomFormula(`result * ${v}`)
                  }}
                  onFocus={e => e.target.select()}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
              Kohtunik sisestab: kaotatud elude arv. Karistus = elud × {(elementConfig.penaltyPerLife as number) ?? 30}p
            </p>
          </div>
        )}

        {/* Varustuse seaded */}
        {type === "EQUIPMENT_CHECK" && (
          <div className="bg-white border rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">VA</span>
              <h2 className="font-semibold text-gray-900">Varustuskontrolli seaded</h2>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Karistus puuduoleva eseme eest (p)</label>
                <input type="number" min={0} step={0.5}
                  value={(elementConfig.penaltyPerItem as number) ?? compDefs?.defaultVarustusPenaltyPerItem ?? 5}
                  onChange={e => {
                    const v = Number(e.target.value)
                    setElementConfig({ penaltyPerItem: v })
                    setCustomFormula(`result * ${v}`)
                  }}
                  onFocus={e => e.target.select()}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
              Kohtunik sisestab: puuduolevate esemete arv. Karistus = esemed × {(elementConfig.penaltyPerItem as number) ?? 5}p
            </p>
          </div>
        )}

        {/* Hilinemise seaded */}
        {type === "LATENESS" && (
          <div className="bg-white border rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium bg-purple-100 text-purple-700 px-2 py-0.5 rounded">HL</span>
              <h2 className="font-semibold text-gray-900">Hilinemise seaded</h2>
            </div>
            <div className="space-y-2">
              <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer ${elementConfig.mode === "ONE_TIME" ? "border-blue-500 bg-blue-50" : "hover:bg-gray-50"}`}>
                <input type="radio" name="latenessMode" value="ONE_TIME"
                  checked={elementConfig.mode === "ONE_TIME"}
                  onChange={() => {
                    const defs2 = compDefs!
                    setElementConfig({ mode: "ONE_TIME" })
                    setFields([])
                    setExceptions([{ label: "Hilines", penalty: String(defs2.defaultPassedNotDone) }])
                    setCalcType("RELATIVE_RANKING")
                    setCustomFormula("")
                  }}
                  className="mt-0.5 accent-blue-600" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Ühekordne</p>
                  <p className="text-xs text-gray-500">Hilinenud võistkond saab fikseeritud karistuse.</p>
                </div>
              </label>
              <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer ${elementConfig.mode === "PER_INTERVAL" ? "border-blue-500 bg-blue-50" : "hover:bg-gray-50"}`}>
                <input type="radio" name="latenessMode" value="PER_INTERVAL"
                  checked={elementConfig.mode === "PER_INTERVAL"}
                  onChange={() => {
                    const defs2 = compDefs!
                    const cfg = {
                      mode: "PER_INTERVAL",
                      intervalMinutes: defs2.defaultHilinemineIntervalMinutes,
                      penaltyPerInterval: defs2.defaultHilineminePenaltyPerInterval,
                      maxPenalty: defs2.defaultHilinemineMaxPenalty,
                    }
                    setElementConfig(cfg)
                    setFields([{ name: "minutid", label: "Hilinenud minuteid", type: "NUMBER", rankingPriority: 1, formula: "", displayAsTime: false, validation: {}, fieldHigherIsBetter: null }])
                    setExceptions([])
                    setCalcType("ABSOLUTE_PENALTY")
                    setCustomFormula(`min(floor(result / ${cfg.intervalMinutes}) * ${cfg.penaltyPerInterval}, ${cfg.maxPenalty})`)
                  }}
                  className="mt-0.5 accent-blue-600" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Minutipõhine</p>
                  <p className="text-xs text-gray-500">Kohtunik sisestab hilinenud minutid, arvutatakse vastavalt intervallidele.</p>
                </div>
              </label>
            </div>

            {elementConfig.mode === "ONE_TIME" && (
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Hilinemise karistus (p)</label>
                <input type="number" min={0} step={0.5}
                  value={exceptions[0]?.penalty ?? compDefs?.defaultPassedNotDone ?? 35}
                  onChange={e => setExceptions([{ label: "Hilines", penalty: e.target.value }])}
                  onFocus={e => e.target.select()}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            )}

            {elementConfig.mode === "PER_INTERVAL" && (
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Intervall (min)</label>
                  <input type="number" min={1} step={1}
                    value={(elementConfig.intervalMinutes as number) ?? 1}
                    onChange={e => {
                      const iv = Number(e.target.value)
                      const pp = (elementConfig.penaltyPerInterval as number) ?? 1
                      const mp = (elementConfig.maxPenalty as number) ?? 30
                      setElementConfig({ ...elementConfig, intervalMinutes: iv })
                      setCustomFormula(`min(floor(result / ${iv}) * ${pp}, ${mp})`)
                    }}
                    onFocus={e => e.target.select()}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Karistus intervallis (p)</label>
                  <input type="number" min={0} step={0.5}
                    value={(elementConfig.penaltyPerInterval as number) ?? 1}
                    onChange={e => {
                      const pp = Number(e.target.value)
                      const iv = (elementConfig.intervalMinutes as number) ?? 1
                      const mp = (elementConfig.maxPenalty as number) ?? 30
                      setElementConfig({ ...elementConfig, penaltyPerInterval: pp })
                      setCustomFormula(`min(floor(result / ${iv}) * ${pp}, ${mp})`)
                    }}
                    onFocus={e => e.target.select()}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Maksimaalne karistus (p)</label>
                  <input type="number" min={0} step={0.5}
                    value={(elementConfig.maxPenalty as number) ?? 30}
                    onChange={e => {
                      const mp = Number(e.target.value)
                      const iv = (elementConfig.intervalMinutes as number) ?? 1
                      const pp = (elementConfig.penaltyPerInterval as number) ?? 1
                      setElementConfig({ ...elementConfig, maxPenalty: mp })
                      setCustomFormula(`min(floor(result / ${iv}) * ${pp}, ${mp})`)
                    }}
                    onFocus={e => e.target.select()}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
            )}

            {elementConfig.mode === "PER_INTERVAL" && (
              <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
                Valem: iga {elementConfig.intervalMinutes as number} min = {elementConfig.penaltyPerInterval as number}p, max {elementConfig.maxPenalty as number}p
              </p>
            )}
          </div>
        )}

        {/* Postkasti konfiguratsioon */}
        {type === "PENALTY_BOX" && (
          <div className="bg-white border rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium bg-orange-100 text-orange-700 px-2 py-0.5 rounded">PK</span>
              <h2 className="font-semibold text-gray-900">Postkasti režiim</h2>
            </div>
            <div className="space-y-2">
              {([
                { value: "SAME_VALUE", label: "Ühesuguse väärtusega", desc: "Kõigil postkastidel sama punktiväärtus. Sisestatakse läbitud postkastide arv." },
                { value: "DIFFERENT_VALUES", label: "Erineva väärtusega", desc: "Defineeri postkastide kategooriad eri väärtustega. Sisestatakse iga kategooria läbitud arv." },
                { value: "DIRECT", label: "Otsene punktisumma", desc: "Sisestatakse kogupunktid otse ühekordse arvuna." },
              ] as const).map(opt => (
                <label key={opt.value} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer ${pkMode === opt.value ? "border-orange-400 bg-orange-50" : "hover:bg-gray-50"}`}>
                  <input type="radio" name="pkMode" value={opt.value} checked={pkMode === opt.value}
                    onChange={() => setPkMode(opt.value)} className="mt-0.5 accent-orange-500" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{opt.label}</p>
                    <p className="text-xs text-gray-500">{opt.desc}</p>
                  </div>
                </label>
              ))}
            </div>

            {pkMode === "SAME_VALUE" && (
              <div className="grid grid-cols-2 gap-4 pt-1 border-t">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Väärtus PK kohta (p)</label>
                  <input type="number" min={0} step={0.5} value={pkBoxValue}
                    onChange={e => { setPkBoxValue(Number(e.target.value)); setMaxValue(String(Number(e.target.value) * pkTotalBoxes)) }}
                    onFocus={e => e.target.select()}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">PK koguarv</label>
                  <input type="number" min={1} step={1} value={pkTotalBoxes}
                    onChange={e => { setPkTotalBoxes(Number(e.target.value)); setMaxValue(String(pkBoxValue * Number(e.target.value))) }}
                    onFocus={e => e.target.select()}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                </div>
                <p className="text-xs text-gray-400 col-span-2">Maksimaalne punktisumma: {pkBoxValue * pkTotalBoxes}p</p>
              </div>
            )}

            {pkMode === "DIFFERENT_VALUES" && (
              <div className="space-y-3 pt-1 border-t">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500">Postkasti kategooriad</p>
                  <button type="button"
                    onClick={() => setPkCategories([...pkCategories, { label: "Postkast", value: 3, total: 5 }])}
                    className="text-xs text-orange-600 hover:text-orange-700 font-medium">+ Lisa kategooria</button>
                </div>
                {pkCategories.map((cat, i) => (
                  <div key={i} className="grid grid-cols-3 gap-2 items-end">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Nimetus</label>
                      <input type="text" value={cat.label}
                        onChange={e => { const u = [...pkCategories]; u[i] = { ...u[i], label: e.target.value }; setPkCategories(u) }}
                        className="w-full px-2 py-1.5 border rounded text-sm focus:outline-none focus:ring-1 focus:ring-orange-400" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Väärtus (p/tk)</label>
                      <input type="number" min={0} step={0.5} value={cat.value}
                        onChange={e => { const u = [...pkCategories]; u[i] = { ...u[i], value: Number(e.target.value) }; setPkCategories(u) }}
                        onFocus={e => e.target.select()}
                    className="w-full px-2 py-1.5 border rounded text-sm focus:outline-none focus:ring-1 focus:ring-orange-400" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Koguarv</label>
                      <div className="flex gap-1">
                        <input type="number" min={0} step={1} value={cat.total}
                          onChange={e => { const u = [...pkCategories]; u[i] = { ...u[i], total: Number(e.target.value) }; setPkCategories(u) }}
                          onFocus={e => e.target.select()}
                    className="flex-1 px-2 py-1.5 border rounded text-sm focus:outline-none focus:ring-1 focus:ring-orange-400" />
                        {pkCategories.length > 1 && (
                          <button type="button" onClick={() => setPkCategories(pkCategories.filter((_, idx) => idx !== i))}
                            className="text-red-400 hover:text-red-600 px-1">✕</button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                <p className="text-xs text-gray-400">Maksimaalne punktisumma: {pkCategories.reduce((s, c) => s + c.value * c.total, 0)}p</p>
              </div>
            )}

            {pkMode === "DIRECT" && (
              <div className="pt-1 border-t">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Maksimaalne punktisumma (p)</label>
                  <input type="number" min={0} step={0.5} value={maxValue}
                    onChange={e => setMaxValue(e.target.value)}
                    placeholder={String(compDefs?.defaultPKMaxValue ?? 30)}
                    onFocus={e => e.target.select()}
                    className="w-32 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                </div>
                <p className="text-xs text-gray-400 mt-2">Kohtunik sisestab kogupunktid otse (ühekordne arv).</p>
              </div>
            )}
          </div>
        )}

        {/* Muu elemendi info */}
        {type === "OTHER" && (
          <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
            <p className="text-sm font-medium text-teal-800 mb-1">Muu element</p>
            <p className="text-xs text-teal-700">
              Siin saab lisada ettenägematuid kirjeid (nt trahvid, lisapunktid jms). Kirjeid hallatakse elemendi lehel pärast loomist — igale võistkonnale saab lisada mitu kirjet koos selgitusega ja punktidega.
            </p>
          </div>
        )}

        {/* Katkestamise seaded */}
        {type === "ABANDONMENT" && (
          <div className="bg-white border rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium bg-rose-100 text-rose-700 px-2 py-0.5 rounded">KT</span>
              <h2 className="font-semibold text-gray-900">Katkestamise seaded</h2>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Karistuse süsteem</label>
              <select value={(elementConfig.mode as string) ?? "FIXED"}
                onChange={e => setElementConfig({ ...elementConfig, mode: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500">
                <option value="FIXED">Fikseeritud väärtus iga liikme kohta</option>
                <option value="CUSTOM">Käsitsi määratav väärtus iga katkestamise kohta</option>
              </select>
            </div>
            {((elementConfig.mode as string) ?? "FIXED") === "FIXED" && (
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Karistus ühe liikme katkestamise eest (p)</label>
                <input type="number" min={0} step={0.5}
                  value={(elementConfig.penaltyPerMember as number) ?? 10}
                  onChange={e => setElementConfig({ ...elementConfig, penaltyPerMember: Number(e.target.value) })}
                  onFocus={e => e.target.select()}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500" />
              </div>
            )}
            <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
              Katkestamisi hallatakse elemendi lehel pärast loomist — saab märkida üksikuid liikmeid või kogu võistkonna katkestanuks. Annab ainult karistuspunktid (ei muuda automaatselt staatust).
            </p>
          </div>
        )}

        {/* Arvutusmeetod enne, sisendväljad pärast (flex-col-reverse pöörab järjekorra) */}
        <div className="flex flex-col-reverse gap-6">
        {/* Sisendväljad (ainult tavaliste tüüpide jaoks, mitte PK/OTHER/DIRECT_ENTRY) */}
        {!isSpecialType && !isMiscType && type !== "PENALTY_BOX" && calcType !== "DIRECT_ENTRY" && (
          <div className="bg-white border rounded-xl p-5 space-y-4">
            <h2 className="font-semibold text-gray-900">Sisendväljad</h2>
            <p className="text-xs text-gray-500">Märgi ära, milline väli läheb rankingusse (tulemusväli).</p>
            {fields.map((f, i) => (
              <div key={i} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-1 mb-1">
                  <span className="text-xs text-gray-400 font-medium w-5">{i + 1}.</span>
                  <div className="flex flex-col gap-0.5">
                    <button type="button" onClick={() => moveField(i, -1)} disabled={i === 0}
                      className="text-gray-300 hover:text-gray-600 disabled:opacity-20 leading-none text-xs px-1">▲</button>
                    <button type="button" onClick={() => moveField(i, 1)} disabled={i === fields.length - 1}
                      className="text-gray-300 hover:text-gray-600 disabled:opacity-20 leading-none text-xs px-1">▼</button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500">Nimi (masinloetav)</label>
                    <input type="text" value={f.name} onChange={e => updateField(i, "name", e.target.value)}
                      className={`w-full px-2 py-1.5 border rounded text-sm mt-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500 ${!f.name.trim() ? "border-red-400 bg-red-50" : ""}`} />
                    {!f.name.trim() && <p className="text-xs text-red-500 mt-0.5">Kohustuslik</p>}
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Kuvamisnimi</label>
                    <input type="text" value={f.label} onChange={e => updateField(i, "label", e.target.value)}
                      className={`w-full px-2 py-1.5 border rounded text-sm mt-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500 ${!f.label.trim() ? "border-red-400 bg-red-50" : ""}`} />
                    {!f.label.trim() && <p className="text-xs text-red-500 mt-0.5">Kohustuslik</p>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <select value={f.type} onChange={e => updateField(i, "type", e.target.value)}
                    className="px-2 py-1.5 border rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
                    {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <select
                    value={f.rankingPriority ?? ""}
                    onChange={e => updateField(i, "rankingPriority", e.target.value === "" ? null : Number(e.target.value))}
                    className="px-2 py-1.5 border rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
                    <option value="">Ei osale</option>
                    <option value="1">1. (esmane)</option>
                    <option value="2">2. (viik)</option>
                    <option value="3">3. (viik)</option>
                    <option value="4">4. (viik)</option>
                    <option value="5">5. (viik)</option>
                  </select>
                  <button type="button" onClick={() => setFields(fields.filter((_, idx) => idx !== i))}
                    className="ml-auto text-red-400 hover:text-red-600 text-sm">✕</button>
                </div>
                {f.rankingPriority != null && ["RELATIVE_RANKING", "FIXED_RANKING", "VALUE_BASED"].includes(calcType) && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 shrink-0">Suund:</span>
                    <div className="flex rounded border overflow-hidden text-xs">
                      <button type="button" onClick={() => updateField(i, "fieldHigherIsBetter", false)}
                        className={`px-2.5 py-1 transition-colors ${f.fieldHigherIsBetter === false ? "bg-blue-600 text-white font-medium" : "text-gray-500 hover:bg-gray-50"}`}>
                        ↓ Väiksem tulemus = parem koht
                      </button>
                      <button type="button" onClick={() => updateField(i, "fieldHigherIsBetter", true)}
                        className={`px-2.5 py-1 border-l transition-colors ${f.fieldHigherIsBetter === true ? "bg-blue-600 text-white font-medium" : "text-gray-500 hover:bg-gray-50"}`}>
                        ↑ Suurem tulemus = parem koht
                      </button>
                    </div>
                    {f.fieldHigherIsBetter === null && <span className="text-xs text-amber-600">Kohustuslik</span>}
                  </div>
                )}
                {f.type === "COMPUTED" && (
                  <div className="pt-1 space-y-2">
                    <label className="text-xs text-gray-500 mb-2 block">Valem</label>
                    <FormulaInput
                      value={f.formula}
                      onChange={v => updateField(i, "formula", v)}
                      availableFields={fields.filter((_, idx) => idx !== i)}
                    />
                    <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer pt-1">
                      <input type="checkbox" checked={f.displayAsTime}
                        onChange={e => updateField(i, "displayAsTime", e.target.checked)}
                        className="accent-blue-600" />
                      Kuva tulemus ajana (h:mm:ss) — tulemus peab olema sekundites
                    </label>
                  </div>
                )}
                {f.type !== "COMPUTED" && (
                  <FieldValidationEditor
                    fieldType={f.type}
                    validation={f.validation}
                    onChange={v => updateField(i, "validation", v)}
                  />
                )}
              </div>
            ))}
            <button type="button" onClick={addField}
              className="w-full text-sm text-blue-600 hover:text-blue-700 font-medium border border-dashed border-blue-300 hover:border-blue-400 rounded-lg py-2 transition-colors">
              + Lisa väli
            </button>
          </div>
        )}

        {/* Arvutusmeetod */}
        {!isSpecialType && !isMiscType && type !== "PENALTY_BOX" && (
          <div className="bg-white border rounded-xl p-5 space-y-4">
            <h2 className="font-semibold text-gray-900">Arvutusmeetod</h2>
            <div className="space-y-2">
              {CALC_TYPES.filter(ct => ct.value !== "COMBINED" || canCombine).map(ct => (
                <label key={ct.value} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${calcType === ct.value ? "border-blue-500 bg-blue-50" : "hover:bg-gray-50"}`}>
                  <input type="radio" name="calcType" value={ct.value}
                    checked={calcType === ct.value} onChange={() => setCalcType(ct.value)}
                    className="mt-0.5 accent-blue-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{ct.label}</p>
                    <p className="text-xs text-gray-500">{ct.desc}</p>
                  </div>
                </label>
              ))}
            </div>
            {(calcType === "RELATIVE_RANKING" || calcType === "VALUE_BASED") && (
              <div className="space-y-3 pt-1">
                <div className="grid grid-cols-2 gap-3 border-t pt-3">
                  {compDefs?.scoringMode === "PENALTY" ? (
                    <>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Parima tulemus (p)</label>
                        <input type="number" min={0} step={0.5} value={minPoints}
                          onChange={e => setMinPoints(Number(e.target.value))} onFocus={e => e.target.select()}
                          className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Halvima tulemus (p)</label>
                        <input type="number" min={0} step={0.5}
                          value={maxValue !== "" ? maxValue : (compDefs?.defaultKPMaxValue ?? 30)}
                          onChange={e => setMaxValue(e.target.value)} onFocus={e => e.target.select()}
                          className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Parima tulemus (p)</label>
                        <input type="number" min={0} step={0.5}
                          value={maxValue !== "" ? maxValue : (compDefs?.defaultKPMaxValue ?? 30)}
                          onChange={e => setMaxValue(e.target.value)} onFocus={e => e.target.select()}
                          className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Halvima tulemus (p)</label>
                        <input type="number" min={0} step={0.5} value={minPoints}
                          onChange={e => setMinPoints(Number(e.target.value))} onFocus={e => e.target.select()}
                          className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
            {calcType === "FIXED_RANKING" && (
              <div className="space-y-3 pt-1">
                <div className="border-t pt-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-gray-500">Punktid kohade kaupa</label>
                    <button type="button" onClick={() => setFixedPoints([...fixedPoints, ""])}
                      className="text-xs text-blue-600 hover:text-blue-700">+ Lisa koht</button>
                  </div>
                  {fixedPoints.map((pts, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 w-12 shrink-0">{i + 1}. koht</span>
                      <input type="number" step={0.5} value={pts}
                        onChange={e => { const upd = [...fixedPoints]; upd[i] = e.target.value; setFixedPoints(upd) }}
                        onFocus={e => e.target.select()}
                        className="flex-1 px-2 py-1.5 border rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      <button type="button" onClick={() => setFixedPoints(fixedPoints.filter((_, idx) => idx !== i))}
                        className="text-red-400 hover:text-red-600 text-sm">✕</button>
                    </div>
                  ))}
                  <div className="flex items-center gap-2 border-t pt-2">
                    <span className="text-xs text-gray-400 w-12 shrink-0">Viimane</span>
                    <input type="number" min={0} step={0.5} value={minPoints}
                      onChange={e => setMinPoints(Number(e.target.value))} onFocus={e => e.target.select()}
                      className="flex-1 px-2 py-1.5 border rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    <span className="text-xs text-gray-400 w-4" />
                  </div>
                  <p className="text-xs text-gray-400">Kohad, millele punkti pole määratud, arvutatakse viimasest fikseeritud väärtusest "Viimane" suunas lineaarselt.</p>
                </div>
              </div>
            )}
            {calcType === "PERFORMANCE_BASED" && (
              <div className="space-y-3 pt-1 border-t">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Õigete elementide koguarv</label>
                  <input type="number" min={1} step={1} value={totalElements}
                    onChange={e => setTotalElements(Number(e.target.value))} onFocus={e => e.target.select()}
                    className="w-32 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <p className="text-xs text-gray-400">
                  Tulemusväljale sisestatakse õigesti sooritatud elementide arv. Iga element annab maxP / {totalElements} punkti.
                </p>
              </div>
            )}
            {calcType === "CUSTOM" && (
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  Valem (muutujad: <code className="bg-gray-100 px-1 rounded">result</code>, <code className="bg-gray-100 px-1 rounded">n</code>, <code className="bg-gray-100 px-1 rounded">rank</code>)
                </label>
                <input type="text" value={customFormula} onChange={e => setCustomFormula(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            )}
            {calcType === "DIRECT_ENTRY" && (
              <div className="space-y-3">
                <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs text-green-800">
                  Kohtunik sisestab arvu otse — positiivne = plussipunktid, negatiivne = karistuspunktid. Sisestatud väärtus läheb tulemusse muutmata.
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Tulemuse suund (parima/halvima kuvamiseks)</label>
                  <select value={directHigherIsBetter ? "true" : "false"} onChange={e => setDirectHigherIsBetter(e.target.value === "true")}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="false">Väiksem on parem</option>
                    <option value="true">Suurem on parem</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">Määrab, kumb suund loetakse paremaks tulemuste analüüsis (parim, halvim, positsioon). Ei mõjuta summat.</p>
                </div>
              </div>
            )}
            {isCombinedMode && (
              <div className="space-y-4 border-t pt-4">
                <p className="text-xs text-gray-500 bg-indigo-50 px-3 py-2 rounded-lg">
                  Iga hindamisosa arvutatakse eraldi arvutusmeetodiga. Lõpptulemus = kõigi osade summa.
                </p>
                {sections.map((s, si) => (
                  <div key={s.id} className="border-2 border-indigo-100 rounded-xl p-4 space-y-3 bg-indigo-50/20">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded">Osa {si + 1}</span>
                      {sections.length > 1 && (
                        <button type="button" onClick={() => setSections(sections.filter((_, idx) => idx !== si))}
                          className="text-xs text-red-400 hover:text-red-600">Eemalda</button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Osa nimi *</label>
                        <input type="text" required={isCombinedMode} value={s.name}
                          onChange={e => updateSection(si, "name", e.target.value)}
                          placeholder="nt Orienteerumine"
                          className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Max punktid</label>
                        <input type="number" min={0} step={0.5} value={s.maxValue}
                          onChange={e => updateSection(si, "maxValue", e.target.value)}
                          onFocus={e => e.target.select()}
                          placeholder="nt 20"
                          className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-gray-600">Sisendväljad</label>
                        <button type="button"
                          onClick={() => updateSection(si, "fields", [...s.fields, { name: "", label: "", type: "NUMBER", rankingPriority: null, formula: "", displayAsTime: false, validation: {}, fieldHigherIsBetter: null }])}
                          className="text-xs text-indigo-600 hover:text-indigo-700">+ Lisa väli</button>
                      </div>
                      {s.fields.map((f, fi) => (
                        <div key={fi} className="grid grid-cols-4 gap-2 items-center">
                          <input type="text" placeholder="nimi" value={f.name}
                            onChange={e => updateSectionField(si, fi, "name", e.target.value)}
                            className="px-2 py-1.5 border rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                          <input type="text" placeholder="kuvamisnimi" value={f.label}
                            onChange={e => updateSectionField(si, fi, "label", e.target.value)}
                            className="px-2 py-1.5 border rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                          <select value={f.type} onChange={e => updateSectionField(si, fi, "type", e.target.value)}
                            className="px-2 py-1.5 border rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400">
                            {FIELD_TYPES.filter(t => t.value !== "COMPUTED").map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                          </select>
                          <div className="flex items-center gap-1">
                            <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
                              <input type="checkbox" checked={f.rankingPriority === 1}
                                onChange={e => updateSectionField(si, fi, "rankingPriority", e.target.checked ? 1 : null)}
                                className="accent-indigo-600" />
                              Tulemus
                            </label>
                            {s.fields.length > 1 && (
                              <button type="button"
                                onClick={() => updateSection(si, "fields", s.fields.filter((_, idx) => idx !== fi))}
                                className="ml-auto text-red-400 hover:text-red-600 text-xs">✕</button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="border-t pt-3 space-y-2">
                      <label className="text-xs font-medium text-gray-600">Arvutusmeetod</label>
                      <select value={s.calcType} onChange={e => updateSection(si, "calcType", e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                        {CALC_TYPES.filter(ct => ct.value !== "COMBINED").map(ct => <option key={ct.value} value={ct.value}>{ct.label}</option>)}
                      </select>
                      {(s.calcType === "RELATIVE_RANKING" || s.calcType === "VALUE_BASED" || s.calcType === "FIXED_RANKING") && (
                        <div className="space-y-2">
                          <div>
                            <p className="text-xs text-gray-500 mb-1">Suund <span className="text-red-500">*</span></p>
                            <div className="flex rounded-lg border overflow-hidden text-xs">
                              <button type="button" onClick={() => updateSection(si, "higherIsBetter", false)}
                                className={`flex-1 py-1.5 px-2 transition-colors ${s.higherIsBetter === false ? "bg-indigo-600 text-white font-medium" : "text-gray-600 hover:bg-gray-50"}`}>
                                ↓ Väiksem tulemus = parem koht
                              </button>
                              <button type="button" onClick={() => updateSection(si, "higherIsBetter", true)}
                                className={`flex-1 py-1.5 px-2 border-l transition-colors ${s.higherIsBetter === true ? "bg-indigo-600 text-white font-medium" : "text-gray-600 hover:bg-gray-50"}`}>
                                ↑ Suurem tulemus = parem koht
                              </button>
                            </div>
                            {s.higherIsBetter === null && <p className="text-xs text-red-500 mt-0.5">Vali tulemusvälja suund</p>}
                          </div>
                          {s.calcType !== "FIXED_RANKING" && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-500">{compDefs?.scoringMode === "PENALTY" ? "Parima p:" : "Halvima p:"}</span>
                              <input type="number" min={0} step={0.5} value={s.minPoints}
                                onChange={e => updateSection(si, "minPoints", Number(e.target.value))}
                                onFocus={e => e.target.select()}
                                className="w-16 px-2 py-1 border rounded text-xs" />
                            </div>
                          )}
                        </div>
                      )}
                      {s.calcType === "PERFORMANCE_BASED" && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">Elementide koguarv:</span>
                          <input type="number" min={1} step={1} value={s.totalElements}
                            onChange={e => updateSection(si, "totalElements", Number(e.target.value))}
                            onFocus={e => e.target.select()}
                            className="w-20 px-2 py-1 border rounded text-xs" />
                          <span className="text-xs text-gray-400">(tulemusväljale sisestatakse õigete arv)</span>
                        </div>
                      )}
                      {s.calcType === "DIRECT_ENTRY" && (
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Tulemuse suund (parima/halvima kuvamiseks)</p>
                          <div className="flex rounded-lg border overflow-hidden text-xs">
                            <button type="button" onClick={() => updateSection(si, "higherIsBetter", false)}
                              className={`flex-1 py-1.5 px-2 transition-colors ${s.higherIsBetter !== true ? "bg-indigo-600 text-white font-medium" : "text-gray-600 hover:bg-gray-50"}`}>
                              ↓ Väiksem = parem
                            </button>
                            <button type="button" onClick={() => updateSection(si, "higherIsBetter", true)}
                              className={`flex-1 py-1.5 px-2 border-l transition-colors ${s.higherIsBetter === true ? "bg-indigo-600 text-white font-medium" : "text-gray-600 hover:bg-gray-50"}`}>
                              ↑ Suurem = parem
                            </button>
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">Mõjutab parima/halvima ja positsiooni kuvamist analüüsis, mitte summat.</p>
                        </div>
                      )}
                      {(s.calcType === "CUSTOM" || s.calcType === "ABSOLUTE_PENALTY") && (
                        <input type="text" value={s.customFormula}
                          onChange={e => updateSection(si, "customFormula", e.target.value)}
                          placeholder="Valem (nt result * 2)"
                          className="w-full px-3 py-2 border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                      )}
                    </div>
                  </div>
                ))}
                <button type="button" onClick={addSection}
                  className="w-full py-2 border-2 border-dashed border-indigo-200 rounded-xl text-sm text-indigo-400 hover:text-indigo-600 hover:border-indigo-400 transition-colors">
                  + Lisa hindamisosa
                </button>
              </div>
            )}
          </div>
        )}
        </div>

        {/* Erandid */}
        {type !== "COUNTER_ACTION" && type !== "EQUIPMENT_CHECK" && type !== "OTHER" && type !== "ABANDONMENT" && type !== "PENALTY_BOX" && !(type === "LATENESS" && elementConfig.mode === "PER_INTERVAL") && (
          <div className="bg-white border rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Erandid</h2>
              <button type="button" onClick={addException}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium">+ Lisa erand</button>
            </div>
            {exceptions.map((ex, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input type="text" value={ex.label} onChange={e => updateException(i, "label", e.target.value)}
                  placeholder="Erand (nt Ei läbinud)"
                  className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                <input type="number" value={ex.penalty} onChange={e => updateException(i, "penalty", e.target.value)}
                  placeholder="Karistus"
                  onFocus={e => e.target.select()}
                    className="w-24 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                <button type="button" onClick={() => setExceptions(exceptions.filter((_, idx) => idx !== i))}
                  className="text-red-400 hover:text-red-600">✕</button>
              </div>
            ))}
          </div>
        )}


        {error && <div className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</div>}

        <button type="submit" disabled={loading}
          className="w-full bg-blue-600 text-white py-2.5 px-4 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
          {loading ? "Salvestan..." : "Salvesta element"}
        </button>
      </form>
    </div>
  )
}
