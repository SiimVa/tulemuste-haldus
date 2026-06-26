"use client"

import { useEffect, useState } from "react"

type Team = { id: string; code: string; name: string }

// Lubab pealtvaatajal valida "oma" võistkonna ja tõsta selle read esile (kõigil vaadetel).
// Valik salvestub localStorage'i, nii et püsib ka lehe värskendamisel.
export function LeaderboardHighlighter({ competitionId, teams }: { competitionId: string; teams: Team[] }) {
  const storageKey = `lb-myteam-${competitionId}`
  const [selected, setSelected] = useState<string>("")

  function apply(teamId: string) {
    const rows = document.querySelectorAll<HTMLElement>("[data-lb-team]")
    rows.forEach((el) => {
      if (teamId && el.dataset.lbTeam === teamId) {
        el.style.outline = "2px solid #2563eb"
        el.style.outlineOffset = "-2px"
        el.style.borderRadius = el.tagName === "TR" ? "" : "0.75rem"
      } else {
        el.style.outline = ""
        el.style.outlineOffset = ""
      }
    })
  }

  useEffect(() => {
    const saved = localStorage.getItem(storageKey) ?? ""
    setSelected(saved)
    apply(saved)
    // Rakenda uuesti pärast pehmet värskendust (router.refresh re-renderdab read)
    let t: ReturnType<typeof setTimeout> | null = null
    const observer = new MutationObserver(() => {
      if (t) clearTimeout(t)
      t = setTimeout(() => apply(localStorage.getItem(storageKey) ?? ""), 100)
    })
    observer.observe(document.body, { childList: true, subtree: true })
    return () => { observer.disconnect(); if (t) clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function onChange(value: string) {
    setSelected(value)
    if (value) localStorage.setItem(storageKey, value)
    else localStorage.removeItem(storageKey)
    apply(value)
  }

  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-gray-500 shrink-0">Minu võistkond:</label>
      <select
        value={selected}
        onChange={(e) => onChange(e.target.value)}
        className="px-2 py-1 border rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-45"
      >
        <option value="">— vali —</option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>[{t.code}] {t.name}</option>
        ))}
      </select>
    </div>
  )
}
