"use client"

import { use, useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { normalizeClassGroups, parseClassGroups, type ClassGroup } from "@/lib/classGroups"
import type { TeamCountScope } from "@/lib/classGroups"
import { FixedRankingSettings } from "@/components/competition/FixedRankingSettings"
import { parseFixedPointValues, parseFixedRankingParams, type FixedRankingMode } from "@/lib/fixedRanking"

type CompetitionForm = {
  name: string
  date: string
  endDate: string
  location: string
  status: string
  scoringMode: string
  defaultCalcType: string
  defaultHigherIsBetter: boolean
  defaultRankingMinPoints: number
  defaultFixedRankingMode: FixedRankingMode
  defaultTeamCountScope: TeamCountScope
  defaultTeamCountBase: number
  defaultTeamCountStep: number
  registeredTeamCount: number
  defaultKPMaxValue: number
  defaultNotPassed: number
  defaultPassedNotDone: number
  defaultPKMaxValue: number
  defaultVastutegevusPenaltyPerLife: number
  defaultVarustusPenaltyPerItem: number
  defaultHilinemineMode: string
  defaultHilinemineIntervalMinutes: number
  defaultHilineminePenaltyPerInterval: number
  defaultHilinemineMaxPenalty: number
}

const SCORING_MODES = [
  {
    value: "PENALTY",
    label: "Karistuspunktid",
    desc: "Parim saab 0 punkti, halvim maksimumpunkti. Eksimused lisavad karistuspunkte. Võidab väheima kogusummaga.",
  },
  {
    value: "PLUS",
    label: "Plusspunktid",
    desc: "Parim saab maksimumpunkti, halvim 0. Eksimused lahutatakse kogusummast. Võidab suurima kogusummaga.",
  },
]

const CALC_TYPES = [
  { value: "RELATIVE_RANKING", label: "Pingerida valemiga", desc: "Parim saab 0p (PENALTY) või max (PLUS), halvim vastupidi. Rangi järgi lineaarne." },
  { value: "FIXED_RANKING", label: "Fikseeritud pingerida", desc: "Määra osa või kõik kohad täpselt või loo punktiskaala registreerunute arvust." },
  { value: "VALUE_BASED", label: "Tulemuspõhine jaotus", desc: "Punktid jaotatakse parima ja halvima tulemuse vahe järgi proportsionaalselt." },
  { value: "PERFORMANCE_BASED", label: "Soorituspõhine", desc: "Tulemusväli = õigeid elemente. Iga element annab maxP / koguElementide arvu." },
  { value: "ABSOLUTE_TIME", label: "Absoluutne aeg", desc: "Karistuspunkt = tegelik aeg sekundites." },
  { value: "ABSOLUTE_POINTS", label: "Absoluutsed punktid", desc: "PENALTY: karistus = max − oma tulemus. PLUS: tulemus salvestatakse otse." },
  { value: "CUSTOM", label: "Korraldaja valem", desc: "Kirjuta ise valem (muutujad: result, n, rank)." },
]

export default function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: competitionId } = use(params)
  const router = useRouter()
  const [form, setForm] = useState<CompetitionForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState(false)
  const [fixedRankingPoints, setFixedRankingPoints] = useState<string[]>([])
  const [classGroups, setClassGroups] = useState<ClassGroup[]>([])
  const [applying, setApplying] = useState(false)
  const [applyResult, setApplyResult] = useState<{ maxValues: number; exceptions: number; calcMethods: number } | null>(null)
  const [applyError, setApplyError] = useState("")

  useEffect(() => {
    fetch(`/api/competitions/${competitionId}`)
      .then(r => r.json())
      .then(data => {
        setForm({
          name: data.name ?? "",
          date: data.date ? data.date.slice(0, 10) : "",
          endDate: data.endDate ? data.endDate.slice(0, 10) : "",
          location: data.location ?? "",
          status: data.status ?? "SETUP",
          scoringMode: data.scoringMode ?? "PENALTY",
          defaultCalcType: data.defaultCalcType ?? "RELATIVE_RANKING",
          defaultHigherIsBetter: data.defaultHigherIsBetter ?? false,
          defaultRankingMinPoints: data.defaultRankingMinPoints ?? 0,
          defaultFixedRankingMode: parseFixedRankingParams({ fixedRankingMode: data.defaultFixedRankingMode }).fixedRankingMode,
          defaultTeamCountScope: parseFixedRankingParams({ teamCountScope: data.defaultTeamCountScope }).teamCountScope,
          defaultTeamCountBase: Number(data.defaultTeamCountBase ?? 0),
          defaultTeamCountStep: Number(data.defaultTeamCountStep ?? 1),
          registeredTeamCount: Array.isArray(data.teams)
            ? data.teams.filter((team: { isHorsDeCompetition?: boolean }) => !team.isHorsDeCompetition).length
            : Number(data._count?.teams ?? 0),
          defaultKPMaxValue: data.defaultKPMaxValue ?? 30,
          defaultNotPassed: data.defaultNotPassed ?? 40,
          defaultPassedNotDone: data.defaultPassedNotDone ?? 35,
          defaultPKMaxValue: data.defaultPKMaxValue ?? 15,
          defaultVastutegevusPenaltyPerLife: data.defaultVastutegevusPenaltyPerLife ?? 5,
          defaultVarustusPenaltyPerItem: data.defaultVarustusPenaltyPerItem ?? 5,
          defaultHilinemineMode: data.defaultHilinemineMode ?? "ONE_TIME",
          defaultHilinemineIntervalMinutes: data.defaultHilinemineIntervalMinutes ?? 1,
          defaultHilineminePenaltyPerInterval: data.defaultHilineminePenaltyPerInterval ?? 1,
          defaultHilinemineMaxPenalty: data.defaultHilinemineMaxPenalty ?? 30,
        })
        try {
          const pts = JSON.parse(data.defaultFixedRankingPoints ?? "[]")
          setFixedRankingPoints(Array.isArray(pts) ? pts.map(String) : [])
        } catch { setFixedRankingPoints([]) }
        setClassGroups(parseClassGroups(data.classGroups))
      })
  }, [competitionId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
    setSaving(true)
    setError("")
    const res = await fetch(`/api/competitions/${competitionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        date: form.date || null,
        endDate: form.endDate || null,
        location: form.location || null,
        defaultKPMaxValue: Number(form.defaultKPMaxValue),
        defaultNotPassed: Number(form.defaultNotPassed),
        defaultPassedNotDone: Number(form.defaultPassedNotDone),
        defaultPKMaxValue: Number(form.defaultPKMaxValue),
        defaultVastutegevusPenaltyPerLife: Number(form.defaultVastutegevusPenaltyPerLife),
        defaultVarustusPenaltyPerItem: Number(form.defaultVarustusPenaltyPerItem),
        defaultHilinemineIntervalMinutes: Number(form.defaultHilinemineIntervalMinutes),
        defaultHilineminePenaltyPerInterval: Number(form.defaultHilineminePenaltyPerInterval),
        defaultHilinemineMaxPenalty: Number(form.defaultHilinemineMaxPenalty),
        defaultHigherIsBetter: form.defaultHigherIsBetter,
        defaultFixedRankingPoints: parseFixedPointValues(fixedRankingPoints),
        defaultFixedRankingMode: form.defaultFixedRankingMode,
        defaultTeamCountScope: form.defaultTeamCountScope,
        defaultTeamCountBase: Number(form.defaultTeamCountBase),
        defaultTeamCountStep: Number(form.defaultTeamCountStep),
        classGroups: normalizeClassGroups(classGroups),
      }),
    })
    if (res.ok) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } else {
      try {
        const d = await res.json()
        setError(d.error ?? "Salvestamine ebaõnnestus")
      } catch {
        setError("Salvestamine ebaõnnestus (serveri viga)")
      }
    }
    setSaving(false)
  }

  function set<K extends keyof CompetitionForm>(key: K, value: CompetitionForm[K]) {
    setForm(f => f ? { ...f, [key]: value } : f)
  }

  async function applyDefaults() {
    if (!confirm(
      "Rakendad hetkel salvestatud vaikeväärtused KÕIGILE elementidele:\n" +
      "• KP maksimum → kõik kontrollpunktid\n" +
      "• PK maksimum → kõik postkastid\n" +
      "• Erandite karistused (Ei läbinud / Läbis aga ei sooritanud)\n" +
      "• Arvutusmeetod → KP ja PK elemendid\n\n" +
      "Skoorid arvutatakse automaatselt ümber. Käsitsi tehtud erisused kirjutatakse üle.\n\nJätka?"
    )) return

    setApplying(true)
    setApplyResult(null)
    setApplyError("")
    try {
      const res = await fetch(`/api/competitions/${competitionId}/apply-defaults`, { method: "POST" })
      const data = await res.json()
      if (res.ok) {
        setApplyResult(data.updated)
      } else {
        setApplyError(data.error ?? "Viga rakendamisel")
      }
    } catch {
      setApplyError("Serveri viga")
    }
    setApplying(false)
  }

  if (!form) return <div className="text-gray-400 text-sm p-4">Laadin...</div>

  const numInput = (key: keyof CompetitionForm, label: string, unit = "p", min: number | undefined = 0) => {
    const val = form![key] as number
    const cls = "w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
    return (
      <div>
        <label className="text-xs text-gray-500 mb-1 block">{label}</label>
        <div className="flex items-center gap-2">
          {min !== undefined ? (
            <input type="number" min={min} step={0.5} value={val}
              onChange={e => set(key, Number(e.target.value) as CompetitionForm[typeof key])}
              onFocus={e => e.target.select()}
              className={cls} />
          ) : (
            <input type="text" inputMode="decimal" key={`${key}-${val}`} defaultValue={val}
              onBlur={e => { const n = parseFloat(e.target.value.replace(",", ".")); if (!isNaN(n)) set(key, n as CompetitionForm[typeof key]) }}
              onFocus={e => e.target.select()}
              className={cls} />
          )}
          {unit && <span className="text-xs text-gray-400 shrink-0">{unit}</span>}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-2 mb-4 text-sm text-gray-400">
        <Link href={`/dashboard/competitions/${competitionId}`}>← Tagasi</Link>
      </div>
      <h1 className="text-xl font-bold text-gray-900 mb-6">Võistluse seaded</h1>

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Põhiandmed */}
        <Card className="p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">Põhiandmed</h2>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Nimi *</label>
            <input required type="text" value={form.name} onChange={e => set("name", e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Alguskuupäev</label>
              <input type="date" value={form.date} onChange={e => set("date", e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Lõppkuupäev</label>
              <input type="date" value={form.endDate} onChange={e => set("endDate", e.target.value)}
                min={form.date || undefined}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Asukoht</label>
            <input type="text" value={form.location} onChange={e => set("location", e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Staatus</label>
            <select value={form.status} onChange={e => set("status", e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="SETUP">Ettevalmistus</option>
              <option value="ACTIVE">Toimub</option>
              <option value="FINISHED">Lõppenud</option>
              <option value="CANCELLED">Tühistatud</option>
              <option value="ARCHIVED">Arhiveeritud</option>
            </select>
          </div>
        </Card>

        {/* Hindamissüsteem */}
        <Card className="p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">Hindamissüsteem</h2>
          <div className="space-y-2">
            {SCORING_MODES.map(m => (
              <label key={m.value} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${form.scoringMode === m.value ? "border-blue-500 bg-blue-50" : "hover:bg-gray-50"}`}>
                <input type="radio" name="scoringMode" value={m.value}
                  checked={form.scoringMode === m.value} onChange={() => set("scoringMode", m.value)}
                  className="mt-0.5 accent-blue-600" />
                <div>
                  <p className="text-sm font-medium text-gray-900">{m.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{m.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </Card>

        {/* Arvutusmeetod */}
        <Card className="p-5 space-y-3">
          <h2 className="font-semibold text-gray-900">Arvutusmeetod — vaikimisi KP/PK elementidele</h2>
          <p className="text-xs text-gray-500">Iga elemendi loomisel eeltäidetakse see arvutusmeetod. Elemente saab hiljem eraldi muuta.</p>
          {CALC_TYPES.map(ct => (
            <label key={ct.value} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${form.defaultCalcType === ct.value ? "border-blue-500 bg-blue-50" : "hover:bg-gray-50"}`}>
              <input type="radio" name="defaultCalcType" value={ct.value}
                checked={form.defaultCalcType === ct.value}
                onChange={() => set("defaultCalcType", ct.value)}
                className="mt-0.5 accent-blue-600" />
              <div>
                <p className="text-sm font-medium text-gray-900">{ct.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{ct.desc}</p>
              </div>
            </label>
          ))}
          {form.defaultCalcType === "RELATIVE_RANKING" && (
            <div className="space-y-3 pt-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.defaultHigherIsBetter}
                  onChange={e => set("defaultHigherIsBetter", e.target.checked)}
                  className="accent-blue-600" />
                Suurem tulemus = parem (nt punktid, mitte aeg)
              </label>
              <div className="border-t pt-3">
                <label className="text-xs text-gray-500 mb-1 block">Halvima soorituse vaikepunktid (p)</label>
                <div className="flex items-center gap-2 max-w-50">
                  <input type="number" min={0} step={0.5}
                    value={form.defaultRankingMinPoints}
                    onChange={e => set("defaultRankingMinPoints", Number(e.target.value))}
                    onFocus={e => e.target.select()}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <span className="text-xs text-gray-400 shrink-0">p</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">Halvim sooritanud tiim saab vähemalt selle palju punkte. Parim saab KP/PK maksimumpunkti.</p>
              </div>
            </div>
          )}
          {form.defaultCalcType === "FIXED_RANKING" && (
            <p className="text-xs text-indigo-700 bg-indigo-50 rounded-lg px-3 py-2">
              Kohtade punktid määrad järgmises kaardis — <strong>Fikseeritud pingerida — vaikeväärtused</strong>.
            </p>
          )}
        </Card>

        {/* Fikseeritud pingerida vaikeväärtused */}
        {form.defaultCalcType === "FIXED_RANKING" && (
          <Card className="p-5 space-y-5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">PR</span>
              <h2 className="font-semibold text-gray-900">Fikseeritud pingerida — vaikeväärtused</h2>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.defaultHigherIsBetter}
                onChange={e => set("defaultHigherIsBetter", e.target.checked)} className="accent-blue-600" />
              Suurem sisestatud tulemus = parem koht
            </label>
            <FixedRankingSettings
              scoringMode={form.scoringMode === "PLUS" ? "PLUS" : "PENALTY"}
              mode={form.defaultFixedRankingMode}
              onModeChange={value => set("defaultFixedRankingMode", value)}
              fixedPoints={fixedRankingPoints}
              onFixedPointsChange={setFixedRankingPoints}
              minPoints={form.defaultRankingMinPoints}
              onMinPointsChange={value => set("defaultRankingMinPoints", value)}
              teamCountScope={form.defaultTeamCountScope}
              onTeamCountScopeChange={value => set("defaultTeamCountScope", value)}
              teamCountBase={form.defaultTeamCountBase}
              onTeamCountBaseChange={value => set("defaultTeamCountBase", value)}
              teamCountStep={form.defaultTeamCountStep}
              onTeamCountStepChange={value => set("defaultTeamCountStep", value)}
              registeredTeamCount={form.registeredTeamCount}
            />

            <div className="space-y-3 border-t pt-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Klassigrupid</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Neid kasutatakse registreeritud võistkondade režiimis, kui pingerea skoop on „Klassigrupid". Klass võib kuuluda ainult ühte gruppi.
                </p>
              </div>
              {classGroups.length === 0 ? (
                <p className="text-xs text-gray-400 italic">Gruppe pole määratud.</p>
              ) : (
                <div className="space-y-2">
                  {classGroups.map((group, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <input aria-label="Grupi nimi" value={group.name} placeholder="Nimi, nt Noored"
                        onChange={event => {
                          const next = [...classGroups]
                          next[index] = { ...next[index], name: event.target.value }
                          setClassGroups(next)
                        }} className="w-40 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      <input aria-label="Klassid" value={group.classes.join(", ")} placeholder="Klassid komadega, nt N, S"
                        onChange={event => {
                          const next = [...classGroups]
                          next[index] = { ...next[index], classes: event.target.value.split(",").map(value => value.trim()).filter(Boolean) }
                          setClassGroups(next)
                        }} className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      <button type="button" onClick={() => setClassGroups(classGroups.filter((_, itemIndex) => itemIndex !== index))}
                        aria-label="Eemalda klassigrupp" className="text-red-400 hover:text-red-600 text-sm px-2">✕</button>
                    </div>
                  ))}
                </div>
              )}
              <button type="button" onClick={() => setClassGroups([...classGroups, { name: "", classes: [] }])}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium">+ Lisa grupp</button>
            </div>
          </Card>
        )}

        {/* KP vaikeväärtused */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium bg-blue-100 text-blue-700 px-2 py-0.5 rounded">KP</span>
            <h2 className="font-semibold text-gray-900">Kontrollpunkt — vaikeväärtused</h2>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {numInput("defaultKPMaxValue", form.scoringMode === "PLUS" ? "Maks (parim saab X p)" : "Maks (halvim saab X p)")}
            {numInput("defaultNotPassed", "Ei läbinud KP-d", "p", undefined)}
            {numInput("defaultPassedNotDone", "Läbis aga ei sooritanud", "p", undefined)}
          </div>
        </Card>

        {/* PK vaikeväärtused */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium bg-orange-100 text-orange-700 px-2 py-0.5 rounded">PK</span>
            <h2 className="font-semibold text-gray-900">Postkast — vaikeväärtused</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {numInput("defaultPKMaxValue", form.scoringMode === "PLUS" ? "Maks (parim saab X p)" : "Maks (halvim saab X p)")}
          </div>
        </Card>

        {/* Vastutegevus vaikeväärtused */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium bg-red-100 text-red-700 px-2 py-0.5 rounded">VT</span>
            <h2 className="font-semibold text-gray-900">Vastutegevus — vaikeväärtused</h2>
          </div>
          <p className="text-xs text-gray-500">Kohtunik sisestab kaotatud elude arvu. Iga elu = X karistuspunkti.</p>
          <div className="grid grid-cols-2 gap-4">
            {numInput("defaultVastutegevusPenaltyPerLife", "Karistus 1 elu kaotamise eest")}
          </div>
        </Card>

        {/* Varustus vaikeväärtused */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">VA</span>
            <h2 className="font-semibold text-gray-900">Varustus — vaikeväärtused</h2>
          </div>
          <p className="text-xs text-gray-500">Kohtunik märgib puuduolevate varustusesemete arvu. Iga puuduolev ese = X karistuspunkti.</p>
          <div className="grid grid-cols-2 gap-4">
            {numInput("defaultVarustusPenaltyPerItem", "Karistus ühe puuduoleva eseme eest")}
          </div>
        </Card>

        {/* Hilinemine vaikeväärtused */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium bg-purple-100 text-purple-700 px-2 py-0.5 rounded">HL</span>
            <h2 className="font-semibold text-gray-900">Hilinemine — vaikeväärtused</h2>
          </div>
          <div className="space-y-2">
            <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer ${form.defaultHilinemineMode === "ONE_TIME" ? "border-blue-500 bg-blue-50" : "hover:bg-gray-50"}`}>
              <input type="radio" name="hilinemineMode" value="ONE_TIME"
                checked={form.defaultHilinemineMode === "ONE_TIME"}
                onChange={() => set("defaultHilinemineMode", "ONE_TIME")}
                className="mt-0.5 accent-blue-600" />
              <div>
                <p className="text-sm font-medium text-gray-900">Ühekordne</p>
                <p className="text-xs text-gray-500">Hilinemisel rakendatakse "Läbis aga ei sooritanud" karistus (KP vaikeväärtusest).</p>
              </div>
            </label>
            <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer ${form.defaultHilinemineMode === "PER_INTERVAL" ? "border-blue-500 bg-blue-50" : "hover:bg-gray-50"}`}>
              <input type="radio" name="hilinemineMode" value="PER_INTERVAL"
                checked={form.defaultHilinemineMode === "PER_INTERVAL"}
                onChange={() => set("defaultHilinemineMode", "PER_INTERVAL")}
                className="mt-0.5 accent-blue-600" />
              <div>
                <p className="text-sm font-medium text-gray-900">Minutipõhine</p>
                <p className="text-xs text-gray-500">Kohtunik sisestab hilinenud minutid. Iga N minuti eest X karistuspunkti, maksimaalselt Y punkti.</p>
              </div>
            </label>
          </div>

          {form.defaultHilinemineMode === "PER_INTERVAL" && (
            <div className="grid grid-cols-3 gap-4 pt-2">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Intervall (minutid)</label>
                <input type="number" min={1} step={1} value={form.defaultHilinemineIntervalMinutes}
                  onChange={e => set("defaultHilinemineIntervalMinutes", Number(e.target.value))}
                  onFocus={e => e.target.select()}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Karistus intervalli kohta</label>
                <div className="flex items-center gap-2">
                  <input type="number" min={0} step={0.5} value={form.defaultHilineminePenaltyPerInterval}
                    onChange={e => set("defaultHilineminePenaltyPerInterval", Number(e.target.value))}
                    onFocus={e => e.target.select()}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <span className="text-xs text-gray-400 shrink-0">p</span>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Maksimaalne karistus</label>
                <div className="flex items-center gap-2">
                  <input type="number" min={0} step={0.5} value={form.defaultHilinemineMaxPenalty}
                    onChange={e => set("defaultHilinemineMaxPenalty", Number(e.target.value))}
                    onFocus={e => e.target.select()}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <span className="text-xs text-gray-400 shrink-0">p</span>
                </div>
              </div>
            </div>
          )}

          {form.defaultHilinemineMode === "PER_INTERVAL" && (
            <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
              Valem: iga {form.defaultHilinemineIntervalMinutes} min = {form.defaultHilineminePenaltyPerInterval}p, max {form.defaultHilinemineMaxPenalty}p
            </p>
          )}
        </Card>

        {error && <div className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</div>}

        <div className="flex items-center gap-3">
          <Button type="submit" size="lg" disabled={saving}>
            {saving ? "Salvestan..." : "Salvesta seaded"}
          </Button>
          {saved && <span className="text-green-600 text-sm">✓ Salvestatud</span>}
        </div>
      </form>

      {/* Massuuendus */}
      <Card className="mt-6 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-gray-900 mb-1">Rakenda vaikeväärtused kõigile elementidele</h2>
            <p className="text-xs text-gray-500 leading-relaxed">
              Kirjutab ülaltoodud vaikeväärtused üle kõigil olemasolevatel elementidel.
              Saad seejärel üksikuid elemente käsitsi muuta.
            </p>
            <ul className="mt-2 text-xs text-gray-400 space-y-0.5 list-disc list-inside">
              <li>KP maks → kõik kontrollpunktid</li>
              <li>PK maks → kõik postkastid</li>
              <li>Erandid: <em>Ei läbinud</em> ja <em>Läbis aga ei sooritanud</em></li>
              <li>Arvutusmeetod + parameetrid (KP/PK)</li>
            </ul>
          </div>
          <button
            type="button"
            onClick={applyDefaults}
            disabled={applying}
            className="shrink-0 px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-50 transition-colors"
          >
            {applying ? "Rakendan..." : "Rakenda kõigile"}
          </button>
        </div>

        {applyResult && (
          <div className="mt-4 bg-green-50 border border-green-100 rounded-lg px-4 py-3 text-sm text-green-800">
            ✓ Valmis — uuendatud: {applyResult.maxValues} max väärtust, {applyResult.exceptions} erandi karistust, {applyResult.calcMethods} arvutusmeetodit. Skoorid arvutati ümber.
          </div>
        )}
        {applyError && (
          <div className="mt-4 bg-red-50 border border-red-100 rounded-lg px-4 py-3 text-sm text-red-700">{applyError}</div>
        )}
      </Card>

      <Card className="mt-6 p-5">
        <div>
          <h2 className="font-semibold text-gray-900">Kasutajad ja rollid</h2>
          <p className="text-xs text-gray-500 mt-1">
            Korraldaja, kohtuniku ja võistkonna esindaja õigusi hallatakse
            ühes kohas Juurdepääsu lehel.
          </p>
        </div>
        <Link
          href={`/dashboard/competitions/${competitionId}/access`}
          className={cn(buttonVariants(), "mt-4")}
        >
          Ava rollihaldus
        </Link>
      </Card>

      {/* Ohtlik tsoon */}
      <div className="mt-8 border border-red-200 rounded-xl p-5">
        <h2 className="font-semibold text-red-700 mb-2">Ohtlik tsoon</h2>
        <p className="text-sm text-gray-500 mb-4">Võistluse kustutamine eemaldab kõik elemendid, võistkonnad ja tulemused.</p>
        <button type="button"
          onClick={async () => {
            if (!confirm("Kustuta võistlus koos kõigi andmetega? Seda ei saa tagasi võtta.")) return
            const res = await fetch(`/api/competitions/${competitionId}`, { method: "DELETE" })
            if (res.ok) router.push("/dashboard")
          }}
          className="text-sm text-red-600 border border-red-300 px-4 py-2 rounded-lg hover:bg-red-50 transition-colors">
          Kustuta võistlus
        </button>
      </div>
    </div>
  )
}
