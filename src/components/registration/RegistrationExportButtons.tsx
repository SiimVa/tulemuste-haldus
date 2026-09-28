"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import type { FormPhase } from "@/lib/registrationForm"
import type { ReportFilters } from "@/lib/registrationReport"

export function RegistrationExportButtons({ competitionId, phase, columns, filters = {}, disabled = false }: {
  competitionId: string; phase: FormPhase; columns?: string[]; filters?: ReportFilters; disabled?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  async function download(format: "csv" | "xlsx") {
    setBusy(true)
    setError("")
    try {
      const query = new URLSearchParams({ phase, format })
      columns?.forEach(column => query.append("column", column))
      if (filters.status) query.set("status", filters.status)
      if (filters.className !== undefined) query.set("class", filters.className)
      if (filters.search) query.set("search", filters.search)
      const response = await fetch(`/api/competitions/${competitionId}/registrations/export?${query}`, { cache: "no-store" })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error ?? "Eksport ebaõnnestus")
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      const filename = response.headers.get("Content-Disposition")?.split("filename*=UTF-8''")[1]
      anchor.download = filename ? decodeURIComponent(filename) : `${phase.toLowerCase()}.${format}`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) {
      setError(error instanceof Error ? error.message : "Eksport ebaõnnestus")
    } finally { setBusy(false) }
  }
  return <div>
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="secondary" size="sm" disabled={disabled || busy || columns?.length === 0} onClick={() => download("xlsx")}>{busy ? "Ekspordin…" : "Ekspordi Excel"}</Button>
      <Button type="button" variant="secondary" size="sm" disabled={disabled || busy || columns?.length === 0} onClick={() => download("csv")}>Ekspordi CSV</Button>
    </div>
    {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
  </div>
}
