"use client"

import Link from "next/link"
import { use, useEffect, useState } from "react"
import { CompetitionNav } from "@/components/competition/CompetitionNav"
import { RegistrationExportButtons } from "@/components/registration/RegistrationExportButtons"
import { Button } from "@/components/ui/button"
import { filterReportRows, reportTable, REPORT_STATUS_LABELS, type RegistrationReport } from "@/lib/registrationReport"
import type { FormPhase } from "@/lib/registrationForm"

const panel = "rounded-xl border border-line bg-surface p-4 sm:p-5"
const inputClass = "mt-1 block w-full rounded-control border border-line bg-surface px-3 py-2 text-sm"

export default function RegistrationOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [phase, setPhase] = useState<FormPhase>("REGISTRATION")
  const [data, setData] = useState<RegistrationReport | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [grouped, setGrouped] = useState<string[]>(["class"])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [status, setStatus] = useState("")
  const [className, setClassName] = useState<string | undefined>(undefined)
  const [search, setSearch] = useState("")
  const [summarize, setSummarize] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [refresh, setRefresh] = useState(0)
  const storageKey = `registration-overview:${id}:${phase}`

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError("")
    fetch(`/api/competitions/${id}/registration-overview?phase=${phase}`, { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.error ?? "Ülevaate laadimine ebaõnnestus")
        if (controller.signal.aborted) return
        const report = body as RegistrationReport
        let columns = report.columns.map(column => column.key)
        let groups = ["class"]
        try {
          const saved: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "null")
          if (Array.isArray(saved)) columns = columns.filter(key => saved.includes(key))
          const savedGroups: unknown = JSON.parse(localStorage.getItem(`${storageKey}:summary`) ?? "null")
          if (Array.isArray(savedGroups)) groups = report.columns.filter(column => savedGroups.includes(column.key)).map(column => column.key)
        } catch { /* Column selection also works without browser storage. */ }
        setSelected(columns)
        setGrouped(groups)
        setData(report)
      })
      .catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Ülevaate laadimine ebaõnnestus") })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [id, phase, refresh, storageKey])

  function select(keys: string[]) {
    if (summarize) setGrouped(keys)
    else setSelected(keys)
    try { localStorage.setItem(summarize ? `${storageKey}:summary` : storageKey, JSON.stringify(keys)) } catch { /* Keep the in-memory selection. */ }
  }
  const activeSelection = summarize ? grouped : selected
  const filters = { status, className, search, answers }
  const rows = data ? filterReportRows(data.rows, filters) : []
  const columns = data?.columns.filter(column => activeSelection.includes(column.key)) ?? []
  const view = summarize ? "summary" : "teams"
  const table = data ? reportTable(data, activeSelection, filters, view) : { columns: [], rows: [] }
  const classes = [...new Set(data?.rows.map(row => row.className) ?? [])].sort((a, b) => a.localeCompare(b, "et"))
  const statuses = [...new Set(data?.rows.map(row => row.status) ?? [])]

  return <div className="min-w-0 space-y-6">
    <Link href={`/dashboard/competitions/${id}`} className="text-sm text-ink-muted">← {data?.name ?? "Tagasi võistlusele"}</Link>
    <header>
      <h1 className="text-2xl font-bold">Registreerimise ülevaade</h1>
      <p className="mt-2 text-ink-muted">Vaata võistkondade arvu maakonna või muu vormivälja järgi. Vali koondamise alus ja vajadusel filtreeri vastuseid; eksport sisaldab sama tabelit.</p>
    </header>
    <CompetitionNav competitionId={id} />
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="text-sm font-medium">
        <label htmlFor="report-phase">Andmed</label>
        <select id="report-phase" className={inputClass} value={phase} onChange={event => { setPhase(event.target.value as FormPhase); setData(null); setStatus(""); setClassName(undefined); setSearch(""); setAnswers({}) }}>
          <option value="REGISTRATION">Registreerimine</option>
          <option value="MANDATE">Mandaat</option>
        </select>
      </div>
      <Button type="button" variant="secondary" onClick={() => setRefresh(value => value + 1)} disabled={loading}>Värskenda</Button>
    </div>
    {error && <p role="alert" className="text-danger">{error}</p>}
    {loading ? <p role="status" className="py-8 text-ink-muted">Laadin ülevaadet…</p> : !error && data && <>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Kokku", data.rows.length],
          [phase === "MANDATE" ? "Mandaat kinnitatud" : "Registreeritud", data.rows.filter(row => ["CONFIRMED", "APPROVED"].includes(row.status)).length],
          [phase === "MANDATE" ? "Mandaat esitatud" : "Ootenimekirjas", data.rows.filter(row => row.status === (phase === "MANDATE" ? "SUBMITTED" : "WAITLISTED")).length],
        ].map(([label, value]) => <div className={panel} key={label}><p className="text-sm text-ink-muted">{label}</p><p className="mt-2 text-3xl font-bold">{value}</p></div>)}
      </div>
      <section className={panel} aria-label="Ülevaate valikud">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={summarize} onChange={event => setSummarize(event.target.checked)} />
          Koonda samad vastused
        </label>
        {summarize && <div className="mt-4">
          <label htmlFor="report-group" className="text-sm font-medium">Koonda välja järgi</label>
          <select id="report-group" className={`${inputClass} sm:max-w-sm`} value={grouped.length === 1 ? grouped[0] : ""} onChange={event => select(event.target.value ? [event.target.value] : [])}>
            <option value="">Vali koondamise alus</option>
            <optgroup label="Vormiväljad">{data.columns.filter(column => column.group === "form").map(column => <option key={column.key} value={column.key}>{column.label}</option>)}</optgroup>
            <optgroup label="Põhiandmed">{data.columns.filter(column => column.group === "basic").map(column => <option key={column.key} value={column.key}>{column.label}</option>)}</optgroup>
          </select>
          <p className="mt-2 text-sm text-ink-muted">Vali näiteks „Maakond”, et näha iga maakonna võistkondade arvu. Mitme välja järgi koondamiseks märgi allpool vajalikud väljad.</p>
        </div>}
      </section>
      <details className={panel} open>
        <summary className="cursor-pointer font-semibold">{summarize ? "Koondamise aluseks olevad väljad" : "Kuvatavad veerud"} ({columns.length}/{data.columns.length})</summary>
        <div className="my-3 flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={() => select(data.columns.map(column => column.key))}>Vali kõik</Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => select([])}>Tühjenda valik</Button>
        </div>
        {(["basic", "form"] as const).map(group => <fieldset key={group} className="mt-4">
          <legend className="text-sm font-medium text-ink-muted">{group === "basic" ? "Põhiandmed" : "Vormiväljad"}</legend>
          <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.columns.filter(column => column.group === group).map(column => <label key={column.key} className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5" checked={activeSelection.includes(column.key)} onChange={event => select(event.target.checked ? [...activeSelection, column.key] : activeSelection.filter(key => key !== column.key))} />
              {column.label}
            </label>)}
          </div>
        </fieldset>)}
        <p className="mt-4 text-xs text-ink-muted">Koondamise väljad ja võistkondade loendi veerud säilivad eraldi selles brauseris võistluse ja etapi kaupa.</p>
      </details>
      <section className={panel}>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm">Otsi võistkonda või esindajat<input type="search" className={inputClass} value={search} onChange={event => setSearch(event.target.value)} placeholder="Nimi, tähis või e-post" /></label>
          <div className="text-sm"><label htmlFor="report-status">Staatus</label><select id="report-status" className={inputClass} value={status} onChange={event => setStatus(event.target.value)}><option value="">Kõik staatused</option>{statuses.map(value => <option key={value} value={value}>{REPORT_STATUS_LABELS[value] ?? value}</option>)}</select></div>
          <div className="text-sm"><label htmlFor="report-class">Klass</label><select id="report-class" className={inputClass} value={className === undefined ? "all" : `class:${className}`} onChange={event => setClassName(event.target.value === "all" ? undefined : event.target.value.slice(6))}><option value="all">Kõik klassid</option>{classes.map(value => <option key={value} value={`class:${value}`}>{value || "Klass määramata"}</option>)}</select></div>
        </div>
        {data.columns.some(column => column.group === "form") && <fieldset className="mt-5">
          <legend className="text-sm font-semibold">Filtreeri vormivastuseid</legend>
          <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.columns.filter(column => column.group === "form").map(column => {
              const values = [...new Set(data.rows.map(row => String(row.cells[column.key] ?? "")))].sort((a, b) => a.localeCompare(b, "et", { numeric: true }))
              return <label key={column.key} className="min-w-0 text-sm">{column.label}
                <select className={inputClass} aria-label={`Filtreeri: ${column.label}`} value={Object.hasOwn(answers, column.key) ? `answer:${answers[column.key]}` : "all"} onChange={event => setAnswers(current => {
                  const next = { ...current }
                  if (event.target.value === "all") delete next[column.key]
                  else next[column.key] = event.target.value.slice(7)
                  return next
                })}>
                  <option value="all">Kõik vastused</option>
                  {values.map(value => <option key={value} value={`answer:${value}`}>{value || "Vastus puudub"}</option>)}
                </select>
              </label>
            })}
          </div>
          {Object.keys(answers).length > 0 && <Button type="button" size="sm" variant="secondary" className="mt-3" onClick={() => setAnswers({})}>Tühjenda vastusefiltrid</Button>}
        </fieldset>}
        {summarize && <p className="mt-2 text-xs text-ink-muted">Üks rida iga valitud väärtuste kombinatsiooni kohta. Näiteks ainult maakonna valimisel näed võistkondade arvu maakonniti; maakonna ja klassi valimisel maakonna ning klassi kaupa.</p>}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-muted" role="status">Näitan {rows.length} / {data.rows.length} võistkonda{summarize && columns.length > 0 ? ` · ${table.rows.length} rühma` : ""}</p>
          <RegistrationExportButtons competitionId={id} phase={phase} columns={columns.map(column => column.key)} filters={filters} view={view} />
        </div>
        <p className="mt-3 text-xs text-ink-muted">{phase === "MANDATE" ? "Mandaadis kuvatakse võistkondade praegused andmed ja koosseis." : "Registreerimisel kuvatakse avalduste vastused ning varasemad registreeringud. Avaldust ja sellest loodud võistkonda ei dubleerita."}</p>
        {columns.length === 0 ? <p className="py-8 text-sm text-ink-muted">Vali vähemalt üks kuvatav veerg.</p> : <div className="mt-4 max-h-[65vh] overflow-auto rounded-control border border-line" tabIndex={0} role="region" aria-label="Ülevaate tabel">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-canvas"><tr>{table.columns.map(column => <th scope="col" key={column.key} className="whitespace-nowrap p-3 font-semibold">{column.label}</th>)}</tr></thead>
            <tbody>{table.rows.map(row => <tr key={row.id} className="border-t border-line">{table.columns.map(column => <td key={column.key} className="min-w-36 max-w-sm whitespace-pre-line break-words p-3 align-top">{row.cells[column.key] === "" ? "—" : row.cells[column.key]}</td>)}</tr>)}</tbody>
          </table>
          {rows.length === 0 && <p className="p-6 text-sm text-ink-muted">{data.rows.length === 0 ? "Selles etapis andmeid veel pole." : "Valitud filtritele vastavaid võistkondi ei ole."}</p>}
        </div>}
      </section>
    </>}
  </div>
}
