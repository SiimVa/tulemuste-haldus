"use client"

import { useRouter } from "next/navigation"
import { Select } from "@/components/ui/input"

// Analüüsi võistkonna valik; valik on aadressis (?team=), et vaadet saaks jagada.
export function SeriesTeamPicker({ teams, selected, basePath }: { teams: { id: string; label: string }[]; selected: string | null; basePath: string }) {
  const router = useRouter()
  return (
    <label className="block max-w-xl text-sm">
      <span className="mb-1 block font-medium text-ink">Võistkond</span>
      <Select value={selected ?? ""} onChange={(event) => router.push(event.target.value ? `${basePath}?team=${encodeURIComponent(event.target.value)}` : basePath)}>
        <option value="">— vali võistkond —</option>
        {teams.map((team) => <option key={team.id} value={team.id}>{team.label}</option>)}
      </Select>
    </label>
  )
}
