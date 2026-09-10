"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import type { AnalysisAccessMode } from "@/lib/analysisAccess"
import { Input } from "@/components/ui/input"

const MODES: { value: AnalysisAccessMode; label: string; desc: string }[] = [
  {
    value: "PUBLIC",
    label: "Avalik",
    desc: "Link „VK analüüs →\" on pingereas nähtav ja igaüks pääseb analüüsi vaatesse.",
  },
  {
    value: "LINK_ONLY",
    label: "Ainult lingiga",
    desc: "Link on pingereast peidetud. Analüüsi avab ainult eraldi jagatav aadress.",
  },
  {
    value: "PRIVATE",
    label: "Suletud",
    desc: "Analüüsi avalik vaade on välja lülitatud. Korraldajad näevad andmeid töölaual edasi.",
  },
]

export function AnalysisAccessSettings({
  competitionId,
  initialMode,
  initialHasLink,
}: {
  competitionId: string
  initialMode: AnalysisAccessMode
  initialHasLink: boolean
}) {
  const router = useRouter()
  const [mode, setMode] = useState<AnalysisAccessMode>(initialMode)
  const [hasLink, setHasLink] = useState(initialHasLink)
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const [origin, setOrigin] = useState("")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [rotating, setRotating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  const link = linkToken ? `${origin}/analysis/${linkToken}` : ""

  async function save() {
    setSaving(true)
    setSaved(false)
    setError("")
    const res = await fetch(`/api/competitions/${competitionId}/analysis-access`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ analysisAccessMode: mode }),
    })
    setSaving(false)
    if (!res.ok) {
      setError("Salvestamine ebaõnnestus.")
      return
    }
    const data = await res.json()
    if (data.analysisLinkToken) setLinkToken(data.analysisLinkToken)
    setHasLink(Boolean(data.hasAnalysisLink))
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2000)
    router.refresh()
  }

  async function rotate() {
    setRotating(true)
    setError("")
    const res = await fetch(
      `/api/competitions/${competitionId}/analysis-link/rotate`,
      { method: "POST" }
    )
    setRotating(false)
    if (!res.ok) {
      setError("Uue lingi loomine ebaõnnestus.")
      return
    }
    const data = await res.json()
    setLinkToken(data.analysisLinkToken)
    setHasLink(true)
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      setError("Lingi kopeerimine ebaõnnestus. Kopeeri link tekstiväljalt.")
    }
  }

  return (
    <div className="bg-white border rounded-xl p-5 space-y-4">
      <div>
        <h2 className="font-semibold text-gray-900">VK analüüsi ligipääs</h2>
        <p className="text-xs text-gray-500 mt-1">
          Määrab, kas pingerea jagamisel saab sealt otse analüüsi vaatesse
          liikuda. Analüüsist pingereasse tagasi saab alati.
        </p>
      </div>

      <div className="space-y-2">
        {MODES.map((option) => (
          <label
            key={option.value}
            className={`flex gap-3 p-3 border rounded-lg cursor-pointer ${
              mode === option.value ? "border-blue-500 bg-blue-50" : "hover:bg-gray-50"
            }`}
          >
            <input
              type="radio"
              name="analysisAccessMode"
              value={option.value}
              checked={mode === option.value}
              onChange={() => setMode(option.value)}
              className="mt-1"
            />
            <span>
              <span className="block text-sm font-medium text-gray-900">
                {option.label}
              </span>
              <span className="block text-xs text-gray-500">{option.desc}</span>
            </span>
          </label>
        ))}
      </div>

      {mode === "LINK_ONLY" && (
        <div className="rounded-lg border bg-gray-50 p-4 space-y-3">
          {linkToken && origin ? (
            <>
              <label className="block text-xs text-gray-600">
                Analüüsilink
                <Input
                  aria-label="Analüüsilink"
                  readOnly
                  value={link}
                  onFocus={(event) => event.currentTarget.select()}
                  className="mt-1 bg-white"
                />
              </label>
              <p className="text-xs text-gray-500">
                Kopeeri link kohe — seda ei kuvata hiljem uuesti.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={copyLink}
                  className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                >
                  {copied ? "Kopeeritud" : "Kopeeri link"}
                </button>
                <button
                  type="button"
                  onClick={rotate}
                  disabled={rotating}
                  className="px-3 py-2 border rounded-lg text-sm hover:bg-white disabled:opacity-50"
                >
                  {rotating ? "Loon..." : "Loo uus link"}
                </button>
              </div>
            </>
          ) : hasLink ? (
            <>
              <p className="text-xs text-gray-600">
                Link on olemas, aga seda ei säilitata loetaval kujul. Kui vana
                aadress on kaduma läinud, loo uus — vana lakkab siis kehtimast.
              </p>
              <button
                type="button"
                onClick={rotate}
                disabled={rotating}
                className="px-3 py-2 border rounded-lg text-sm hover:bg-white disabled:opacity-50"
              >
                {rotating ? "Loon..." : "Loo uus link"}
              </button>
            </>
          ) : (
            <p className="text-xs text-gray-600">
              Salvesta, et luua analüüsilink.
            </p>
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Salvestan..." : "Salvesta"}
        </button>
        {saved && <span className="text-xs text-green-600">Salvestatud</span>}
      </div>
    </div>
  )
}
