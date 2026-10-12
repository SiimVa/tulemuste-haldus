"use client"

import { useEffect, useState } from "react"
import { cardClass } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { DIGEST_INTERVALS, DIGEST_INTERVAL_LABELS, isDigestInterval, type DigestInterval } from "@/lib/organizerDigest"

type Subscription = { registration: boolean; mandate: boolean; interval: string; nextSendAt: string }

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString("et-EE", { timeZone: "Europe/Tallinn", dateStyle: "medium", timeStyle: "short" })

// Korraldaja enda e-posti kokkuvõte registreerimise ja/või mandaadi sündmustest.
export function OrganizerDigestMenu({ competitionId }: { competitionId: string }) {
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [registration, setRegistration] = useState(true)
  const [mandate, setMandate] = useState(true)
  const [interval, setDigestInterval] = useState<DigestInterval>("DAILY")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState("")

  function apply(next: Subscription | null) {
    setSubscription(next)
    if (!next) return
    setRegistration(next.registration)
    setMandate(next.mandate)
    if (isDigestInterval(next.interval)) setDigestInterval(next.interval)
  }

  useEffect(() => {
    fetch(`/api/competitions/${competitionId}/notification-subscription`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return
        apply(data.subscription)
        setEmail(data.email)
      })
      .catch(() => {})
  }, [competitionId])

  async function save(method: "PUT" | "DELETE") {
    setBusy(true)
    setError("")
    setSaved("")
    try {
      const res = await fetch(`/api/competitions/${competitionId}/notification-subscription`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "PUT" ? JSON.stringify({ registration, mandate, interval }) : undefined,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error ?? "Salvestamine ebaõnnestus"); return }
      apply(data.subscription)
      setSaved(method === "PUT" ? "Tellimus salvestatud" : "Tellimus lõpetatud")
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className="group relative">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-control border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-canvas [&::-webkit-details-marker]:hidden">
        E-posti teavitused{subscription && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-success" aria-label="tellitud" />}
        <span aria-hidden className="transition-transform group-open:rotate-180">▾</span>
      </summary>
      <div className={cn(cardClass, "absolute left-0 sm:left-auto sm:right-0 z-20 mt-2 w-[min(24rem,calc(100vw-2rem))] space-y-3 p-4 shadow-lg")}>
        <div>
          <p className="text-sm font-semibold text-ink">Kokkuvõte e-postile</p>
          <p className="mt-1 text-xs text-ink-muted">
            Saad kirja uutest registreeringutest, tagasivõtmistest ja esitatud mandaatidest koos hetkeseisuga.
            Kui uusi sündmusi pole, kirja ei saadeta.{email && <> Saaja: <span className="text-ink">{email}</span></>}
          </p>
        </div>
        <fieldset className="space-y-1.5">
          <legend className="mb-1 text-xs font-medium text-ink-muted">Mille kohta</legend>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={registration} onChange={(e) => setRegistration(e.target.checked)} />
            Registreerimine
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={mandate} onChange={(e) => setMandate(e.target.checked)} />
            Mandaat
          </label>
        </fieldset>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-muted">Kui tihti</span>
          <Select value={interval} onChange={(e) => isDigestInterval(e.target.value) && setDigestInterval(e.target.value)}>
            {DIGEST_INTERVALS.map((value) => <option key={value} value={value}>{DIGEST_INTERVAL_LABELS[value]}</option>)}
          </Select>
        </label>
        {subscription && <p className="text-xs text-ink-muted">Järgmine kontroll: {formatTime(subscription.nextSendAt)}</p>}
        {error && <p className="text-xs text-danger">{error}</p>}
        {saved && <p role="status" className="text-xs text-success">{saved}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => save("PUT")} disabled={busy || (!registration && !mandate)}>
            {subscription ? "Salvesta" : "Telli"}
          </Button>
          {subscription && (
            <Button size="sm" variant="ghost" onClick={() => save("DELETE")} disabled={busy}>
              Lõpeta tellimus
            </Button>
          )}
        </div>
      </div>
    </details>
  )
}
