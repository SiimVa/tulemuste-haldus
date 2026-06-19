"use client"

import { useState, useRef } from "react"

type ImportRowResult = {
  rowNum: number
  teamCode: string
  teamName: string
  status: "ok" | "error" | "skipped"
  message?: string
  values?: Record<string, string>
  exceptionLabel?: string
}

type PreviewResult = {
  rows: ImportRowResult[]
  missingTeams: string[]
  summary: {
    total: number
    imported: number
    errors: number
    skipped: number
  }
  importErrors?: string[]
}

type Props = {
  elementId: string
  competitionId: string
  elementName: string
  onClose: () => void
}

export function ResultsImportModal({ elementId, competitionId, elementName, onClose }: Props) {
  const [step, setStep] = useState<"upload" | "preview" | "done">("upload")
  const [uploading, setUploading] = useState(false)
  const [previewData, setPreviewData] = useState<PreviewResult | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<PreviewResult | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileRef = useRef<File | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setUploading(true)
    setUploadError(null)
    const fd = new FormData()
    fd.append("file", file)
    fd.append("dryRun", "true")
    try {
      const res = await fetch(
        `/api/competitions/${competitionId}/elements/${elementId}/results/import`,
        { method: "POST", body: fd }
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Tundmatu viga" }))
        setUploadError(err.error ?? "Import ebaõnnestus")
        setUploading(false)
        return
      }
      const data: PreviewResult = await res.json()
      setPreviewData(data)
      fileRef.current = file
      setStep("preview")
    } catch {
      setUploadError("Serveri viga, proovi uuesti")
    }
    setUploading(false)
  }

  async function confirmImport() {
    if (!fileRef.current) return
    setImporting(true)
    const fd = new FormData()
    fd.append("file", fileRef.current)
    fd.append("dryRun", "false")
    try {
      const res = await fetch(
        `/api/competitions/${competitionId}/elements/${elementId}/results/import`,
        { method: "POST", body: fd }
      )
      const data: PreviewResult = await res.json()
      setImportResult(data)
      setStep("done")
    } catch {
      setImportResult(null)
    }
    setImporting(false)
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  const statusIcon = (status: ImportRowResult["status"]) => {
    if (status === "ok") return <span className="text-green-600 font-bold">✓</span>
    if (status === "error") return <span className="text-red-600 font-bold">✗</span>
    return <span className="text-gray-400">—</span>
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl my-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Tulemuste import</h2>
            <p className="text-sm text-gray-500">{elementName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl font-bold leading-none"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-5">
          {/* Step 1: Upload */}
          {step === "upload" && (
            <div className="space-y-5">
              <p className="text-sm text-gray-600">
                Laadi alla mall, täida see tulemustega ning laadi üles.
              </p>
              <a
                href={`/api/competitions/${competitionId}/elements/${elementId}/results/template`}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm border rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                ↓ Laadi mall alla
              </a>

              <div
                className="border-2 border-dashed border-gray-300 rounded-xl p-10 text-center hover:border-blue-400 transition-colors cursor-pointer"
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => inputRef.current?.click()}
              >
                {uploading ? (
                  <p className="text-gray-500 text-sm">Analüüsin faili...</p>
                ) : (
                  <>
                    <p className="text-gray-500 text-sm">Lohista fail siia või klõpsa valimiseks</p>
                    <p className="text-gray-400 text-xs mt-1">.xlsx, .xls, .csv</p>
                  </>
                )}
                <input
                  ref={inputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleInputChange}
                />
              </div>

              {uploadError && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                  {uploadError}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Preview */}
          {step === "preview" && previewData && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="flex gap-4 text-sm">
                <span className="bg-green-50 text-green-700 px-3 py-1.5 rounded-lg font-medium">
                  {previewData.summary.imported} imporditakse
                </span>
                {previewData.summary.errors > 0 && (
                  <span className="bg-red-50 text-red-700 px-3 py-1.5 rounded-lg font-medium">
                    {previewData.summary.errors} viga
                  </span>
                )}
                {previewData.summary.skipped > 0 && (
                  <span className="bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg font-medium">
                    {previewData.summary.skipped} vahele jäetud
                  </span>
                )}
              </div>

              {/* Missing teams warning */}
              {previewData.missingTeams.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
                  <strong>Failis puuduvad võistkonnad:</strong>{" "}
                  {previewData.missingTeams.join(", ")}
                </div>
              )}

              {/* Rows table */}
              <div className="max-h-72 overflow-y-auto border rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr className="text-left text-gray-500">
                      <th className="px-3 py-2 font-medium w-8">Rida</th>
                      <th className="px-3 py-2 font-medium w-6"></th>
                      <th className="px-3 py-2 font-medium">Tähis</th>
                      <th className="px-3 py-2 font-medium">Võistkond</th>
                      <th className="px-3 py-2 font-medium">Sõnum</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {previewData.rows.map((row) => (
                      <tr
                        key={row.rowNum}
                        className={
                          row.status === "error"
                            ? "bg-red-50"
                            : row.status === "skipped"
                            ? "bg-gray-50"
                            : ""
                        }
                      >
                        <td className="px-3 py-1.5 text-gray-400">{row.rowNum}</td>
                        <td className="px-3 py-1.5">{statusIcon(row.status)}</td>
                        <td className="px-3 py-1.5 font-mono text-gray-700">{row.teamCode}</td>
                        <td className="px-3 py-1.5 text-gray-700">{row.teamName}</td>
                        <td className="px-3 py-1.5 text-gray-500">
                          {row.exceptionLabel ? (
                            <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded text-xs">
                              {row.exceptionLabel}
                            </span>
                          ) : row.message ? (
                            row.message
                          ) : row.values ? (
                            <span className="text-gray-400">
                              {Object.entries(row.values)
                                .filter(([, v]) => v !== "")
                                .map(([k, v]) => `${k}: ${v}`)
                                .join(", ")}
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {previewData.summary.imported === 0 && (
                <p className="text-sm text-amber-600">
                  Imporditavaid tulemusi ei leitud. Kontrolli, et fail sisaldaks õiget andmevormingut.
                </p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={confirmImport}
                  disabled={importing || previewData.summary.imported === 0}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {importing ? "Importin..." : `Kinnita import (${previewData.summary.imported} tulemust)`}
                </button>
                <button
                  onClick={() => {
                    setStep("upload")
                    setPreviewData(null)
                    fileRef.current = null
                    if (inputRef.current) inputRef.current.value = ""
                  }}
                  disabled={importing}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Tühista
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Done */}
          {step === "done" && importResult && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">✓</span>
                <div>
                  <p className="font-semibold text-gray-900">
                    {importResult.summary.imported} tulemust imporditud
                  </p>
                  {importResult.summary.errors > 0 && (
                    <p className="text-sm text-red-600">
                      {importResult.summary.errors} kirjel esines viga
                    </p>
                  )}
                </div>
              </div>

              {importResult.importErrors && importResult.importErrors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                  <strong>Vead:</strong>
                  <ul className="mt-1 space-y-0.5">
                    {importResult.importErrors.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}

              {importResult.rows.filter((r) => r.status === "error").length > 0 && (
                <div className="max-h-48 overflow-y-auto border rounded-lg">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr className="text-left text-gray-500">
                        <th className="px-3 py-2 font-medium">Tähis</th>
                        <th className="px-3 py-2 font-medium">Võistkond</th>
                        <th className="px-3 py-2 font-medium">Viga</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {importResult.rows
                        .filter((r) => r.status === "error")
                        .map((row) => (
                          <tr key={row.rowNum} className="bg-red-50">
                            <td className="px-3 py-1.5 font-mono text-gray-700">{row.teamCode}</td>
                            <td className="px-3 py-1.5 text-gray-700">{row.teamName}</td>
                            <td className="px-3 py-1.5 text-red-600">{row.message}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}

              <button
                onClick={onClose}
                className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
              >
                Sulge
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
