"use client"

import Link from "next/link"
import { useState } from "react"

export function TeamResultActions({
  teamId,
  initialToken,
}: {
  teamId: string
  initialToken: string | null
}) {
  const [token, setToken] = useState(initialToken)
  const [copying, setCopying] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState("")

  async function copyShareLink() {
    setCopying(true)
    setError("")
    try {
      let shareToken = token
      if (!shareToken) {
        const response = await fetch(
          `/api/representative/teams/${teamId}/results-link`,
          { method: "POST" }
        )
        const data = await response.json().catch(() => ({}))
        if (!response.ok || typeof data.token !== "string") {
          throw new Error(data.error ?? "Lingi loomine ebaõnnestus")
        }
        shareToken = data.token
        setToken(shareToken)
      }

      await navigator.clipboard.writeText(
        `${window.location.origin}/athlete/${shareToken}`
      )
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch (copyError) {
      setError(
        copyError instanceof Error
          ? copyError.message
          : "Lingi kopeerimine ebaõnnestus"
      )
    } finally {
      setCopying(false)
    }
  }

  return (
    <div className="mt-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Link
          href={`/dashboard/teams/${teamId}/results`}
          className="rounded-lg bg-blue-600 px-3 py-2 text-center text-sm font-medium text-white hover:bg-blue-700"
        >
          Vaata tulemusi
        </Link>
        <button
          type="button"
          onClick={copyShareLink}
          disabled={copying}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {copying
            ? "Loon linki..."
            : copied
              ? "Link kopeeritud!"
              : "Kopeeri tulemuste link"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  )
}
