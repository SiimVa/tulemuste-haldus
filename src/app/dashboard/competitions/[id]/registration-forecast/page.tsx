"use client"

import Link from "next/link"
import { use, useEffect, useState } from "react"
import { CompetitionNav } from "@/components/competition/CompetitionNav"
import { tempoForecast, historicalForecast, DAY_MS, type Forecast, type RegistrationStatistics } from "@/lib/registrationForecast"

type Data = {
  now: string
  name: string
  status: string
  statistics: RegistrationStatistics
  candidates: { id: string; name: string; closesAt: string }[]
  references: { id: string; name: string; statistics: RegistrationStatistics }[]
}
const date = (value: string) => new Date(value).toLocaleDateString("et-EE", { timeZone: "UTC" })
const panel = "rounded-xl border border-line bg-surface p-5"

function ForecastCard({ title, forecast, reason }: { title: string; forecast: Forecast | null; reason: string }) {
  return <section className={panel}>
    <h2 className="font-semibold text-ink">{title}</h2>
    {forecast ? <>
      <p className="mt-3 text-4xl font-bold text-primary">{forecast.estimate} <span className="text-base font-normal text-ink-muted">võistkonda</span></p>
      <p className="mt-2 text-sm">Hinnanguline vahemik <strong>{forecast.low}–{forecast.high}</strong></p>
      <p className="mt-2 text-sm">Kohtade piiri arvestades kuni <strong>{forecast.participants}</strong> võistkonda.</p>
      <p className="mt-4 text-sm text-ink-muted">{forecast.explanation}</p>
    </> : <p className="mt-4 text-sm text-ink-muted">{reason}</p>}
  </section>
}

function ForecastChart({ statistics, forecasts }: { statistics: RegistrationStatistics; forecasts: { title: string; color: string; value: Forecast | null }[] }) {
  const days = statistics.days
  const start = new Date(days[0].day).getTime()
  const now = new Date(statistics.asOf).getTime()
  const end = Math.max(now, statistics.closesAt ? new Date(statistics.closesAt).getTime() : now, start + DAY_MS)
  const max = Math.max(1, ...days.map(d => d.active), ...forecasts.map(f => f.value?.high ?? 0))
  const x = (time: number) => 48 + (time - start) / (end - start) * 690
  const y = (count: number) => 220 - count / max * 190
  const last = days[days.length - 1].active
  const points = days.map(d => `${x(new Date(d.day).getTime())},${y(d.active)}`).join(" ") + ` ${x(now)},${y(last)}`
  return <section className={panel}>
    <h2 className="font-semibold">Registreerimise kulg</h2>
    <p className="mt-1 text-sm text-ink-muted">Aktiivsed avaldused päevade lõikes. Katkendjooned näitavad prognoosi tähtajani.</p>
    <div className="overflow-x-auto"><svg viewBox="0 0 780 260" className="mt-4 w-full min-w-[560px]" role="img" aria-label="Aktiivsete registreeringute ajalugu ja prognoos tähtajani. Täpsed ajalooandmed on allolevas tabelis.">
      {[0, 0.5, 1].map(fraction => <g key={fraction}>
        <line x1="48" x2="738" y1={y(max * fraction)} y2={y(max * fraction)} stroke="#d1d5db" />
        <text x="40" y={y(max * fraction) + 4} textAnchor="end" fontSize="12" fill="#4b5563">{Math.round(max * fraction)}</text>
      </g>)}
      <polyline points={points} fill="none" stroke="#2563eb" strokeWidth="3" />
      {forecasts.map(f => f.value && <g key={f.title}>
        <polygon points={`${x(now)},${y(last)} ${x(end)},${y(f.value.low)} ${x(end)},${y(f.value.high)}`} fill={f.color} opacity="0.07" />
        <line x1={x(now)} y1={y(last)} x2={x(end)} y2={y(f.value.estimate)} stroke={f.color} strokeWidth="2" strokeDasharray="7 5" />
        <circle cx={x(end)} cy={y(f.value.estimate)} r="4" fill={f.color} />
      </g>)}
      <text x="48" y="246" fontSize="12" fill="#4b5563">{date(days[0].day)}</text>
      <text x="738" y="246" textAnchor="end" fontSize="12" fill="#4b5563">{date(new Date(end).toISOString())}</text>
    </svg></div>
    <div className="flex flex-wrap gap-4 text-sm"><span className="text-blue-600">━ Senine registreerimine</span>{forecasts.map(f => f.value && <span key={f.title} style={{ color: f.color }}>┄ {f.title}</span>)}</div>
    <details className="mt-4 text-sm"><summary className="cursor-pointer font-medium">Vaata päevade andmeid</summary>
      <p className="my-2 text-ink-muted">Näidatakse muutustega päevi ja perioodi piire. Vahepealsetel päevadel arv ei muutunud. Kuupäevad UTC ajas.</p>
      <div className="max-h-80 overflow-auto"><table className="w-full text-left"><thead><tr>{["Kuupäev", "Esitatud kokku", "Aktiivsed", "Kinnitatud", "Loobunud", "Tagasi lükatud"].map(t => <th className="p-2" key={t}>{t}</th>)}</tr></thead>
        <tbody>{days.map(d => <tr className="border-t border-line" key={d.day}><td className="p-2 whitespace-nowrap">{date(d.day)}</td>{[d.submitted, d.active, d.confirmed, d.withdrawn, d.rejected].map((v, i) => <td className="p-2" key={i}>{v}</td>)}</tr>)}</tbody></table></div>
    </details>
  </section>
}

