"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Select } from "@/components/ui/input"

type CompetitionOption = {
  id: string
  name: string
}

type ElementOption = {
  id: string
  name: string
  code: string
  isCancelled: boolean
}

type FixedSource = ElementOption & {
  competitionId: string
}

export function ScoringElementCopyDialog({
  fixedSource,
  fixedTargetCompetitionId,
}: {
  fixedSource?: FixedSource
  fixedTargetCompetitionId?: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [competitions, setCompetitions] = useState<CompetitionOption[]>([])
  const [sourceCompetitionId, setSourceCompetitionId] = useState("")
  const [sourceElements, setSourceElements] = useState<ElementOption[]>([])
  const [sourceElementId, setSourceElementId] = useState("")
  const [targetCompetitionId, setTargetCompetitionId] = useState("")
  const [loadingOptions, setLoadingOptions] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const buttonLabel = fixedSource ? "Kopeeri" : "+ Kopeeri olemasolev element"

  async function openDialog() {
    setOpen(true)
    setError("")
    setLoadingOptions(true)
    const response = await fetch("/api/competitions")
    const data = await response.json().catch(() => [])
    if (!response.ok) {
      setError("Võistluste laadimine ebaõnnestus")
      setLoadingOptions(false)
      return
    }
    const options = data as CompetitionOption[]
    setCompetitions(options)
    const initialSourceCompetitionId =
      fixedSource?.competitionId ?? fixedTargetCompetitionId ?? options[0]?.id ?? ""
    setSourceCompetitionId(initialSourceCompetitionId)
    setSourceElementId(fixedSource?.id ?? "")
    setTargetCompetitionId(
      fixedTargetCompetitionId ?? fixedSource?.competitionId ?? options[0]?.id ?? ""
    )
    setLoadingOptions(false)
  }

  useEffect(() => {
    if (!open || fixedSource || !sourceCompetitionId) return
    let active = true
    setLoadingOptions(true)
    setSourceElements([])
    setSourceElementId("")
    fetch(`/api/competitions/${sourceCompetitionId}/elements`)
      .then(async (response) => {
        const data = await response.json().catch(() => [])
        if (!response.ok) throw new Error()
        if (!active) return
        setSourceElements(data)
        setSourceElementId(data[0]?.id ?? "")
      })
      .catch(() => {
        if (active) setError("Elementide laadimine ebaõnnestus")
      })
      .finally(() => {
        if (active) setLoadingOptions(false)
      })
    return () => {
      active = false
    }
  }, [fixedSource, open, sourceCompetitionId])

  async function copyElement(event: React.FormEvent) {
    event.preventDefault()
    const selectedSourceId = fixedSource?.id ?? sourceElementId
    if (!selectedSourceId || !targetCompetitionId) {
      setError("Vali lähteelement ja sihtvõistlus")
      return
    }
    setSaving(true)
    setError("")
    const response = await fetch(`/api/elements/${selectedSourceId}/copy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetCompetitionId }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      setError(data.error ?? "Elemendi kopeerimine ebaõnnestus")
      setSaving(false)
      return
    }
    router.push(
      `/dashboard/competitions/${targetCompetitionId}/elements/${data.id}`
    )
    router.refresh()
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className={
          fixedSource
            ? "text-sm px-3 py-1.5 border rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
            : "text-sm text-blue-600 hover:text-blue-700 font-medium"
        }
      >
        {buttonLabel}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="copy-element-title"
        >
          <form
            onSubmit={copyElement}
            className="w-full max-w-lg bg-white rounded-2xl shadow-xl p-6 space-y-5"
          >
            <div>
              <h2
                id="copy-element-title"
                className="text-xl font-bold text-gray-900"
              >
                Kopeeri hindamiselement
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Kopeeritakse väljad, hindamisosad, erandid ja arvutusmeetod.
                Sisestatud tulemusi ega kohtunike ligipääse ei kopeerita.
              </p>
            </div>

            {fixedSource ? (
              <div className="border rounded-lg px-3 py-2">
                <p className="text-xs text-gray-400">Lähteelement</p>
                <p className="text-sm font-medium text-gray-900 mt-1">
                  {fixedSource.code} · {fixedSource.name}
                </p>
              </div>
            ) : (
              <>
                <div>
                  <label
                    htmlFor="copy-element-source-competition"
                    className="text-sm font-medium text-gray-700 block mb-1"
                  >
                    Lähtevõistlus
                  </label>
                  <Select
                    id="copy-element-source-competition"
                    required
                    value={sourceCompetitionId}
                    onChange={(event) => {
                      setError("")
                      setSourceCompetitionId(event.target.value)
                    }}
                  >
                    {competitions.map((competition) => (
                      <option key={competition.id} value={competition.id}>
                        {competition.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label
                    htmlFor="copy-element-source"
                    className="text-sm font-medium text-gray-700 block mb-1"
                  >
                    Hindamiselement
                  </label>
                  <Select
                    id="copy-element-source"
                    required
                    value={sourceElementId}
                    onChange={(event) => setSourceElementId(event.target.value)}
                    disabled={loadingOptions || sourceElements.length === 0}
                    className="disabled:bg-gray-50"
                  >
                    {sourceElements.length === 0 && (
                      <option value="">Elemente ei ole</option>
                    )}
                    {sourceElements.map((element) => (
                      <option key={element.id} value={element.id}>
                        {element.code} · {element.name}
                        {element.isCancelled ? " (tühistatud)" : ""}
                      </option>
                    ))}
                  </Select>
                </div>
              </>
            )}

            {fixedTargetCompetitionId ? (
              <input
                type="hidden"
                value={fixedTargetCompetitionId}
                readOnly
              />
            ) : (
              <div>
                <label
                  htmlFor="copy-element-target-competition"
                  className="text-sm font-medium text-gray-700 block mb-1"
                >
                  Sihtvõistlus
                </label>
                <Select
                  id="copy-element-target-competition"
                  required
                  value={targetCompetitionId}
                  onChange={(event) => setTargetCompetitionId(event.target.value)}
                >
                  {competitions.map((competition) => (
                    <option key={competition.id} value={competition.id}>
                      {competition.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}

            <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
              Kui sihtvõistluses on sama tähis juba kasutusel, lisatakse sellele
              automaatselt järjekorranumber. Sama võistluse sees lisatakse nimele
              „koopia”.
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
                disabled={saving || loadingOptions}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Kopeerin..." : "Kopeeri element"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
