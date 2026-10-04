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
  // Valitud lähteelemendid; kopeeritakse lähtevõistluse järjekorras.
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [targetCompetitionId, setTargetCompetitionId] = useState("")
  const [loadingOptions, setLoadingOptions] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [copiedMessage, setCopiedMessage] = useState("")

  const buttonLabel = fixedSource ? "Kopeeri" : "+ Kopeeri elemente"
  const selectedElements = sourceElements.filter((element) => selectedIds.includes(element.id))
  const allSelected = sourceElements.length > 0 && selectedElements.length === sourceElements.length
  const submitLabel = fixedSource || selectedElements.length <= 1
    ? "Kopeeri element"
    : `Kopeeri ${selectedElements.length} elementi`

  async function openDialog() {
    setOpen(true)
    setError("")
    setCopiedMessage("")
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
    setSelectedIds([])
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
    setSelectedIds([])
    fetch(`/api/competitions/${sourceCompetitionId}/elements`)
      .then(async (response) => {
        const data = await response.json().catch(() => [])
        if (!response.ok) throw new Error()
        if (!active) return
        setSourceElements(data)
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

  function toggleElement(elementId: string) {
    setError("")
    setSelectedIds((current) =>
      current.includes(elementId)
        ? current.filter((id) => id !== elementId)
        : [...current, elementId]
    )
  }

  async function copyElement(event: React.FormEvent) {
    event.preventDefault()
    const sourceIds = fixedSource ? [fixedSource.id] : selectedElements.map(({ id }) => id)
    if (sourceIds.length === 0 || !targetCompetitionId) {
      setError("Vali lähteelement ja sihtvõistlus")
      return
    }
    setSaving(true)
    setError("")
    // Üks element: olemasolev otspunkt. Mitu: ühe tehinguna, kõik või mitte ükski.
    const response = fixedSource
      ? await fetch(`/api/elements/${fixedSource.id}/copy`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetCompetitionId }),
        })
      : await fetch(`/api/competitions/${targetCompetitionId}/elements/copy`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceElementIds: sourceIds }),
        })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      setError(data.error ?? (sourceIds.length > 1 ? "Elementide kopeerimine ebaõnnestus" : "Elemendi kopeerimine ebaõnnestus"))
      setSaving(false)
      return
    }
    const copied: { id: string }[] = fixedSource ? [data] : data.elements ?? []
    if (copied.length === 1) {
      router.push(
        `/dashboard/competitions/${targetCompetitionId}/elements/${copied[0].id}`
      )
      router.refresh()
      return
    }
    // Mitu koopiat: jää elementide nimekirja juurde, koopiad on selle lõpus.
    setSaving(false)
    setOpen(false)
    setCopiedMessage(`Kopeeriti ${copied.length} elementi.`)
    router.push(`/dashboard/competitions/${targetCompetitionId}`)
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
      {copiedMessage && (
        <span role="status" className="text-sm text-green-700">
          {copiedMessage}
        </span>
      )}

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
                {fixedSource ? "Kopeeri hindamiselement" : "Kopeeri hindamiselemendid"}
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
                <fieldset aria-labelledby="copy-element-sources-label">
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <span id="copy-element-sources-label" className="text-sm font-medium text-gray-700">
                      Hindamiselemendid
                    </span>
                    {sourceElements.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          setError("")
                          setSelectedIds(allSelected ? [] : sourceElements.map(({ id }) => id))
                        }}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        {allSelected ? "Tühista kõik" : "Vali kõik"}
                      </button>
                    )}
                  </div>
                  <div className="border rounded-lg max-h-64 overflow-y-auto divide-y">
                    {loadingOptions ? (
                      <p role="status" className="text-sm text-gray-400 px-3 py-4">
                        Laadin elemente…
                      </p>
                    ) : sourceElements.length === 0 ? (
                      <p className="text-sm text-gray-400 px-3 py-4">
                        Selles võistluses pole elemente.
                      </p>
                    ) : (
                      sourceElements.map((element) => (
                        <label
                          key={element.id}
                          className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50"
                        >
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(element.id)}
                            onChange={() => toggleElement(element.id)}
                            className="rounded border-gray-300"
                          />
                          <span className="text-gray-700">
                            <span className="font-medium">{element.code}</span> · {element.name}
                            {element.isCancelled && <span className="text-gray-400"> (tühistatud)</span>}
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                  {sourceElements.length > 0 && (
                    <p className="text-xs text-gray-500 mt-1">
                      Valitud {selectedElements.length}/{sourceElements.length}. Koopiad lisatakse elementide nimekirja lõppu samas järjekorras.
                    </p>
                  )}
                </fieldset>
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
                disabled={saving || loadingOptions || (!fixedSource && selectedElements.length === 0)}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Kopeerin..." : submitLabel}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