export default function RegistrationForecastPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [data, setData] = useState<Data | null>(null)
  const [selected, setSelected] = useState<string[] | null>(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(`registration-forecast:${id}`) ?? "[]")
      setSelected(Array.isArray(saved) ? saved.filter((v): v is string => typeof v === "string").slice(0, 20) : [])
    } catch { setSelected([]) }
  }, [id])
  useEffect(() => {
    if (selected === null) return
    const controller = new AbortController()
    setLoading(true)
    setError("")
    const query = new URLSearchParams()
    selected.forEach(value => query.append("compare", value))
    fetch(`/api/competitions/${id}/registration-forecast?${query}`, { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.error ?? "Prognoosi laadimine ebaõnnestus")
        setData(body)
      })
      .catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Laadimine ebaõnnestus") })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [id, selected, refresh])
  function select(values: string[]) {
    setSelected(values)
    try { localStorage.setItem(`registration-forecast:${id}`, JSON.stringify(values)) } catch { /* Selection still works without browser storage. */ }
  }
  const now = data ? new Date(data.now) : new Date()
  const tempo = data ? tempoForecast(data.statistics, now) : null
  const history = data ? historicalForecast(data.statistics, data.references.map(r => r.statistics), now) : null
  const canForecast = data?.status === "OPEN"
  const current = data?.statistics.days[data.statistics.days.length - 1]
  const closedReason = "Registreerimine pole avatud. Näidatakse säilinud registreerimisajalugu."
  return <div className="space-y-6">
    <Link href={`/dashboard/competitions/${id}`} className="text-sm text-ink-muted">← {data?.name ?? "Tagasi võistlusele"}</Link>
    <header><h1 className="text-2xl font-bold">Registreerimise prognoos</h1><p className="mt-2 text-ink-muted">Eeldatav aktiivsete registreeringute arv registreerimise lõpuks. Kohaletulekut see hinnang ei ennusta.</p></header>
    <CompetitionNav competitionId={id} />
    <div className="flex flex-wrap gap-3"><button onClick={() => setRefresh(v => v + 1)} className="rounded border border-line px-3 py-2 text-sm" disabled={loading}>Värskenda</button><button onClick={() => select([])} className="rounded border border-line px-3 py-2 text-sm">Tühjenda võrdlusvalik</button></div>
    {error && <p role="alert" className="rounded bg-red-50 p-4 text-red-700">{error}</p>}
    {loading && <p role="status" className="text-ink-muted">Laadin prognoosi…</p>}
    {data && current && !error && !loading && <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[
        ["Aktiivseid registreeringuid", current.active], ["Esitatud kokku", current.submitted],
        ["Viimase perioodi netotempo", `${(tempo?.rate ?? 0).toLocaleString("et-EE", { maximumFractionDigits: 1 })} / päev`],
        ["Tähtajani", data.statistics.closesAt ? `${Math.ceil(tempo?.remaining ?? 0)} päeva` : "Tähtaeg määramata"],
      ].map(([label, value]) => <div className={panel} key={label}><p className="text-sm text-ink-muted">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>)}</div>
      {data.statistics.undatedTeams > 0 && <p className="rounded bg-amber-50 p-4 text-sm text-amber-900">Võistlusel on {data.statistics.undatedTeams} käsitsi lisatud või vana töövoo võistkonda, kellel puudub täielik avalduse ajalugu. Neid prognoosi ei kaasata; hinnang hõlmab ainult registreerimisavaldusi.</p>}
      {data.statistics.incompleteHistories > 0 && <p className="rounded bg-amber-50 p-4 text-sm text-amber-900">{data.statistics.incompleteHistories} avalduse staatuste ajalugu on puudulik. Varasemate päevade aktiivsete registreeringute arv võib olla ebatäpne; see võistlus ei sobi ajaloolise prognoosi võrdlusaluseks.</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        <ForecastCard title="Senise tempo prognoos" forecast={canForecast ? tempo?.forecast ?? null : null} reason={canForecast ? tempo?.reason ?? "" : closedReason} />
        <ForecastCard title="Ajalooline prognoos" forecast={canForecast ? history?.forecast ?? null : null} reason={canForecast ? history?.reason ?? "" : closedReason} />
      </div>
      <section className={panel}>
        <h2 className="font-semibold">Võrdlusvõistlused</h2>
        <p className="mt-1 text-sm text-ink-muted">Vali kuni 20 sarnast võistlust. Näed enda hallatavaid võistlusi, mille registreerimise tähtaeg on möödunud. Valik jääb selles brauseris meelde.</p>
        {data.candidates.length ? <div className="mt-4 max-h-72 space-y-2 overflow-auto">{data.candidates.map(candidate => <label className="flex cursor-pointer items-center gap-3 rounded border border-line p-3" key={candidate.id}>
          <input type="checkbox" checked={selected?.includes(candidate.id) ?? false} disabled={!selected?.includes(candidate.id) && (selected?.length ?? 0) >= 20}
            onChange={event => select(event.target.checked ? [...(selected ?? []), candidate.id] : (selected ?? []).filter(v => v !== candidate.id))} />
          <span className="text-sm">{candidate.name}<span className="ml-2 text-ink-muted">Tähtaeg {date(candidate.closesAt)}</span></span>
        </label>)}</div> : <p className="mt-4 text-sm text-ink-muted">Sobiva tähtajaga varasemaid võistlusi veel pole.</p>}
        {data.references.length > 0 && <div className="mt-4 space-y-2 text-sm">{data.references.map(ref => {
          const result = historicalForecast(data.statistics, [ref.statistics], now)
          return <p key={ref.id}><strong>{ref.name}:</strong> {result.forecast ? `hinnang ${result.forecast.estimate} võistkonda` : "Võrdluseks ei piisa andmetest või samal ajal polnud registreerimine veel avatud."}</p>
        })}<p className="text-ink-muted">Arvutusse sobis {history?.used ?? 0} / {data.references.length} valitud võistlust.</p></div>}
      </section>
      <ForecastChart statistics={data.statistics} forecasts={[
        { title: "Senine tempo", color: "#059669", value: canForecast ? tempo?.forecast ?? null : null },
        { title: "Ajalooline prognoos", color: "#9333ea", value: canForecast ? history?.forecast ?? null : null },
      ]} />
      <p className="text-xs text-ink-muted">Andmete seis: {new Date(data.statistics.asOf).toLocaleString("et-EE")}. Mustandeid ei arvestata. Aktiivsed on kinnitatud, ootenimekirjas ja menetluses avaldused. Päevakokkuvõtted säilivad pärast kontakt- ja sünniandmete puhastamist; võistluse täielik kustutamine eemaldab ka statistika.</p>
    </>}
  </div>
}
