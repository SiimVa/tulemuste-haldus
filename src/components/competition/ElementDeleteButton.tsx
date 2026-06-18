"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export function ElementDeleteButton({
  elementId,
  elementName,
  competitionId,
}: {
  elementId: string
  elementName: string
  competitionId: string
}) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleDelete() {
    if (!confirm(`Kustuta element "${elementName}"?\n\nKõik sisestatud tulemused kustutatakse. Seda ei saa tagasi võtta.`)) return
    setLoading(true)
    const res = await fetch(`/api/elements/${elementId}`, { method: "DELETE" })
    if (res.ok) {
      router.push(`/dashboard/competitions/${competitionId}`)
    } else {
      alert("Kustutamine ebaõnnestus")
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className="text-sm px-3 py-1.5 border border-red-200 rounded-lg text-red-500 hover:bg-red-50 hover:text-red-700 transition-colors disabled:opacity-50"
    >
      {loading ? "Kustutan..." : "Kustuta element"}
    </button>
  )
}
