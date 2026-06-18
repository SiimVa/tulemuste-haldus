"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

type Element = {
  id: string
  name: string
  code: string
  type: string
  order: number
  isCancelled: boolean
  _count: { results: number }
}

const TYPE_LABEL: Record<string, string> = {
  CHECKPOINT: "KP",
  PENALTY_BOX: "Postkast",
  MANUAL: "Käsitsi",
  OTHER: "Muu",
  COUNTER_ACTION: "VT",
  EQUIPMENT_CHECK: "VA",
  LATENESS: "HL",
}

export function ElementList({
  competitionId,
  initialElements,
  teamCount,
}: {
  competitionId: string
  initialElements: Element[]
  teamCount: number
}) {
  // Normalise: sort by order, then assign clean 0,1,2,... indices
  const normalize = (els: Element[]) =>
    [...els]
      .sort((a, b) => a.order - b.order)
      .map((el, i) => ({ ...el, order: i }))

  const [elements, setElements] = useState(() => normalize(initialElements))
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingOrder, setEditingOrder] = useState<Record<string, string>>({})
  const router = useRouter()

  async function move(idx: number, dir: -1 | 1) {
    const swapIdx = idx + dir
    if (swapIdx < 0 || swapIdx >= elements.length || saving) return

    const updated = [...elements]
    const tmp = updated[idx]
    updated[idx] = { ...updated[swapIdx], order: idx }
    updated[swapIdx] = { ...tmp, order: swapIdx }

    setElements(updated)
    setSaving(true)

    await Promise.all([
      fetch(`/api/elements/${updated[idx].id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: idx }),
      }),
      fetch(`/api/elements/${updated[swapIdx].id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: swapIdx }),
      }),
    ])

    setSaving(false)
    router.refresh()
  }

  async function moveToPosition(fromIdx: number, toIdx: number) {
    const clamped = Math.max(0, Math.min(elements.length - 1, toIdx))
    if (fromIdx === clamped || saving) return

    const updated = [...elements]
    const [moved] = updated.splice(fromIdx, 1)
    updated.splice(clamped, 0, moved)
    const renumbered = updated.map((el, i) => ({ ...el, order: i }))

    setElements(renumbered)
    setSaving(true)

    const prev = elements
    await Promise.all(
      renumbered
        .filter((el, i) => prev.find(e => e.id === el.id)?.order !== i)
        .map(el =>
          fetch(`/api/elements/${el.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ order: el.order }),
          })
        )
    )

    setSaving(false)
    router.refresh()
  }

  async function deleteElement(el: Element) {
    if (!confirm(`Kustuta element "${el.name}"?\n\nKõik sisestatud tulemused kustutatakse.`)) return
    setDeletingId(el.id)
    const res = await fetch(`/api/elements/${el.id}`, { method: "DELETE" })
    if (res.ok) {
      const remaining = elements.filter(e => e.id !== el.id)
      setElements(normalize(remaining))
      router.refresh()
    }
    setDeletingId(null)
  }

  if (elements.length === 0) {
    return (
      <div className="text-center py-10 text-gray-400">
        <p>Ühtegi elementi pole lisatud</p>
        <Link href={`/dashboard/competitions/${competitionId}/elements/new`}
          className="text-blue-600 text-sm mt-2 inline-block hover:underline">
          Lisa esimene KP
        </Link>
      </div>
    )
  }

  return (
    <div className="divide-y">
      {elements.map((el, idx) => (
        <div key={el.id} className={`flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 transition-colors ${el.isCancelled ? "opacity-60" : ""}`}>
          {/* Järjekorra nupud */}
          <div className="flex flex-col gap-0.5 shrink-0">
            <button
              onClick={() => move(idx, -1)}
              disabled={idx === 0 || saving}
              className="text-gray-300 hover:text-gray-600 disabled:opacity-20 leading-none text-xs px-1"
              title="Üles"
            >▲</button>
            <button
              onClick={() => move(idx, 1)}
              disabled={idx === elements.length - 1 || saving}
              className="text-gray-300 hover:text-gray-600 disabled:opacity-20 leading-none text-xs px-1"
              title="Alla"
            >▼</button>
          </div>

          {/* Järjekorranumber (klikitav input) */}
          <input
            type="number"
            min={1}
            max={elements.length}
            value={editingOrder[el.id] ?? (idx + 1)}
            onChange={e => setEditingOrder(prev => ({ ...prev, [el.id]: e.target.value }))}
            onFocus={e => { e.target.select(); setEditingOrder(prev => ({ ...prev, [el.id]: String(idx + 1) })) }}
            onBlur={e => {
              const newPos = parseInt(e.target.value) - 1
              setEditingOrder(prev => { const n = { ...prev }; delete n[el.id]; return n })
              if (!isNaN(newPos)) moveToPosition(idx, newPos)
            }}
            onKeyDown={e => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur()
              if (e.key === "Escape") setEditingOrder(prev => { const n = { ...prev }; delete n[el.id]; return n })
            }}
            className="w-8 text-xs text-gray-400 text-right bg-transparent border-none outline-none focus:bg-white focus:border focus:border-blue-300 focus:rounded focus:px-1 focus:text-gray-700 shrink-0"
          />

          {/* Element link */}
          <Link href={`/dashboard/competitions/${competitionId}/elements/${el.id}`}
            className="flex items-center gap-3 flex-1 min-w-0">
            <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded shrink-0">
              {el.code}
            </span>
            <span className={`font-medium truncate ${el.isCancelled ? "line-through text-gray-400" : "text-gray-900"}`}>
              {el.name}
            </span>
            <span className="text-xs text-gray-400 shrink-0">{TYPE_LABEL[el.type] ?? el.type}</span>
            {el.isCancelled && (
              <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-medium shrink-0">tühistatud</span>
            )}
          </Link>

          {/* Tulemuste arv */}
          {(() => {
            const entered = el._count.results
            const done = entered >= teamCount
            const none = entered === 0
            return (
              <span className={`text-sm font-medium shrink-0 ${done ? "text-green-600" : none ? "text-gray-300" : "text-amber-500"}`}>
                {entered}/{teamCount}
              </span>
            )
          })()}

          {/* Kustuta */}
          <button
            onClick={() => deleteElement(el)}
            disabled={deletingId === el.id || saving}
            className="text-xs text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded disabled:opacity-50 shrink-0"
            title="Kustuta element"
          >
            {deletingId === el.id ? "..." : "Kustuta"}
          </button>
        </div>
      ))}
    </div>
  )
}
