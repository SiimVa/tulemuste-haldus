"use client"

import { useState } from "react"

export function RecalculateButton({ competitionId }: { competitionId: string }) {
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState("")

  async function handleClick() {
    setLoading(true)
    setMsg("")
    const res = await fetch(`/api/competitions/${competitionId}/recalculate`, { method: "POST" })
    if (res.ok) {
      const data = await res.json()
      setMsg(`✓ ${data.recalculated} skoori uuendatud`)
    } else {
      setMsg("Viga arvutamisel")
    }
    setLoading(false)
    setTimeout(() => setMsg(""), 4000)
  }

  return (
    <div className="flex items-center gap-3">
      <button onClick={handleClick} disabled={loading}
        className="text-sm text-gray-500 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors">
        {loading ? "Arvutan..." : "↻ Arvuta skoorid uuesti"}
      </button>
      {msg && <span className="text-xs text-green-600">{msg}</span>}
    </div>
  )
}
