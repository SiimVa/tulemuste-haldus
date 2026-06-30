"use client"

import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { FormulaInput } from "@/components/FormulaInput"
import { ElementSectionsManager } from "@/components/competition/ElementSectionsManager"
import { FieldValidationEditor } from "@/components/FieldValidationEditor"
import { FieldValidation, parseValidation } from "@/lib/fieldValidation"

type FieldRow = { name: string; label: string; type: string; rankingPriority: number | null; formula: string; displayAsTime: boolean; validation: FieldValidation; fieldHigherIsBetter: boolean | null }
type ExceptionRow = { label: string; penalty: string }
type SectionField = { id: string; name: string; label: string; type: string; isResultField: boolean; rankingPriority: number | null; formula?: string | null }
type SectionCalcMethod = { id: string; type: string; params: string; customFormula?: string | null }
type Section = { id: string; name: string; order: number; maxValue: number | null; fields: SectionField[]; calcMethod: SectionCalcMethod | null }

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
  { value: "ABSOLUTE_POINTS", label: "Absoluutsed punktid (suurem = parem)", desc: "Parim saab 0 karistuspunkti." },
  { value: "CUSTOM", label: "Korraldaja valem", desc: "Kirjuta ise valem (muutujad: result, n, rank)." },
  { value: "COMBINED", label: "Kombineeritud hindamine", desc: "Element koosneb mitmest hindamisosast. Iga osa arvutatakse eraldi, lõpptulemus = osade summa." },
  { value: "DIRECT_ENTRY", label: "Vaba sisestus", desc: "Kohtunik sisestab pluss- või karistuspunktid otse arvuna. Tulemus läheb summasse muutmata." },
]

