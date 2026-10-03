"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type FreezeState = { freezeAt: string | null; frozen: boolean }

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("et-EE", { dateStyle: "medium", timeStyle: "short" })
}

// <input type="datetime-local"> väärtus brauseri ajavööndis.
function toLocalInput(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function LeaderboardFreezeSettings({ competitionId, initial }: { competitionId: string; initial: FreezeState }) {
  const router = useRouter()
  const [state, setState] = useState(initial)
  const [time, setTime] = useState(() => toLocalInput(new Date(Date.now() + 60 * 60 * 1000)))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const url = `/api/competitions/${competitionId}/leaderboard-freeze`

  async function send(init: RequestInit) {
    setBusy(true)
    setError("")
    try {
      const response = await fetch(url, init)
      const body = await response.json().catch(() => ({}))
      if (!response.ok) { setError(body.error ?? "Salvestamine ebaõnnestus."); return }
      setState(body as FreezeState)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  function schedule() {
    const date = new Date(time)
    if (Number.isNaN(date.getTime())) { setError("Vali külmutamise aeg."); return }
    void send({ method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ freezeAt: date.toISOString() }) })
  }

  function reveal() {
    if (!window.confirm(state.frozen ? "Avalikusta jooksvad tulemused? Avalik pingerida hakkab kohe uuenema." : "Tühista ajastatud külmutamine?")) return
    void send({ method: "DELETE" })
  }

  return (
    <Card className="mt-6 space-y-4 p-5">
      <div>
        <h2 className="font-semibold text-gray-900">Pingerea külmutamine</h2>
        <p className="mt-1 text-sm text-gray-500">
          Külmutamise hetkest näitavad avalik pingerida, avalik ülevaade ja ekraan seda seisu. Analüüs ja simulaator on suletud ning
          võistlejad ei näe punkte ega kohti. Korraldajad näevad jooksvat seisu edasi. Autasustamisel avalikusta tulemused.
        </p>
      </div>
      <p role="status" className={`rounded-lg px-3 py-2 text-sm ${state.frozen ? "bg-primary-soft text-primary-hover" : "bg-canvas text-ink-soft"}`}>
        {state.freezeAt == null
          ? "Pingerida ei ole külmutatud."
          : state.frozen
            ? `Avalik pingerida on külmutatud seisuga ${formatTime(state.freezeAt)}.`
            : `Avalik pingerida külmutatakse ${formatTime(state.freezeAt)}.`}
      </p>
      <div className="flex flex-wrap items-end gap-3">
        {!state.frozen && (
          <>
            <label className="text-sm">
              <span className="text-gray-600">Külmuta kell</span>
              <Input type="datetime-local" value={time} onChange={(event) => setTime(event.target.value)} className="mt-1 w-auto" />
            </label>
            <Button type="button" variant="secondary" onClick={schedule} disabled={busy}>Ajasta</Button>
            <Button type="button" onClick={() => void send({ method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ now: true }) })} disabled={busy}>Külmuta kohe</Button>
          </>
        )}
        {state.freezeAt != null && (
          <Button type="button" variant={state.frozen ? "primary" : "secondary"} onClick={reveal} disabled={busy}>
            {state.frozen ? "Avalikusta tulemused" : "Tühista ajastus"}
          </Button>
        )}
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </Card>
  )
}
