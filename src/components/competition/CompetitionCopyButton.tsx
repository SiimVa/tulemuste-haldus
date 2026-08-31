"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { copiedCompetitionName } from "@/lib/competitionCopy"

export function CompetitionCopyButton({
  competitionId,
  competitionName,
  elementCount,
}: {
  competitionId: string
  competitionName: string
  elementCount: number
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(copiedCompetitionName(competitionName))
  const [includeElements, setIncludeElements] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  function openDialog() {
    setName(copiedCompetitionName(competitionName))
    setIncludeElements(true)
    setError("")
    setOpen(true)
  }

  async function copyCompetition(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError("")
    const response = await fetch(`/api/competitions/${competitionId}/copy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, includeElements }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      setError(data.error ?? "Võistluse kopeerimine ebaõnnestus")
      setSaving(false)
      return
    }
    router.push(`/dashboard/competitions/${data.id}`)
    router.refresh()
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="text-xs text-blue-600 hover:text-blue-700 font-medium"
      >
        Kopeeri võistlus
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="copy-competition-title"
        >
          <form
            onSubmit={copyCompetition}
            className="w-full max-w-lg bg-white rounded-2xl shadow-xl p-6 space-y-5"
          >
            <div>
              <h2
                id="copy-competition-title"
                className="text-xl font-bold text-gray-900"
              >
                Kopeeri võistlus
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Luuakse uus privaatne ettevalmistuses võistlus. Kuupäevi,
                osalejaid, tulemusi ja ligipääse ei kopeerita.
              </p>
            </div>

            <div>
              <label
                htmlFor="copy-competition-name"
                className="text-sm font-medium text-gray-700 block mb-1"
              >
                Uue võistluse nimi
              </label>
              <input
                id="copy-competition-name"
                type="text"
                required
                maxLength={200}
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <label className="flex items-start gap-3 border rounded-lg p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={includeElements}
                onChange={(event) => setIncludeElements(event.target.checked)}
                className="mt-0.5 rounded border-gray-300"
              />
              <span>
                <span className="block text-sm font-medium text-gray-900">
                  Kopeeri hindamiselemendid
                </span>
                <span className="block text-xs text-gray-500 mt-0.5">
                  {elementCount} aktiivse elemendi väljad, erandid ja
                  arvutusmeetodid.
                </span>
              </span>
            </label>

            <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
              Registreerimisvorm, klassid, kohtade jaotusreeglid, koosseisunõuded
              ja hindamise vaikeväärtused kopeeritakse alati. Registreerimine ja
              mandaat jäävad suletuks, kuni määrad uued ajad või avad need käsitsi.
            </p>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={saving}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg disabled:opacity-50"
              >
                Tühista
              </button>
              <button
                type="submit"
                disabled={saving}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Kopeerin..." : "Loo koopia"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
