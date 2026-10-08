"use client"

import Link from "next/link"
import { useState } from "react"
import { TeamResultActions } from "@/components/representative/TeamResultActions"
import { participantStatus, type ParticipantItem, type ParticipantPhase } from "@/lib/participantWorkflow"

const phases: { phase: ParticipantPhase; title: string; label: string; description: string; id: string }[] = [
  { phase: "REGISTRATION", title: "Minu registreerimised", label: "Registreerimised", description: "Registreeritud ja kinnitatud võistkonnad püsivad siin kuni mandaadietapini.", id: "registrations-title" },
  { phase: "MANDATE", title: "Mandaadid", label: "Mandaadid", description: "Täienda koosseisu ja esita mandaat. Kinnitatud mandaat jääb siia võistluse alguseni.", id: "mandates-title" },
  { phase: "ACTIVE", title: "Käimasolevad võistlused", label: "Käimasolevad", description: "Ava oma võistkonna tulemused või jaga tulemuste linki.", id: "active-teams-title" },
]
const tones = {
  neutral: "bg-gray-100 text-gray-700",
  blue: "bg-blue-50 text-blue-700",
  amber: "bg-amber-50 text-amber-800",
  green: "bg-green-50 text-green-800",
  red: "bg-red-50 text-red-700",
}

export function ParticipantTeams({ items }: { items: ParticipantItem[] }) {
  const [phase, setPhase] = useState<ParticipantPhase | "ALL">("ALL")
  const [query, setQuery] = useState("")
  const [attentionOnly, setAttentionOnly] = useState(false)
  const attentionCount = items.filter(item => item.requiresAction).length
  const filtered = items.filter(item => {
    if (phase !== "ALL" && item.phase !== phase) return false
    if (attentionOnly && !item.requiresAction) return false
    return [item.teamName, item.competitionName, item.className, participantStatus(item.phase, item.status).label].join(" ").toLocaleLowerCase("et").includes(query.trim().toLocaleLowerCase("et"))
  })

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-xl font-bold text-gray-900">Minu võistkonnad</h2>
        <p className="mt-1 text-sm text-gray-500">Registreerimine → mandaat → võistlus. Võistkonna olek ja järgmine samm on alati siin nähtavad.</p>
      </div>
      <div className="mb-5 space-y-3 rounded-xl border bg-white p-3 sm:p-4">
        <div className="flex flex-wrap gap-2" aria-label="Võistkonna etapp">
          {[{ value: "ALL", label: "Kõik", count: items.length }, ...phases.map(entry => ({ value: entry.phase, label: entry.label, count: items.filter(item => item.phase === entry.phase).length }))].map(filter => (
            <button key={filter.value} type="button" aria-pressed={phase === filter.value} onClick={() => setPhase(filter.value as typeof phase)}
              className={`rounded-lg px-3 py-2 text-sm ${phase === filter.value ? "bg-blue-50 font-medium text-blue-700 ring-1 ring-blue-200" : "text-gray-600 hover:bg-gray-50"}`}>
              {filter.label} <span className="ml-1 text-xs opacity-70">{filter.count}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input type="search" aria-label="Otsi minu võistkondi" placeholder="Otsi võistkonda või võistlust" value={query} onChange={event => setQuery(event.target.value)} className="w-full min-w-0 rounded-lg border px-3 py-2 text-sm sm:flex-1" />
          {attentionCount > 0 && <button type="button" aria-pressed={attentionOnly} onClick={() => setAttentionOnly(!attentionOnly)} className={`shrink-0 rounded-lg px-3 py-2 text-sm ${attentionOnly ? "bg-amber-100 font-medium text-amber-900" : "bg-amber-50 text-amber-800 hover:bg-amber-100"}`}>Vajab minu tegevust ({attentionCount})</button>}
        </div>
      </div>
      {filtered.length === 0 && <div className="rounded-xl border bg-white px-5 py-10 text-center text-sm text-gray-500">
        {items.length === 0 ? <><p className="font-medium text-gray-900">Sul pole veel registreeritud võistkondi.</p><p className="mt-2">Vali „Leia võistlus”, et registreerida oma esimene võistkond.</p></> : <><p>Sellele valikule vastavaid võistkondi pole.</p><button type="button" onClick={() => { setPhase("ALL"); setQuery(""); setAttentionOnly(false) }} className="mt-2 font-medium text-blue-600 hover:underline">Tühjenda filtrid</button></>}
      </div>}
      <div className="space-y-7">
        {phases.map(entry => {
          const teams = filtered.filter(item => item.phase === entry.phase)
          if (!teams.length) return null
          return (
            <section key={entry.phase} aria-labelledby={entry.id}>
              <div className="mb-3">
                <h3 id={entry.id} className="font-semibold text-gray-900">{entry.title} <span aria-hidden="true" className="ml-1 text-sm font-normal text-gray-400">{teams.length}</span></h3>
                <p className="mt-1 text-sm text-gray-500">{entry.description}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {teams.map(item => {
                  const status = participantStatus(item.phase, item.status)
                  const content = <>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="text-xs font-medium text-blue-600">{item.competitionName}</p>
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${tones[status.tone]}`}>{status.label}</span>
                    </div>
                    <h4 className="mt-3 break-words font-semibold text-gray-900">{item.teamName}</h4>
                    <p className="mt-1 text-xs text-gray-500">{[item.className && `Klass: ${item.className}`, item.date && new Date(item.date).toLocaleDateString("et-EE", { timeZone: "Europe/Tallinn" })].filter(Boolean).join(" · ")}</p>
                    <p className="mt-3 text-sm text-gray-600">{item.description}</p>
                    {item.waitlistPosition && <p className="mt-2 text-xs font-medium text-amber-800">Ootenimekirja koht: {item.waitlistPosition}</p>}
                    {item.note && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{item.note}</p>}
                    {item.action && <p className="mt-4 text-sm font-medium text-blue-600">{item.action} →</p>}
                  </>
                  const cardClass = `block h-full rounded-xl border bg-white p-4 sm:p-5 ${item.requiresAction ? "border-amber-200" : "border-gray-200"}`
                  if (item.phase === "ACTIVE" && item.teamId) return <article key={item.id} className={cardClass}>{content}<TeamResultActions teamId={item.teamId} initialToken={item.resultsToken} /></article>
                  if (item.href) return <Link key={item.id} href={item.href} className={`${cardClass} transition-shadow hover:shadow-md`}>{content}</Link>
                  return <article key={item.id} className={cardClass}>{content}</article>
                })}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
