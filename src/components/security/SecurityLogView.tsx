"use client"

import { useEffect, useState } from "react"
import { SECURITY_ACTION_LABELS, SECURITY_OUTCOME_LABELS, SECURITY_OUTCOMES, type SecurityOutcome } from "@/lib/security"
import { SECURITY_ALERT_SEVERITY_LABELS, type SecurityAlertSeverity } from "@/lib/securityAlerts"

type Event = {
  id: string; createdAt: string; action: string; outcome: SecurityOutcome
  route: string; method: string; status: number | null; durationMs: number | null
  actorUserId: string | null; actorTokenId: string | null; actorName: string | null
  attemptedAccountName: string | null; recordCount: number | null
  fingerprint: string | null; targetIds: Record<string, string>
}
type LogResponse = { events: Event[]; nextCursor: string | null; last24Hours: Partial<Record<SecurityOutcome, number>> }
type Alert = {
  id: string; severity: SecurityAlertSeverity; title: string; description: string
  subjectKey: string; subjectLabel: string; eventCount: number
  firstEventAt: string; lastEventAt: string; resolvedAt: string | null; resolvedByName: string | null
}
type AlertsResponse = { open: Alert[]; resolved: Alert[] }
type Subject = { key: string; label: string }

const SEVERITY_STYLES: Record<SecurityAlertSeverity, string> = {
  HIGH: "border-red-300 bg-red-50",
  MEDIUM: "border-amber-300 bg-amber-50",
  LOW: "border-gray-200 bg-white",
}

const formatTime = (value: string) => new Date(value).toLocaleString("et-EE")

function alertPeriod(alert: Alert) {
  const first = formatTime(alert.firstEventAt)
  const last = formatTime(alert.lastEventAt)
  return first === last ? first : `${first} – ${last}`
}

