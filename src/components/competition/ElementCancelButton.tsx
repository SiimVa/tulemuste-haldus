"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export function ElementCancelButton({
  elementId,
  isCancelled,
  competitionId,
}: {
  elementId: string
  isCancelled: boolean
  competitionId: string
}) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function toggle() {
    const msg = isCancelled
      ? "Taasta element (tühista annuleerimine)?"
      : "Annulee see element? Kõik võistkonnad saavad 0 punkti."
    if (!confirm(msg)) return
    setLoading(true)
    await fetch(`/api/elements/${elementId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isCancelled: !isCancelled }),
    })
    // Auto-arvuta skoorid uuesti et pingerida uueneks kohe
    await fetch(`/api/competitions/${competitionId}/recalculate`, { method: "POST" })
    setLoading(false)
    router.refresh()
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`text-sm px-3 py-1.5 border rounded-lg transition-colors disabled:opacity-50 ${
        isCancelled
          ? "bg-red-100 border-red-300 text-red-700 hover:bg-red-200"
          : "border-gray-300 text-gray-600 hover:bg-red-50 hover:text-red-600"
      }`}
    >
      {loading ? "..." : isCancelled ? "Taasta element" : "Annulee KP"}
    </button>
  )
}
