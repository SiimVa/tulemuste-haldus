"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

// Avaldamine: avalikud vaated avanevad ainult avaldatud arvestusel. Avalike
// võistluste nimekirja arvestust ei lisata, seega jaga linki ise.
export function SeriesPublishSettings({ seriesId, initialPublished, analysisPublic }: { seriesId: string; initialPublished: boolean; analysisPublic: boolean }) {
  const router = useRouter()
  const [published, setPublished] = useState(initialPublished)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const base = `/public/series/${seriesId}`
  const links = [
    { href: base, label: "Pingerida" },
    { href: `${base}/overview`, label: "Ülevaade" },
    { href: `${base}/screen`, label: "Ekraanirežiim" },
    ...(analysisPublic ? [{ href: `${base}/analysis`, label: "Analüüs" }] : []),
  ]

  async function toggle() {
    if (published && !window.confirm("Peida üleriiklik arvestus avalikust vaatest? Jagatud lingid lakkavad töötamast.")) return
    setBusy(true)
    setError("")
    const response = await fetch(`/api/series/${seriesId}/publish`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPublished: !published }),
    })
    setBusy(false)
    if (!response.ok) {
      setError("Salvestamine ebaõnnestus.")
      return
    }
    setPublished(!published)
    router.refresh()
  }

  return (
    <Card className="space-y-4 p-5">
      <div>
        <h2 className="font-semibold text-ink">Avaldamine</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Avaldatud arvestuse pingerida, ülevaade ja ekraanirežiim on avatud kõigile, kellel on link. Arvestust ei lisata avalike võistluste nimekirja.
          Osavõistluste külmutatud pingeread jäävad avalikus vaates külmutatuks.
        </p>
      </div>
      <p role="status" className={`rounded-lg px-3 py-2 text-sm ${published ? "bg-green-50 text-green-800" : "bg-canvas text-ink-soft"}`}>
        {published ? "Arvestus on avaldatud." : "Arvestus ei ole avaldatud. Avalikke vaateid näeb ainult administraator eelvaatena."}
      </p>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {links.map((link) => <li key={link.href}><Link href={link.href} className="text-primary hover:underline">{link.label} →</Link></li>)}
      </ul>
      <Button type="button" variant={published ? "secondary" : "primary"} onClick={toggle} disabled={busy}>
        {published ? "Peida avalikust vaatest" : "Avalda"}
      </Button>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </Card>
  )
}
