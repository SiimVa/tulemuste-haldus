"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

type Form = {
  name: string
  date: string
  endDate: string
  location: string
  scoringMode: string
  defaultCalcType: string
  defaultHigherIsBetter: boolean
  defaultRankingMinPoints: number
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

const CALC_TYPES = [
  { value: "RELATIVE_RANKING", label: "Pingerida valemiga", desc: "Parim saab 0p (PENALTY) või max (PLUS), halvim vastupidi. Rangi järgi lineaarne." },
  { value: "FIXED_RANKING", label: "Fikseeritud pingerida", desc: "Igale kohale määrad täpse punktisumma. Ülejäänud kohad arvutatakse valemiga." },
  { value: "VALUE_BASED", label: "Tulemuspõhine jaotus", desc: "Punktid jaotatakse parima ja halvima tulemuse vahe järgi proportsionaalselt." },
  { value: "PERFORMANCE_BASED", label: "Soorituspõhine", desc: "Tulemusväli = õigeid elemente. Iga element annab maxP / koguElementide arvu." },
  { value: "ABSOLUTE_TIME", label: "Absoluutne aeg", desc: "Karistuspunkt = tegelik aeg sekundites." },
  { value: "ABSOLUTE_POINTS", label: "Absoluutsed punktid", desc: "PENALTY: karistus = max − oma tulemus. PLUS: tulemus salvestatakse otse." },
  { value: "CUSTOM", label: "Korraldaja valem", desc: "Kirjuta ise valem (muutujad: result, n, rank)." },
]

const DEFAULTS: Form = {
  name: "", date: "", endDate: "", location: "",
  scoringMode: "PENALTY",
  defaultCalcType: "RELATIVE_RANKING",
  defaultHigherIsBetter: false,
  defaultRankingMinPoints: 0,
  defaultKPMaxValue: 30, defaultNotPassed: 40, defaultPassedNotDone: 35,
  defaultPKMaxValue: 15,
  defaultVastutegevusPenaltyPerLife: 5,
  defaultVarustusPenaltyPerItem: 5,
  defaultHilinemineMode: "ONE_TIME",
  defaultHilinemineIntervalMinutes: 1,
  defaultHilineminePenaltyPerInterval: 1,
  defaultHilinemineMaxPenalty: 30,
}

const SCORING_MODES = [
  { value: "PENALTY", label: "Karistuspunktid", desc: "Parim saab 0 punkti, halvim maksimumpunkti. Eksimused lisavad karistuspunkte. Võidab väheima kogusummaga." },
  { value: "PLUS", label: "Plusspunktid", desc: "Parim saab maksimumpunkti, halvim 0. Eksimused lahutatakse kogusummast. Võidab suurima kogusummaga." },
]

export default function NewCompetitionPage() {
  const router = useRouter()
  const [form, setForm] = useState<Form>(DEFAULTS)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")

    const res = await fetch("/api/competitions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        date: form.date || null,
        endDate: form.endDate || null,
        location: form.location || null,
        defaultHigherIsBetter: form.defaultHigherIsBetter,
        defaultKPMaxValue: Number(form.defaultKPMaxValue),
        defaultPKMaxValue: Number(form.defaultPKMaxValue),
        defaultNotPassed: Number(form.defaultNotPassed),
        defaultPassedNotDone: Number(form.defaultPassedNotDone),
        defaultVastutegevusPenaltyPerLife: Number(form.defaultVastutegevusPenaltyPerLife),
        defaultVarustusPenaltyPerItem: Number(form.defaultVarustusPenaltyPerItem),
        defaultHilinemineIntervalMinutes: Number(form.defaultHilinemineIntervalMinutes),
        defaultHilineminePenaltyPerInterval: Number(form.defaultHilineminePenaltyPerInterval),
        defaultHilinemineMaxPenalty: Number(form.defaultHilinemineMaxPenalty),
      }),
    })

    if (res.ok) {
      const data = await res.json()
      router.push(`/dashboard/competitions/${data.id}`)
    } else {
      try {
        const data = await res.json()
        setError(data.error ?? "Viga loomisel")
      } catch {
        setError("Viga loomisel (serveri viga)")
      }
      setLoading(false)
    }
  }

  const numInput = (key: keyof Form, label: string, unit = "p", min: number | undefined = 0, step = 0.5) => {
    const val = form[key] as number
    const cls = "w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
    return (
      <div>
        <label className="text-xs text-gray-500 mb-1 block">{label}</label>
        <div className="flex items-center gap-2">
          {min !== undefined ? (
            <input type="number" min={min} step={step} value={val}
              onChange={e => set(key, Number(e.target.value) as Form[typeof key])}
              onFocus={e => e.target.select()}
              className={cls} />
          ) : (
            <input type="text" inputMode="decimal" key={`${key}-${val}`} defaultValue={val}
              onBlur={e => { const n = parseFloat(e.target.value.replace(",", ".")); if (!isNaN(n)) set(key, n as Form[typeof key]) }}
              onFocus={e => e.target.select()}
              className={cls} />
          )}
          {unit && <span className="text-xs text-gray-400 shrink-0">{unit}</span>}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard" className="text-gray-400 hover:text-gray-600 text-sm">← Tagasi</Link>
        <h1 className="text-2xl font-bold text-gray-900">Uus võistlus</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Põhiandmed */}
        <div className="bg-white border rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">Põhiandmed</h2>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Nimi <span className="text-red-500">*</span></label>
            <input required type="text" value={form.name} onChange={e => set("name", e.target.value)}
              placeholder="nt. Roheline matk 2026"
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
              placeholder="nt. Kõrvemaa matkarajad"
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        {/* Hindamissüsteem */}
        <div className="bg-white border rounded-xl p-5 space-y-3">
          <h2 className="font-semibold text-gray-900">Hindamissüsteem</h2>
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

        {/* Arvutusmeetod */}
        <div className="bg-white border rounded-xl p-5 space-y-3">
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
        </div>

        {/* KP vaikeväärtused */}
        <div className="bg-white border rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium bg-blue-100 text-blue-700 px-2 py-0.5 rounded">KP</span>
            <h2 className="font-semibold text-gray-900">Kontrollpunkt — vaikeväärtused</h2>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {numInput("defaultKPMaxValue", form.scoringMode === "PLUS" ? "Maks (parim saab X p)" : "Maks (halvim saab X p)")}
            {numInput("defaultNotPassed", "Ei läbinud KP-d", "p", undefined)}
            {numInput("defaultPassedNotDone", "Läbis aga ei sooritanud", "p", undefined)}
          </div>
        </div>

        {/* PK vaikeväärtused */}
        <div className="bg-white border rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium bg-orange-100 text-orange-700 px-2 py-0.5 rounded">PK</span>
            <h2 className="font-semibold text-gray-900">Postkast — vaikeväärtused</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {numInput("defaultPKMaxValue", form.scoringMode === "PLUS" ? "Maks (parim saab X p)" : "Maks (halvim saab X p)")}
          </div>
        </div>

        {/* Vastutegevus */}
        <div className="bg-white border rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium bg-red-100 text-red-700 px-2 py-0.5 rounded">VT</span>
            <h2 className="font-semibold text-gray-900">Vastutegevus — vaikeväärtused</h2>
          </div>
          <p className="text-xs text-gray-500">Kohtunik sisestab kaotatud elude arvu. Iga elu = X karistuspunkti.</p>
          <div className="grid grid-cols-2 gap-4">
            {numInput("defaultVastutegevusPenaltyPerLife", "Karistus 1 elu kaotamise eest")}
          </div>
        </div>

        {/* Varustus */}
        <div className="bg-white border rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">VA</span>
            <h2 className="font-semibold text-gray-900">Varustus — vaikeväärtused</h2>
          </div>
          <p className="text-xs text-gray-500">Kohtunik märgib puuduolevate varustusesemete arvu. Iga puuduolev ese = X karistuspunkti.</p>
          <div className="grid grid-cols-2 gap-4">
            {numInput("defaultVarustusPenaltyPerItem", "Karistus ühe puuduoleva eseme eest")}
          </div>
        </div>

        {/* Hilinemine */}
        <div className="bg-white border rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium bg-purple-100 text-purple-700 px-2 py-0.5 rounded">HL</span>
            <h2 className="font-semibold text-gray-900">Hilinemine — vaikeväärtused</h2>
          </div>
          <div className="space-y-2">
            {[
              { value: "ONE_TIME", label: "Ühekordne", desc: 'Hilinemisel rakendatakse "Läbis aga ei sooritanud" karistus.' },
              { value: "PER_INTERVAL", label: "Minutipõhine", desc: "Kohtunik sisestab hilinenud minutid. Iga N minuti eest X karistuspunkti, maksimaalselt Y punkti." },
            ].map(m => (
              <label key={m.value} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer ${form.defaultHilinemineMode === m.value ? "border-blue-500 bg-blue-50" : "hover:bg-gray-50"}`}>
                <input type="radio" name="hilinemineMode" value={m.value}
                  checked={form.defaultHilinemineMode === m.value}
                  onChange={() => set("defaultHilinemineMode", m.value)}
                  className="mt-0.5 accent-blue-600" />
                <div>
                  <p className="text-sm font-medium text-gray-900">{m.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{m.desc}</p>
                </div>
              </label>
            ))}
          </div>
          {form.defaultHilinemineMode === "PER_INTERVAL" && (
            <div className="grid grid-cols-3 gap-4 pt-2">
              {numInput("defaultHilinemineIntervalMinutes", "Intervall (minutid)", "min", 1, 1)}
              {numInput("defaultHilineminePenaltyPerInterval", "Karistus intervalli kohta")}
              {numInput("defaultHilinemineMaxPenalty", "Maksimaalne karistus")}
            </div>
          )}
          {form.defaultHilinemineMode === "PER_INTERVAL" && (
            <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
              Valem: iga {form.defaultHilinemineIntervalMinutes} min = {form.defaultHilineminePenaltyPerInterval}p, max {form.defaultHilinemineMaxPenalty}p
            </p>
          )}
        </div>

        {error && <div className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</div>}

        <button type="submit" disabled={loading}
          className="w-full bg-blue-600 text-white py-2.5 px-4 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
          {loading ? "Loon..." : "Loo võistlus"}
        </button>

      </form>
    </div>
  )
}
