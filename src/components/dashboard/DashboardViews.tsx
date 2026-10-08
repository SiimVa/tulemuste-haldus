"use client"

import { useId, useState, type ReactNode } from "react"

type DashboardView = { id: string; label: string; count: number; content: ReactNode }

export function DashboardViews({ views, initialView }: { views: DashboardView[]; initialView: string }) {
  const id = useId()
  const [active, setActive] = useState(initialView)
  const current = views.find(view => view.id === active) ?? views[0]
  if (!current) return null

  return (
    <>
      <nav role="tablist" aria-label="Töölaua vaated" className="mb-6 grid grid-cols-2 gap-1 rounded-xl border bg-white p-1.5 sm:flex sm:flex-wrap">
        {views.map((view, index) => (
          <button key={view.id} type="button" role="tab" id={`${id}-${view.id}`} aria-selected={view.id === current.id}
            aria-label={view.label} aria-controls={`${id}-panel`} tabIndex={view.id === current.id ? 0 : -1}
            onClick={() => setActive(view.id)}
            onKeyDown={event => {
              const next = event.key === "ArrowRight" ? (index + 1) % views.length : event.key === "ArrowLeft" ? (index + views.length - 1) % views.length : event.key === "Home" ? 0 : event.key === "End" ? views.length - 1 : null
              if (next === null) return
              event.preventDefault()
              setActive(views[next].id)
              document.getElementById(`${id}-${views[next].id}`)?.focus()
            }}
            className={`flex min-w-0 items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium sm:justify-start ${view.id === current.id ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100"}`}>
            <span>{view.label}</span>
            <span className={`shrink-0 rounded-full px-1.5 text-xs ${view.id === current.id ? "bg-white/20" : "bg-gray-100 text-gray-500"}`}>{view.count}</span>
          </button>
        ))}
      </nav>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${current.id}`} tabIndex={0} className="outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-xl">
        {current.content}
      </div>
    </>
  )
}
