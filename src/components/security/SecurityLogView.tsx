"use client"

import { useEffect, useState } from "react"
import { SECURITY_ACTION_LABELS, SECURITY_OUTCOME_LABELS, SECURITY_OUTCOMES, type SecurityOutcome } from "@/lib/security"

type Event = {
  id: string; createdAt: string; action: string; outcome: SecurityOutcome
  route: string; method: string; status: number | null; durationMs: number | null
  actorUserId: string | null; actorTokenId: string | null; actorName: string | null
  fingerprint: string | null; targetIds: Record<string, string>
}
type LogResponse = { events: Event[]; nextCursor: string | null; last24Hours: Partial<Record<SecurityOutcome, number>> }

export function SecurityLogView() {
  const [outcome, setOutcome] = useState("")
  const [action, setAction] = useState("")
  const [cursor, setCursor] = useState("")
  const [refresh, setRefresh] = useState(0)
  const [data, setData] = useState<LogResponse | null>(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError("")
    const params = new URLSearchParams({ outcome, action, cursor })
    fetch(`/api/security-events?${params}`, { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error(response.status === 403 || response.status === 401
          ? "Turvalogi saab vaadata ainult administraator."
          : response.status === 429 ? "Liiga palju päringuid. Proovi mõne aja pärast uuesti." : "Turvalogi laadimine ebaõnnestus.")
        return response.json() as Promise<LogResponse>
      })
      .then(setData)
      .catch(err => { if (!controller.signal.aborted) { setData(null); setError(err.message) } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [outcome, action, cursor, refresh])

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Turvalogi</h1>
          <p className="mt-1 text-sm text-gray-600">Sisselogimised, API muudatused, ekspordid ja keelatud päringud. Säilitamine 90 päeva.</p>
        </div>
        <button type="button" onClick={() => setRefresh(value => value + 1)} disabled={loading}
          className="min-h-11 rounded-lg border bg-white px-4 text-sm disabled:opacity-50">Värskenda</button>
      </div>
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        See logi aitab märgata kahtlaseid tegevusi, kuid ei tõesta üksi rünnet ega välista andmeleket.
        Automaatseid turvahoiatusi e-postile veel ei saadeta. „Lõpptulemus puudub” tähendab, et toiming käib või selle lõppu ei õnnestunud salvestada.
      </p>
      {data && <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Viimased 24 tundi">
        {(["DENIED", "RATE_LIMITED", "FAILED"] as const).map(key => (
          <div key={key} className="rounded-xl border bg-white p-4">
            <p className="text-sm text-gray-500">{SECURITY_OUTCOME_LABELS[key]} · 24 h</p>
            <p className="mt-1 text-2xl font-semibold">{data.last24Hours[key] ?? 0}</p>
          </div>
        ))}
      </div>}
      <form className="flex flex-wrap gap-3" onSubmit={event => event.preventDefault()}>
        <div className="text-sm">
          <label htmlFor="security-outcome">Tulemus</label>
          <select id="security-outcome" value={outcome} onChange={event => { setOutcome(event.target.value); setCursor("") }}
            className="mt-1 block min-h-11 rounded-lg border bg-white px-3">
            <option value="">Kõik tulemused</option>
            {SECURITY_OUTCOMES.map(key => <option key={key} value={key}>{SECURITY_OUTCOME_LABELS[key]}</option>)}
          </select>
        </div>
        <div className="text-sm">
          <label htmlFor="security-action">Tegevus</label>
          <select id="security-action" value={action} onChange={event => { setAction(event.target.value); setCursor("") }}
            className="mt-1 block min-h-11 max-w-full rounded-lg border bg-white px-3">
            <option value="">Kõik tegevused</option>
            {Object.entries(SECURITY_ACTION_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </div>
      </form>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {loading ? <p role="status" className="text-sm text-gray-500">Laadin turvalogi…</p> : data && (
        <>
          {data.events.length === 0 && <p className="text-gray-500">Valitud filtritele vastavaid sündmusi pole.</p>}
          <ul className="space-y-3">
            {data.events.map(event => <li key={event.id} className="rounded-xl border bg-white p-4 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <strong>{SECURITY_ACTION_LABELS[event.action] ?? event.action}</strong>
                <time className="text-gray-500" dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString("et-EE")}</time>
              </div>
              <p className={`mt-2 font-medium ${event.outcome === "SUCCEEDED" ? "text-green-700" : "text-amber-800"}`}>
                {SECURITY_OUTCOME_LABELS[event.outcome]}{event.status != null ? ` · HTTP ${event.status}` : ""}
              </p>
              <p className="mt-2 break-all">Tegutseja: {event.actorTokenId ? `ligipääsutoken ${event.actorTokenId}` : event.actorName ?? event.actorUserId ?? "Tuvastamata"}</p>
              {event.actorUserId && event.actorName && <p className="break-all text-xs text-gray-500">Kasutaja ID: {event.actorUserId}</p>}
              <p className="mt-2 break-all font-mono text-xs text-gray-600">{event.method} {event.route}</p>
              {Object.entries(event.targetIds).map(([key, value]) => <p key={key} className="break-all text-xs text-gray-500">{key}: {value}</p>)}
              {event.fingerprint && <p className="mt-2 text-xs text-gray-500">Pseudonüümne allikas: {event.fingerprint.slice(0, 12)}</p>}
            </li>)}
          </ul>
          <div className="flex flex-wrap gap-3">
            {cursor && <button type="button" onClick={() => setCursor("")} className="min-h-11 rounded-lg border bg-white px-4 text-sm">Uusimad sündmused</button>}
            {data.nextCursor && <button type="button" onClick={() => setCursor(data.nextCursor ?? "")} className="min-h-11 rounded-lg border bg-white px-4 text-sm">Vanemad sündmused</button>}
          </div>
        </>
      )}
    </section>
  )
}
