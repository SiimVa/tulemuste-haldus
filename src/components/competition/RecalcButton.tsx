"use client"

import { useState } from "react"

export function RecalcButton({ competitionId }: { competitionId: string }) {
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleClick() {
    setLoading(true)
    setDone(false)
    try {
      await fetch(`/api/competitions/${competitionId}/recalculate`, { method: "POST" })
      setDone(true)
      window.location.reload()
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="text-sm px-3 py-1.5 border rounded-lg text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
    >
      {loading ? "Arvutan…" : done ? "Valmis!" : "Arvuta skoorid uuesti"}
    </button>
  )
}
