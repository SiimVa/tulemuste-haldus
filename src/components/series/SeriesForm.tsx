"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export type SeriesCompetitionOption = { id: string; name: string; date: string | null; statusLabel: string }

// Üleriikliku arvestuse loomine ja muutmine: nimi ja osavõistlused.
export function SeriesForm({
  competitions,
  initial,
  onDone,
}: {
  competitions: SeriesCompetitionOption[]
  initial?: { id: string; name: string; competitionIds: string[] }
  onDone?: () => void
}) {
  const router = useRouter()
  const [name, setName] = useState(initial?.name ?? "")
  const [selected, setSelected] = useState<string[]>(initial?.competitionIds ?? [])
  const [search, setSearch] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const query = search.trim().toLocaleLowerCase("et")
  const visible = competitions.filter((competition) => !query || competition.name.toLocaleLowerCase("et").includes(query) || selected.includes(competition.id))

  function toggle(id: string) {
    setError("")
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError("")
    // Osavõistlused nime järgi, et järjekord ei sõltuks valimise järjekorrast.
    const competitionIds = competitions.filter((competition) => selected.includes(competition.id))
      .sort((a, b) => a.name.localeCompare(b.name, "et"))
      .map((competition) => competition.id)
    const response = await fetch(initial ? `/api/series/${initial.id}` : "/api/series", {
      method: initial ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, competitionIds }),
    })
    const data = await response.json().catch(() => ({}))
    setSaving(false)
    if (!response.ok) {
      setError(data.error ?? "Salvestamine ebaõnnestus")
      return
    }
    if (initial) {
      onDone?.()
      router.refresh()
    } else {
      router.push(`/dashboard/series/${data.id}`)
    }
  }

  async function remove() {
    if (!initial || !confirm(`Kustuta arvestus „${initial.name}”? Osavõistlusi ja nende tulemusi see ei muuda.`)) return
    setSaving(true)
    const response = await fetch(`/api/series/${initial.id}`, { method: "DELETE" })
    if (!response.ok) {
      setSaving(false)
      setError("Kustutamine ebaõnnestus")
      return
    }
    router.push("/dashboard/series")
    router.refresh()
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="series-name" className="mb-1 block text-sm font-medium text-ink">Arvestuse nimi</label>
        <Input id="series-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="nt Jäljed metsas 2026" required maxLength={120} />
      </div>
      <fieldset aria-labelledby="series-competitions-label">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <span id="series-competitions-label" className="text-sm font-medium text-ink">Osavõistlused</span>
          <span className="text-xs text-ink-muted">Valitud {selected.length}</span>
        </div>
        <Input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Otsi võistlust" aria-label="Otsi võistlust" className="mb-2" />
        <div className="max-h-72 divide-y divide-line overflow-y-auto rounded-control border border-line">
          {visible.length === 0 ? (
            <p className="px-3 py-4 text-sm text-ink-muted">Võistlusi ei leitud.</p>
          ) : visible.map((competition) => (
            <label key={competition.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-canvas">
              <input type="checkbox" checked={selected.includes(competition.id)} onChange={() => toggle(competition.id)} className="rounded border-line" />
              <span className="min-w-0 flex-1 text-ink">{competition.name}</span>
              <span className="shrink-0 text-xs text-ink-muted">
                {competition.date ? new Date(competition.date).toLocaleDateString("et-EE") : ""}{competition.date ? " · " : ""}{competition.statusLabel}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={saving || !name.trim() || selected.length === 0}>
          {saving ? "Salvestan…" : initial ? "Salvesta muudatused" : "Loo arvestus"}
        </Button>
        {initial && onDone && <Button type="button" variant="secondary" onClick={onDone} disabled={saving}>Tühista</Button>}
        {initial && <Button type="button" variant="ghost" className="text-danger" onClick={remove} disabled={saving}>Kustuta arvestus</Button>}
      </div>
    </form>
  )
}

// Muutmise vorm avaneb arvestuse lehel nupust.
export function SeriesEditPanel({ competitions, initial }: { competitions: SeriesCompetitionOption[]; initial: { id: string; name: string; competitionIds: string[] } }) {
  const [open, setOpen] = useState(false)
  if (!open) return <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>Muuda arvestust</Button>
  return (
    <div className="w-full rounded-card border border-line bg-surface p-4 sm:p-5">
      <SeriesForm competitions={competitions} initial={initial} onDone={() => setOpen(false)} />
    </div>
  )
}