export default function EditElementPage({ params }: { params: Promise<{ id: string; elementId: string }> }) {
  const { id: competitionId, elementId } = use(params)
  const router = useRouter()

  const [name, setName] = useState("")
  const [code, setCode] = useState("")
  const [type, setType] = useState("CHECKPOINT")
  const [maxValue, setMaxValue] = useState<string>("")
  const [fields, setFields] = useState<FieldRow[]>([])
  const [exceptions, setExceptions] = useState<ExceptionRow[]>([])
  const [calcType, setCalcType] = useState("RELATIVE_RANKING")
  const [customFormula, setCustomFormula] = useState("")
  const [minPoints, setMinPoints] = useState(0)
  const [fixedPoints, setFixedPoints] = useState<string[]>([])
  const [totalElements, setTotalElements] = useState(10)
  const [directPointsEntry, setDirectPointsEntry] = useState(false)
  const [directHigherIsBetter, setDirectHigherIsBetter] = useState(false)
  const [elementConfig, setElementConfig] = useState<Record<string, unknown>>({})
  const [sections, setSections] = useState<Section[]>([])
  const [scoringMode, setScoringMode] = useState<"PENALTY" | "PLUS">("PENALTY")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    fetch(`/api/elements/${elementId}`)
      .then(r => r.json())
      .then(el => {
        setName(el.name)
        setCode(el.code)
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
          label: ex.label,
          penalty: String(ex.penalty),
        })))
        if (el.calcMethod) {
          setCalcType(el.calcMethod.type)
          setCustomFormula(el.calcMethod.customFormula ?? "")
          try {
            const p = JSON.parse(el.calcMethod.params)
            setMinPoints(p.minPoints ?? 0)
            if (Array.isArray(p.fixedPoints)) setFixedPoints(p.fixedPoints.map(String))
            if (p.totalElements != null) setTotalElements(p.totalElements)
            // Tahaühilduvus: kui esmase välja suund pole meta-s, võta calcMethod.params-ist
            if (typeof p.higherIsBetter === "boolean") {
              setFields(prev => prev.map(f =>
                f.rankingPriority === 1 && f.fieldHigherIsBetter === null
                  ? { ...f, fieldHigherIsBetter: p.higherIsBetter }
                  : f
              ))
            }
            if (el.calcMethod.type === "DIRECT_ENTRY") {
              setDirectHigherIsBetter(typeof p.higherIsBetter === "boolean" ? p.higherIsBetter : (el.competition?.scoringMode === "PLUS"))
            }
          } catch { /* ignore */ }
        }
        setDirectPointsEntry(el.directPointsEntry ?? false)
        // Lae elementConfig valemist
        const formula = el.calcMethod?.customFormula ?? ""
        if (el.type === "COUNTER_ACTION") {
          const m = formula.match(/result\s*\*\s*([\d.]+)/)
          const penaltyPerLife = m ? Number(m[1]) : 30
          setElementConfig({ penaltyPerLife })
          if (!formula) setCustomFormula(`result * ${penaltyPerLife}`)
        } else if (el.type === "EQUIPMENT_CHECK") {
          const m = formula.match(/result\s*\*\s*([\d.]+)/)
          const penaltyPerItem = m ? Number(m[1]) : 5
          setElementConfig({ penaltyPerItem })
          if (!formula) setCustomFormula(`result * ${penaltyPerItem}`)
        } else if (el.type === "LATENESS") {
          if (formula.includes("floor")) {
            const iv = formula.match(/result\s*\/\s*([\d.]+)/)
            const pp = formula.match(/\)\s*\*\s*([\d.]+)/)
            const mp = formula.match(/,\s*([\d.]+)\s*\)$/)
            setElementConfig({ mode: "PER_INTERVAL", intervalMinutes: iv ? Number(iv[1]) : 1, penaltyPerInterval: pp ? Number(pp[1]) : 1, maxPenalty: mp ? Number(mp[1]) : 30 })
          } else {
            setElementConfig({ mode: "ONE_TIME" })
          }
        } else if (el.type === "ABANDONMENT") {
          let cfg: { mode?: string; penaltyPerMember?: number } = {}
          try { cfg = JSON.parse(el.config ?? "{}") } catch {}
          setElementConfig({ mode: cfg.mode ?? "FIXED", penaltyPerMember: cfg.penaltyPerMember ?? 10 })
        }
        const loadedSections = el.sections ?? []
        setSections(loadedSections)
        if (loadedSections.length > 0 && !el.calcMethod) setCalcType("COMBINED")
        if (el.competition?.scoringMode) setScoringMode(el.competition.scoringMode)
        setLoading(false)
      })
  }, [elementId])

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
    // Ainult üks väli saab olla 1. prioriteediga (esmane)
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError("")

    const isCombined = calcType === "COMBINED" || sections.length > 0
    const isDirectEntry = calcType === "DIRECT_ENTRY"

    // Kontrolli et kõikidel väljadel on nimi ja kuvamisnimi
    if (!isCombined && !isDirectEntry) {
      const badField = fields.find(f => !f.name.trim() || !f.label.trim())
      if (badField) {
        setError(`Väljal on ${!badField.name.trim() ? "masinloetav nimi" : "kuvamisnimi"} puudu.`)
        setSaving(false)
        return
      }
    }

    const needsDirection = !isCombined && type !== "OTHER" &&
      ["RELATIVE_RANKING", "FIXED_RANKING", "VALUE_BASED"].includes(calcType)
    if (needsDirection) {
      const unsetRanked = fields.filter(f => f.rankingPriority != null && f.fieldHigherIsBetter === null)
      if (unsetRanked.length > 0) {
        setError(`Väljal "${unsetRanked[0].label || unsetRanked[0].name}" on suund valimata.`)
        setSaving(false)
        return
      }
    }

    const primaryDir = fields.find(f => f.rankingPriority === 1)?.fieldHigherIsBetter ?? false
    const body = {
      name,
      code,
      type,
      directPointsEntry: isDirectEntry ? true : (type === "PENALTY_BOX" ? directPointsEntry : undefined),
      config: elementConfig,
      maxValue: isCombined ? null : (maxValue !== "" ? Number(maxValue) : null),
      fields: isCombined ? undefined : isDirectEntry ? [
        { name: "tulemus", label: "Tulemus", type: "NUMBER", isResultField: true, rankingPriority: 1, order: 0, meta: JSON.stringify({ higherIsBetter: directHigherIsBetter }) },
      ] : fields.map((f, i) => ({
        name: f.name, label: f.label, type: f.type,
        isResultField: f.rankingPriority === 1,
        rankingPriority: f.rankingPriority,
        order: i,
        formula: f.type === "COMPUTED" ? f.formula : undefined,
        meta: (() => {
          const m: Record<string, unknown> = {}
          if (f.type === "COMPUTED" && f.displayAsTime) m.displayAs = "TIME"
          if (f.rankingPriority != null && typeof f.fieldHigherIsBetter === "boolean") m.higherIsBetter = f.fieldHigherIsBetter
          return Object.keys(m).length > 0 ? JSON.stringify(m) : null
        })(),
        validation: f.validation && Object.keys(f.validation).length ? f.validation : undefined,
      })),
      exceptions: exceptions.map((ex, i) => ({
        label: ex.label,
        penalty: isNaN(parseFloat(ex.penalty)) ? 0 : parseFloat(ex.penalty),
        order: i,
      })),
      calcMethod: (type === "OTHER" || type === "ABANDONMENT" || isCombined) ? undefined : isDirectEntry ? { type: "DIRECT_ENTRY", params: { higherIsBetter: directHigherIsBetter }, customFormula: undefined } : {
        type: calcType,
        params:
          calcType === "RELATIVE_RANKING" ? { higherIsBetter: primaryDir, minPoints } :
          calcType === "FIXED_RANKING" ? { higherIsBetter: primaryDir, fixedPoints: fixedPoints.map(Number), minPoints } :
          calcType === "VALUE_BASED" ? { higherIsBetter: primaryDir, minPoints } :
          calcType === "PERFORMANCE_BASED" ? { totalElements } :
          { higherIsBetter: primaryDir },
        customFormula: (calcType === "CUSTOM" || calcType === "ABSOLUTE_PENALTY") ? customFormula : undefined,
      },
    }

    const res = await fetch(`/api/elements/${elementId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    if (res.ok) {
      router.push(`/dashboard/competitions/${competitionId}/elements/${elementId}`)
    } else {
      try {
        const data = await res.json()
        setError(data.error ?? "Salvestamine ebaõnnestus")
      } catch {
        setError("Salvestamine ebaõnnestus (serveri viga)")
      }
      setSaving(false)
    }
  }

  if (loading) return <div className="text-gray-400 text-sm p-8">Laadin...</div>

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/dashboard/competitions/${competitionId}/elements/${elementId}`} className="text-gray-400 hover:text-gray-600 text-sm">
          ← Tagasi
        </Link>
        <h1 className="text-xl font-bold text-gray-900">Muuda elementi</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Põhiandmed */}
        <div className="bg-white border rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">Põhiandmed</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nimi *</label>
              <input type="text" required value={name} onChange={e => setName(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tähis *</label>
              <input type="text" required value={code} onChange={e => setCode(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tüüp</label>
              <select value={type} onChange={e => setType(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="CHECKPOINT">KP (Kontrollpunkt)</option>
                <option value="PENALTY_BOX">Postkast / Vastutegevus</option>
                <option value="COUNTER_ACTION">Vastutegevus</option>
                <option value="EQUIPMENT_CHECK">Varustuskontroll</option>
                <option value="LATENESS">Hilinemine</option>
                <option value="ABANDONMENT">Katkestamine</option>
                <option value="MANUAL">Käsitsi sisestatav</option>
                <option value="OTHER">Muu element</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Maksimumpunktid
                <span className="ml-1 text-xs font-normal text-gray-400">(tühi = võistluse vaikeväärtus)</span>
              </label>
              <input type="number" min={0} step={0.5} value={maxValue}
                onChange={e => setMaxValue(e.target.value)}
                placeholder="30"
                onFocus={e => e.target.select()}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {type === "PENALTY_BOX" && (
            <div className="border-t pt-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={directPointsEntry} onChange={e => setDirectPointsEntry(e.target.checked)}
                  className="mt-0.5 accent-blue-600" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Otsene punktisumma</p>
                  <p className="text-xs text-gray-500">
                    Lubab sisestada otse võistkonna kogupunktid selle elemendi eest, ilma et peaks märkima üksikuid postkaste.
                  </p>
                </div>
              </label>
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
                  value={(elementConfig.penaltyPerLife as number) ?? 30}
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
              Kohtunik sisestab kaotatud elude arv. Karistus = elud × {(elementConfig.penaltyPerLife as number) ?? 30}p
            </p>
          </div>
        )}

        {/* Varustuskontrolli seaded */}
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
                  value={(elementConfig.penaltyPerItem as number) ?? 5}
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
              Kohtunik sisestab puuduolevate esemete arv. Karistus = esemed × {(elementConfig.penaltyPerItem as number) ?? 5}p
            </p>
          </div>
        )}

        {/* Hilinemise seaded */}
        {type === "LATENESS" && elementConfig.mode === "PER_INTERVAL" && (
          <div className="bg-white border rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium bg-purple-100 text-purple-700 px-2 py-0.5 rounded">HL</span>
              <h2 className="font-semibold text-gray-900">Hilinemise seaded</h2>
            </div>
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
                <label className="text-xs text-gray-500 mb-1 block">Karistus intervalli eest (p)</label>
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
                <input type="number" min={0} step={1}
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
          </div>
        )}

        {/* Muu element info */}
        {type === "OTHER" && (
          <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
            <p className="text-sm font-medium text-teal-800 mb-1">Muu element</p>
            <p className="text-xs text-teal-700">
              Kirjeid (võistkond + punktid + selgitus) hallatakse otse elemendi lehel. Siin saab muuta ainult nime ja tähist.
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
              Katkestamisi hallatakse elemendi lehel. Annab ainult karistuspunktid (ei muuda automaatselt staatust).
            </p>
          </div>
        )}

        {/* Kombineeritud hindamine — sektsioone hallatakse siin */}
        {(calcType === "COMBINED" || sections.length > 0) && (
          <div className="bg-white border rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-gray-900">Hindamisosad</h2>
              {sections.length > 0 && (
                <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                  Kombineeritud · {sections.length} osa
                </span>
              )}
            </div>
            <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
              Sisendväljad ja arvutusmeetod on seadistatud iga hindamisosa sees eraldi.
            </p>
            <ElementSectionsManager
              elementId={elementId}
              competitionId={competitionId}
              initialSections={sections}
            />
          </div>
        )}

        {/* Arvutusmeetod enne, sisendväljad pärast (flex-col-reverse pöörab järjekorra) */}
        <div className="flex flex-col-reverse gap-6">
        {/* Sisendväljad (ainult mitte-kombineeritud, mitte-DIRECT_ENTRY elementidel) */}
        {type !== "OTHER" && type !== "ABANDONMENT" && calcType !== "COMBINED" && calcType !== "DIRECT_ENTRY" && sections.length === 0 && (<div className="bg-white border rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">Sisendväljad</h2>
          <p className="text-xs text-gray-500">Määra järjekord, mille alusel pingerida moodustatakse. 1 = esmane, 2+ = viigi lahendaja.</p>

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
        </div>)}

        {/* Arvutusmeetod */}
        {type !== "OTHER" && type !== "ABANDONMENT" && sections.length === 0 && <div className="bg-white border rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">Arvutusmeetod</h2>
          <div className="space-y-2">
            {CALC_TYPES.map(ct => (
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
                {scoringMode === "PENALTY" ? (
                  <>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Parima tulemus (p)</label>
                      <input type="number" min={0} step={0.5} value={minPoints}
                        onChange={e => setMinPoints(Number(e.target.value))} onFocus={e => e.target.select()}
                        className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Halvima tulemus (p)</label>
                      <input type="number" min={0} step={0.5} value={maxValue}
                        onChange={e => setMaxValue(e.target.value)} onFocus={e => e.target.select()}
                        placeholder="võistluse vaikeväärtus"
                        className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Parima tulemus (p)</label>
                      <input type="number" min={0} step={0.5} value={maxValue}
                        onChange={e => setMaxValue(e.target.value)} onFocus={e => e.target.select()}
                        placeholder="võistluse vaikeväärtus"
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
              <div>
              </div>
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
                Tulemusväljale sisestatakse õigesti sooritatud elementide arv. Iga element annab {"{maxP}"} / {totalElements} punkti.
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
        </div>}
        </div>

        {/* Erandid */}
        {type !== "OTHER" && type !== "ABANDONMENT" && <div className="bg-white border rounded-xl p-5 space-y-4">
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
        </div>}

        {error && <div className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</div>}

        <button type="submit" disabled={saving}
          className="w-full bg-blue-600 text-white py-2.5 px-4 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
          {saving ? "Salvestan..." : "Salvesta muudatused"}
        </button>
      </form>
    </div>
  )
}
