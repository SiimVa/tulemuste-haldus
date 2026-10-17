"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import type { AnalysisAccessMode } from "@/lib/analysisAccess"
import { Input } from "@/components/ui/input"

// linkLabel ja managersText erinevad üleriikliku arvestuse puhul.
const modes = (linkLabel: string, managersText: string): { value: AnalysisAccessMode; label: string; desc: string }[] => [
  {
    value: "PUBLIC",
    label: "Avalik",
    desc: `Link „${linkLabel}" on pingereas nähtav ja igaüks pääseb analüüsi vaatesse.`,
  },
  {
    value: "LINK_ONLY",
    label: "Ainult lingiga",
    desc: "Link on pingereast peidetud. Analüüsi avab ainult eraldi jagatav aadress.",
  },
  {
    value: "PRIVATE",
    label: "Suletud",
    desc: `Analüüsi avalik vaade on välja lülitatud. ${managersText}`,
  },
]

export function AnalysisAccessSettings({
  competitionId,
  initialMode,
  initialHasLink,
  accessUrl = `/api/competitions/${competitionId}/analysis-access`,
  rotateUrl = `/api/competitions/${competitionId}/analysis-link/rotate`,
  linkPath = "/analysis/",
  title = "VK analüüsi ligipääs",
  linkLabel = "VK analüüs →",
  managersText = "Korraldajad näevad andmeid töölaual edasi.",
  resource = "analysis",
}: {
  competitionId: string
  initialMode: AnalysisAccessMode
  initialHasLink: boolean
  // Üleriiklik arvestus kasutab sama vormi oma aadressidega.
  accessUrl?: string
  rotateUrl?: string
  linkPath?: string
  title?: string
  linkLabel?: string
  managersText?: string
  resource?: "analysis" | "leaderboard"
}) {
  const modeKey = resource === "analysis" ? "analysisAccessMode" : "leaderboardAccessMode"
  const tokenKey = resource === "analysis" ? "analysisLinkToken" : "leaderboardLinkToken"
  const hasLinkKey = resource === "analysis" ? "hasAnalysisLink" : "hasLeaderboardLink"
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

  const link = linkToken ? `${origin}${linkPath}${linkToken}` : ""

  async function save() {
    setSaving(true)
    setSaved(false)
    setError("")
    const res = await fetch(accessUrl, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [modeKey]: mode }),
    })
    setSaving(false)
    if (!res.ok) {
      setError("Salvestamine ebaõnnestus.")
      return
    }
    const data = await res.json()
    if (data[tokenKey]) setLinkToken(data[tokenKey])
    setHasLink(Boolean(data[hasLinkKey]))
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2000)
    router.refresh()
  }

  async function rotate() {
    setRotating(true)
    setError("")
    const res = await fetch(rotateUrl, { method: "POST" })
    setRotating(false)
    if (!res.ok) {
      setError("Uue lingi loomine ebaõnnestus.")
      return
    }
    const data = await res.json()
    setLinkToken(data[tokenKey])
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
    <section aria-label={title} className="bg-white border rounded-xl p-5 space-y-4">
      <div>
        <h2 className="font-semibold text-gray-900">{title}</h2>
        <p className="text-xs text-gray-500 mt-1">
          {resource === "analysis" ? "Vali, kas analüüs on avalik, eraldi lingiga jagatav või suletud." : "Määrab pingerea, ülevaate ja ekraanirežiimi ligipääsu. Analüüsi nähtavust saad valida eraldi."}
        </p>
      </div>

      <div className="space-y-2">
        {modes(linkLabel, managersText).map((option) => (
          <label
            key={option.value}
            className={`flex gap-3 p-3 border rounded-lg cursor-pointer ${
              mode === option.value ? "border-blue-500 bg-blue-50" : "hover:bg-gray-50"
            }`}
          >
            <input
              type="radio"
              name={modeKey}
              value={option.value}
              checked={mode === option.value}
              onChange={() => setMode(option.value)}
              className="mt-1"
            />
            <span>
              <span className="block text-sm font-medium text-gray-900">
                {option.label}
              </span>
              <span className="block text-xs text-gray-500">{resource === "analysis" ? option.desc : option.value === "PUBLIC" ? "Pingerida ja ülevaade avanevad avalikult arvestuse aadressilt." : option.value === "LINK_ONLY" ? "Pingerida ja ülevaade avanevad ainult eraldi jagatava lingiga." : "Avalik pingerida ja ülevaade on suletud. Administraator näeb neid töölaual edasi."}</span>
            </span>
          </label>
        ))}
      </div>

      {mode === "LINK_ONLY" && (
        <div className="rounded-lg border bg-gray-50 p-4 space-y-3">
          {linkToken && origin ? (
            <>
              <label className="block text-xs text-gray-600">
                {resource === "analysis" ? "Analüüsilink" : "Pingerealink"}
                <Input
                  aria-label={resource === "analysis" ? "Analüüsilink" : "Pingerealink"}
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
    </section>
  )
}