export function SecurityLogView() {
  const [outcome, setOutcome] = useState("")
  const [action, setAction] = useState("")
  const [subject, setSubject] = useState<Subject | null>(null)
  const [cursor, setCursor] = useState("")
  const [refresh, setRefresh] = useState(0)
  const [data, setData] = useState<LogResponse | null>(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  const [alerts, setAlerts] = useState<AlertsResponse | null>(null)
  const [alertError, setAlertError] = useState("")
  const [resolving, setResolving] = useState("")

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError("")
    const params = new URLSearchParams({ outcome, action, cursor, ...(subject ? { subject: subject.key } : {}) })
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
  }, [outcome, action, subject, cursor, refresh])

  useEffect(() => {
    const controller = new AbortController()
    fetch("/api/security-alerts", { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error("Hoiatuste laadimine ebaõnnestus.")
        return response.json() as Promise<AlertsResponse>
      })
      .then(result => { setAlerts(result); setAlertError("") })
      .catch(err => { if (!controller.signal.aborted) setAlertError(err.message) })
    return () => controller.abort()
  }, [refresh])

  async function resolve(alert: Alert) {
    setResolving(alert.id)
    setAlertError("")
    try {
      const response = await fetch(`/api/security-alerts/${alert.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolved: true }),
      })
      if (!response.ok) throw new Error("Hoiatust ei õnnestunud lahendatuks märkida.")
      setRefresh(value => value + 1)
    } catch (err) {
      setAlertError(err instanceof Error ? err.message : "Hoiatust ei õnnestunud lahendatuks märkida.")
    } finally {
      setResolving("")
    }
  }

  function showEvents(alert: Alert) {
    setSubject({ key: alert.subjectKey, label: alert.subjectLabel })
    setOutcome("")
    setAction("")
    setCursor("")
    document.getElementById("security-events-heading")?.scrollIntoView({ behavior: "smooth" })
  }

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
      <p className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
        Turvalogi kontrollib iga 5 minuti järel sisselogimiste, keelatud päringute, eksportide ja tundlike muudatuste mustreid.
        Kõrge ja keskmise tasemega hoiatustest saavad administraatorid e-kirja. Hoiatus ei tõesta üksi rünnet ja
        logi ei näe rakendusest mööda minevaid tegevusi, näiteks otse andmebaasi pöördumisi, seega ei välista see andmeleket.
        „Lõpptulemus puudub” tähendab, et toiming käib või selle lõppu ei õnnestunud salvestada.
      </p>

      <section aria-labelledby="security-alerts-heading" className="space-y-3">
        <h2 id="security-alerts-heading" className="text-lg font-semibold text-gray-900">Hoiatused</h2>
        {alertError && <p role="alert" className="text-red-700">{alertError}</p>}
        {!alerts ? !alertError && <p role="status" className="text-sm text-gray-500">Laadin hoiatusi…</p> : (
          <>
            {alerts.open.length === 0
              ? <p className="rounded-xl border bg-white p-4 text-sm text-gray-600">Avatud hoiatusi pole.</p>
              : <ul aria-label="Avatud hoiatused" className="space-y-3">
                {alerts.open.map(alert => <li key={alert.id} className={`rounded-xl border p-4 text-sm ${SEVERITY_STYLES[alert.severity]}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <strong>{alert.title}</strong>
                    <span className="rounded-full border bg-white px-2 py-0.5 text-xs font-medium">{SECURITY_ALERT_SEVERITY_LABELS[alert.severity]}</span>
                  </div>
                  <p className="mt-2 break-words">{alert.description}</p>
                  <p className="mt-2 text-xs text-gray-600">{alertPeriod(alert)} · seotud sündmusi {alert.eventCount}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => showEvents(alert)}
                      className="min-h-11 rounded-lg border bg-white px-4">Näita sündmusi</button>
                    <button type="button" onClick={() => resolve(alert)} disabled={resolving === alert.id}
                      className="min-h-11 rounded-lg border bg-white px-4 disabled:opacity-50">
                      {resolving === alert.id ? "Salvestan…" : "Märgi lahendatuks"}
                    </button>
                  </div>
                </li>)}
              </ul>}
            {alerts.resolved.length > 0 && <details className="rounded-xl border bg-white p-4 text-sm">
              <summary className="cursor-pointer">Viimati lahendatud ({alerts.resolved.length})</summary>
              <ul className="mt-3 space-y-2">
                {alerts.resolved.map(alert => <li key={alert.id} className="border-t pt-2">
                  <p><strong>{alert.title}</strong> · {SECURITY_ALERT_SEVERITY_LABELS[alert.severity]}</p>
                  <p className="text-gray-600">{alert.description}</p>
                  <p className="text-xs text-gray-500">
                    {alertPeriod(alert)} · lahendas {alert.resolvedByName ?? "tundmatu"}{alert.resolvedAt ? ` ${formatTime(alert.resolvedAt)}` : ""}
                  </p>
                </li>)}
              </ul>
            </details>}
          </>
        )}
      </section>

      {data && <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Viimased 24 tundi">
        {(["DENIED", "RATE_LIMITED", "FAILED"] as const).map(key => (
          <div key={key} className="rounded-xl border bg-white p-4">
            <p className="text-sm text-gray-500">{SECURITY_OUTCOME_LABELS[key]} · 24 h</p>
            <p className="mt-1 text-2xl font-semibold">{data.last24Hours[key] ?? 0}</p>
          </div>
        ))}
      </div>}
      <h2 id="security-events-heading" className="text-lg font-semibold text-gray-900">Sündmused</h2>
      <form className="flex flex-wrap items-end gap-3" onSubmit={event => event.preventDefault()}>
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
        {subject && <p className="flex min-h-11 flex-wrap items-center gap-2 rounded-lg border bg-white px-3 text-sm">
          <span className="break-all">Ainult: {subject.label}</span>
          <button type="button" onClick={() => { setSubject(null); setCursor("") }} className="text-blue-700 underline">Eemalda filter</button>
        </p>}
      </form>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {loading ? <p role="status" className="text-sm text-gray-500">Laadin turvalogi…</p> : data && (
        <>
          {data.events.length === 0 && <p className="text-gray-500">Valitud filtritele vastavaid sündmusi pole.</p>}
          <ul className="space-y-3">
            {data.events.map(event => <li key={event.id} className="rounded-xl border bg-white p-4 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <strong>{SECURITY_ACTION_LABELS[event.action] ?? event.action}</strong>
                <time className="text-gray-500" dateTime={event.createdAt}>{formatTime(event.createdAt)}</time>
              </div>
              <p className={`mt-2 font-medium ${event.outcome === "SUCCEEDED" ? "text-green-700" : "text-amber-800"}`}>
                {SECURITY_OUTCOME_LABELS[event.outcome]}{event.status != null ? ` · HTTP ${event.status}` : ""}
              </p>
              <p className="mt-2 break-all">Tegutseja: {event.actorTokenId ? `ligipääsutoken ${event.actorTokenId}` : event.actorName ?? event.actorUserId ?? "Tuvastamata"}</p>
              {event.actorUserId && event.actorName && <p className="break-all text-xs text-gray-500">Kasutaja ID: {event.actorUserId}</p>}
              {event.action === "LOGIN" && event.targetIds.userId && <p className="mt-2 break-all">Proovitud konto (kinnitamata): {event.attemptedAccountName ?? event.targetIds.userId}</p>}
              {event.targetIds.loginAccountHash && <p className="mt-1 text-xs text-gray-500">Proovitud konto tunnus: {event.targetIds.loginAccountHash.slice(0, 12)}</p>}
              {event.recordCount != null && <p className="mt-2">Eksporditud ridu: {event.recordCount}</p>}
              <p className="mt-2 break-all font-mono text-xs text-gray-600">{event.method} {event.route}</p>
              {Object.entries(event.targetIds)
                .filter(([key]) => key !== "loginAccountHash" && !(event.action === "LOGIN" && key === "userId"))
                .map(([key, value]) => <p key={key} className="break-all text-xs text-gray-500">{key}: {value}</p>)}
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
