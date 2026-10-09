"use client"

import { memo, useMemo, useState, useSyncExternalStore } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { TieBreakReason } from "@/components/leaderboard/TieBreakReason"
import { leaderboardClassFilter } from "@/lib/leaderboard"
import { GapCells, GapHeadings, GapSummary, RankBadge } from "@/components/leaderboard/LeaderboardDetails"
import { LeaderboardClassFilter } from "@/components/leaderboard/LeaderboardClassFilter"
import { MiscScoreCell } from "@/components/competition/MiscScoreCell"
import { LeaderboardHighlighter } from "@/components/public/LeaderboardHighlighter"
import { PublicSnapshotRefreshStatus, usePublicSnapshot } from "@/components/public/PublicSnapshotRefresh"
import { isAutomaticRegistrationCode } from "@/lib/teamDisplay"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatFreezeTime } from "@/lib/leaderboardFreeze"
import type { PublicLeaderboardSnapshot, PublicLeaderboardRow, PublicLeaderboardElement } from "@/lib/publicLeaderboard"

const desktopMedia = "(min-width: 768px)"
const subscribeDesktop = (listener: () => void) => {
  const media = window.matchMedia(desktopMedia)
  media.addEventListener("change", listener)
  return () => media.removeEventListener("change", listener)
}
const isDesktop = () => window.matchMedia(desktopMedia).matches
const serverIsDesktop = () => false
const PublicLeaderboardHighlighter = memo(LeaderboardHighlighter)

function StatusBadges({ row }: { row: PublicLeaderboardRow }) {
  return <>
    {row.team.dqFromElementOrder !== null && <span className="ml-1.5 text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium">DQ</span>}
    {row.team.dnsFlag && <span className="ml-1.5 text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded font-medium">DNS</span>}
    {row.memberAbandoned && <span className="ml-1.5 text-xs bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded font-medium" title="Üks või mitu liiget katkestas">👤 katk.</span>}
  </>
}

function MobileTeam({ row, elements, isPlusMode, showClasses, status }: {
  row: PublicLeaderboardRow; elements: PublicLeaderboardElement[]; isPlusMode: boolean; showClasses: boolean;
  status: "ranked" | "horsCompetition" | "abandoned"
}) {
  const [open, setOpen] = useState(false)
  const color = status === "horsCompetition" ? "text-amber-700" : status === "abandoned" ? "text-gray-500" : "text-gray-900"
  return <details data-lb-team={row.team.id} onToggle={event => setOpen(event.currentTarget.open)} className={`group border rounded-xl shadow-sm ${status === "horsCompetition" ? "bg-amber-50/60" : status === "abandoned" ? "bg-gray-50" : "bg-white"}`}>
    <summary className="px-3 py-2.5 flex items-center gap-3 cursor-pointer list-none">
      <span className={`text-lg font-bold w-7 text-center shrink-0 ${color}`}>{status === "ranked" ? <RankBadge rank={row.rank} /> : status === "horsCompetition" ? <span className="text-xs">AV</span> : <span className="text-xs">KAT</span>}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {!isAutomaticRegistrationCode(row.team.code) && <span className="font-mono text-xs text-gray-400">{row.team.code}</span>}
          <span className={`font-medium truncate ${color}`}>{row.team.name}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-0.5">
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{row.team.class ?? "–"}{status === "ranked" && <> · <RankBadge rank={row.team.class ? row.classRank : null} /></>}</span>
          {status === "ranked" && row.manualTotal > 0 && <span className="text-xs font-mono text-orange-600">Lisaär. {isPlusMode ? "-" : "+"}{row.manualTotal.toFixed(1)}</span>}
          <StatusBadges row={row} />
        </div>
      </div>
      <span className={`font-bold font-mono text-base shrink-0 ${color}`}>{status === "abandoned" ? "KAT" : row.total.toFixed(2)}</span>
      <span className="text-gray-300 text-xs shrink-0 transition-transform group-open:rotate-180">▾</span>
    </summary>
    {open && <div className="px-3 pb-3 pt-2 border-t space-y-1">
      <TieBreakReason overall={row.tieBreakReason} withinClass={row.classTieBreakReason} />
      <GapSummary gap={row.gap ?? undefined} showClasses={showClasses} />
      {status === "abandoned" && row.team.dnfReason && <p className="text-xs text-gray-500">{row.team.dnfReason}</p>}
      {elements.map((element, index) => <div key={element.id} className="text-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="text-gray-500 truncate"><span className="font-mono text-gray-400 mr-1">{element.code}</span><span className={element.isCancelled ? "line-through text-gray-300" : ""}>{element.name}</span></span>
          <span className="font-mono text-gray-700 shrink-0">{row.points[index] === null ? "–" : row.points[index].toFixed(1)}</span>
        </div>
        {row.misc[element.id]?.map((entry, i) => <p key={i} className="text-gray-500 break-words">{entry.description} ({entry.points}p)</p>)}
      </div>)}
      {row.manualTotal > 0 && <div className="flex items-center justify-between text-xs"><span className="text-gray-500">Lisaär.</span><span className="font-mono text-orange-600">{isPlusMode ? "-" : "+"}{row.manualTotal.toFixed(1)}</span></div>}
    </div>}
  </details>
}

const PublicLeaderboardBody = memo(function PublicLeaderboardBody({ snapshot, desktop, classFilters }: {
  snapshot: PublicLeaderboardSnapshot; desktop: boolean; classFilters: string
}) {
  const { competition, elements, classes } = snapshot
  const showClasses = classes.some(Boolean)
  const matchesClass = leaderboardClassFilter(JSON.parse(classFilters) as string[], classes)
  // Existing table components use keyed cells; the wire format stores each score once in a compact array.
  const tableRows = (rows: PublicLeaderboardRow[]) => rows.map(row => ({ ...row, class: row.team.class ?? "–", byElement: Object.fromEntries(elements.flatMap((element, i) => row.points[i] === null ? [] : [[element.id, row.points[i]]])) }))
  const visibleInCompRows = tableRows(snapshot.ranked.filter(row => matchesClass(row.team)))
  const visibleHorsCompRows = tableRows(snapshot.horsCompetition.filter(row => matchesClass(row.team)))
  const visibleDnfRows = tableRows(snapshot.abandoned.filter(row => matchesClass(row.team)))
  const allRows = [...snapshot.ranked, ...snapshot.horsCompetition, ...snapshot.abandoned]
  const gaps = new Map(allRows.flatMap(row => row.gap ? [[row.team.id, row.gap] as const] : []))
  const miscMap = new Map(allRows.flatMap(row => Object.entries(row.misc).map(([elementId, entries]) => [`${elementId}:${row.team.id}`, entries] as const)))
  const memberAbandonTeamIds = new Set(allRows.filter(row => row.memberAbandoned).map(row => row.team.id))
  const isPlusMode = competition.scoringMode === "PLUS"
  return <>
        <LeaderboardClassFilter classes={classes} />

        {!desktop && (
          <div className="space-y-2">
            <p className="text-xs text-gray-400 px-1">Vajuta võistkonnale, et näha elementide punkte</p>
            {visibleInCompRows.map(row => <MobileTeam key={row.team.id} row={row} elements={elements} isPlusMode={isPlusMode} showClasses={showClasses} status="ranked" />)}
            {visibleHorsCompRows.length > 0 && <p className="px-1 pt-2 text-xs font-semibold text-amber-700 tracking-wide uppercase">Arvestusvälised</p>}
            {visibleHorsCompRows.map(row => <MobileTeam key={row.team.id} row={row} elements={elements} isPlusMode={isPlusMode} showClasses={showClasses} status="horsCompetition" />)}
            {visibleDnfRows.length > 0 && <p className="px-1 pt-2 text-xs font-semibold text-gray-500 tracking-wide uppercase">Katkestanud</p>}
            {visibleDnfRows.map(row => <MobileTeam key={row.team.id} row={row} elements={elements} isPlusMode={isPlusMode} showClasses={showClasses} status="abandoned" />)}
          </div>
        )}

        {/* Arvutivaade: täielik tabel kõigi elemendi-veergudega */}
        {desktop && <Card className="overflow-hidden shadow-sm">
          <div className="overflow-auto max-h-[75vh]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left border-b">
                  <th className="sticky left-0 top-0 z-30 bg-gray-50 w-12 px-2 py-3 text-xs font-medium text-gray-500 text-center">Üld</th>
                  <th className="sticky left-12 top-0 z-30 bg-gray-50 w-12 px-2 py-3 text-xs font-medium text-gray-500 text-center">Klass</th>
                  <th className="sticky left-24 top-0 z-30 bg-gray-50 border-r px-4 py-3 text-xs font-medium text-gray-500 min-w-40">Võistkond</th>
                  <th className="sticky top-0 z-20 bg-gray-50 px-4 py-3 text-xs font-medium text-gray-500">Klass</th>
                  {elements.map((el) => (
                    <th key={el.id} className="sticky top-0 z-20 bg-gray-50 px-3 py-3 text-xs font-medium text-right">
                      {el.isCancelled ? (
                        <span className="line-through text-gray-300" title="Tühistatud">{el.code}</span>
                      ) : (
                        <span className="text-gray-400">{el.code}</span>
                      )}
                    </th>
                  ))}
                  <th className="sticky top-0 z-20 bg-gray-50 px-4 py-3 text-xs font-medium text-gray-500 text-right">Lisaär.</th>
                  <th className="sticky right-0 top-0 z-30 bg-gray-50 border-l px-4 py-3 text-xs font-semibold text-gray-700 text-right">KOKKU</th>
                  <GapHeadings showClasses={showClasses} />
                </tr>
              </thead>
              <tbody className="divide-y">
                {visibleInCompRows.map((row) => (
                  <tr key={row.team.id} data-lb-team={row.team.id} className="hover:bg-gray-50">
                    <td className="sticky left-0 z-10 bg-white w-12 px-2 py-3 font-bold text-gray-900 text-center"><RankBadge rank={row.rank} /></td>
                    <td className="sticky left-12 z-10 bg-white w-12 px-2 py-3 text-gray-400 text-xs text-center"><RankBadge rank={row.team.class ? row.classRank : null} /></td>
                    <td className="sticky left-24 z-10 bg-white border-r px-4 py-3 min-w-40">
                      {!isAutomaticRegistrationCode(row.team.code) && (
                        <span className="font-mono text-xs text-gray-400 mr-1">{row.team.code}</span>
                      )}
                      <span className="font-medium text-gray-900">{row.team.name}</span>
                      <TieBreakReason overall={row.tieBreakReason} withinClass={row.classTieBreakReason} />
                      {row.team.dqFromElementOrder != null && (
                        <span className="ml-1.5 text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium">DQ</span>
                      )}
                      {row.team.dnsFlag && (
                        <span className="ml-1.5 text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded font-medium">DNS</span>
                      )}
                      {memberAbandonTeamIds.has(row.team.id) && (
                        <span className="ml-1.5 text-xs bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded font-medium" title="Üks või mitu liiget katkestas">👤 katk.</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{row.class}</span>
                    </td>
                    {elements.map((el) => {
                      const cellValue = row.byElement[el.id] !== undefined ? row.byElement[el.id].toFixed(1) : "–"
                      const entries = (el.type === "OTHER" || el.type === "ABANDONMENT") ? (miscMap.get(`${el.id}:${row.team.id}`) ?? []) : []
                      if (entries.length > 0) {
                        return <MiscScoreCell key={el.id} value={cellValue} entries={entries}
                          className="px-3 py-3 text-right font-mono text-xs text-gray-600" />
                      }
                      return (
                        <td key={el.id} className="px-3 py-3 text-right font-mono text-xs text-gray-600">
                          {cellValue}
                        </td>
                      )
                    })}
                    <td className="px-4 py-3 text-right font-mono text-xs text-orange-600">
                      {row.manualTotal > 0 ? (isPlusMode ? `-${row.manualTotal.toFixed(1)}` : `+${row.manualTotal.toFixed(1)}`) : "–"}
                    </td>
                    <td className="sticky right-0 z-10 bg-white border-l px-4 py-3 text-right">
                      <span className="font-bold text-gray-900 font-mono">{row.total.toFixed(2)}</span>
                    </td>
                    <GapCells gap={gaps.get(row.team.id)} showClasses={showClasses} />
                  </tr>
                ))}
                {visibleHorsCompRows.length > 0 && (
                  <>
                    <tr>
                      <td colSpan={6 + elements.length + (showClasses ? 4 : 2)} className="px-4 py-2 bg-amber-50 text-xs font-semibold text-amber-700 tracking-wide uppercase">
                        Arvestusvälised
                      </td>
                    </tr>
                    {visibleHorsCompRows.map((row) => (
                      <tr key={row.team.id} data-lb-team={row.team.id} className="hover:bg-gray-50 bg-amber-50/40">
                        <td className="sticky left-0 z-10 bg-amber-50 w-12 px-2 py-3 text-xs text-amber-600 font-medium text-center">AV</td>
                        <td className="sticky left-12 z-10 bg-amber-50 w-12 px-2 py-3 text-gray-400 text-xs text-center">–</td>
                        <td className="sticky left-24 z-10 bg-amber-50 border-r px-4 py-3 min-w-40">
                          {!isAutomaticRegistrationCode(row.team.code) && (
                            <span className="font-mono text-xs text-gray-400 mr-1">{row.team.code}</span>
                          )}
                          <span className="font-medium text-amber-700">{row.team.name}</span>
                          {row.team.dqFromElementOrder != null && (
                            <span className="ml-1.5 text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium">DQ</span>
                          )}
                          {row.team.dnsFlag && (
                            <span className="ml-1.5 text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded font-medium">DNS</span>
                          )}
                          {memberAbandonTeamIds.has(row.team.id) && (
                            <span className="ml-1.5 text-xs bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded font-medium" title="Üks või mitu liiget katkestas">👤 katk.</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{row.class}</span>
                        </td>
                        {elements.map((el) => {
                          const cellValue = row.byElement[el.id] !== undefined ? row.byElement[el.id].toFixed(1) : "–"
                          const entries = (el.type === "OTHER" || el.type === "ABANDONMENT") ? (miscMap.get(`${el.id}:${row.team.id}`) ?? []) : []
                          if (entries.length > 0) {
                            return <MiscScoreCell key={el.id} value={cellValue} entries={entries}
                              className="px-3 py-3 text-right font-mono text-xs text-gray-600" />
                          }
                          return (
                            <td key={el.id} className="px-3 py-3 text-right font-mono text-xs text-gray-600">
                              {cellValue}
                            </td>
                          )
                        })}
                        <td className="px-4 py-3 text-right font-mono text-xs text-orange-600">
                          {row.manualTotal > 0 ? (isPlusMode ? `-${row.manualTotal.toFixed(1)}` : `+${row.manualTotal.toFixed(1)}`) : "–"}
                        </td>
                        <td className="sticky right-0 z-10 bg-amber-50 border-l px-4 py-3 text-right">
                          <span className="font-bold text-amber-700 font-mono">{row.total.toFixed(2)}</span>
                        </td>
                    <GapCells gap={gaps.get(row.team.id)} showClasses={showClasses} />
                      </tr>
                    ))}
                  </>
                )}
                {visibleDnfRows.length > 0 && (
                  <>
                    <tr>
                      <td colSpan={6 + elements.length + (showClasses ? 4 : 2)} className="px-4 py-2 bg-gray-100 text-xs font-semibold text-gray-500 tracking-wide uppercase">
                        Katkestanud
                      </td>
                    </tr>
                    {visibleDnfRows.map((row) => (
                      <tr key={row.team.id} data-lb-team={row.team.id} className="hover:bg-gray-50 bg-gray-50/60">
                        <td className="sticky left-0 z-10 bg-gray-100 w-12 px-2 py-3 text-xs text-gray-400 font-medium text-center">KAT</td>
                        <td className="sticky left-12 z-10 bg-gray-100 w-12 px-2 py-3 text-gray-400 text-xs text-center">–</td>
                        <td className="sticky left-24 z-10 bg-gray-100 border-r px-4 py-3 min-w-40">
                          {!isAutomaticRegistrationCode(row.team.code) && (
                            <span className="font-mono text-xs text-gray-400 mr-1">{row.team.code}</span>
                          )}
                          <span className="font-medium text-gray-500">{row.team.name}</span>
                          {row.team.dnfReason && (
                            <span className="ml-1.5 text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded font-medium">{row.team.dnfReason}</span>
                          )}
                          {memberAbandonTeamIds.has(row.team.id) && (
                            <span className="ml-1.5 text-xs bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded font-medium" title="Üks või mitu liiget katkestas">👤 katk.</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{row.class}</span>
                        </td>
                        {elements.map((el) => {
                          const cellValue = row.byElement[el.id] !== undefined ? row.byElement[el.id].toFixed(1) : "–"
                          const entries = (el.type === "OTHER" || el.type === "ABANDONMENT") ? (miscMap.get(`${el.id}:${row.team.id}`) ?? []) : []
                          if (entries.length > 0) {
                            return <MiscScoreCell key={el.id} value={cellValue} entries={entries}
                              className="px-3 py-3 text-right font-mono text-xs text-gray-500" />
                          }
                          return (
                            <td key={el.id} className="px-3 py-3 text-right font-mono text-xs text-gray-500">
                              {cellValue}
                            </td>
                          )
                        })}
                        <td className="px-4 py-3 text-right font-mono text-xs text-gray-400">–</td>
                        <td className="sticky right-0 z-10 bg-gray-100 border-l px-4 py-3 text-right">
                          <span className="font-bold text-gray-400 font-mono">KAT</span>
                        </td>
                    <GapCells gap={gaps.get(row.team.id)} showClasses={showClasses} />
                      </tr>
                    ))}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </Card>}
  </>
})

export function PublicLeaderboard({ initial }: { initial: PublicLeaderboardSnapshot }) {
  const refreshState = usePublicSnapshot(`/api/public/competitions/${initial.competition.id}/leaderboard`, initial, 30)
  const { snapshot } = refreshState
  const desktop = useSyncExternalStore(subscribeDesktop, isDesktop, serverIsDesktop)
  const params = useSearchParams()
  const { competition } = snapshot
  const id = competition.id
  const freeze = snapshot.freezeAt ? { freezeAt: new Date(snapshot.freezeAt) } : null
  const classFilters = JSON.stringify(params.getAll("class"))
  const visibility = useMemo(() => {
    const matches = leaderboardClassFilter(JSON.parse(classFilters) as string[], snapshot.classes)
    return {
      inCompetition: snapshot.ranked.filter(row => matches(row.team)).length,
      horsCompetition: snapshot.horsCompetition.filter(row => matches(row.team)).length,
    }
  }, [snapshot, classFilters])
  const teams = useMemo(() => [...snapshot.ranked, ...snapshot.horsCompetition, ...snapshot.abandoned]
    .map(row => row.team).sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: "base" }))
    .map(team => ({ id: team.id, code: team.code, name: team.name })), [snapshot])
  const isPlusMode = competition.scoringMode === "PLUS"
  const updatedAt = new Date(snapshot.generatedAt).toLocaleString("et-EE", { timeZone: "Europe/Tallinn", dateStyle: "medium", timeStyle: "short" })

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{competition.name}</h1>
              <p className="text-gray-500 text-sm mt-1">
                Pingerida · {visibility.inCompetition} võistkonda
                {visibility.horsCompetition > 0 && ` + ${visibility.horsCompetition} arvestusvälised`}
              </p>
            </div>
            <div className="flex flex-row sm:flex-col items-start sm:items-end gap-2 sm:gap-1">
              <Badge tone={isPlusMode ? "info" : "warning"}>
                {isPlusMode ? "Plusspunktid" : "Karistuspunktid"}
              </Badge>
              {competition.analysisAvailable && (
                <Link href={`/public/${id}/analysis`} className="text-xs text-blue-600 hover:underline">
                  VK analüüs →
                </Link>
              )}
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-gray-400 flex items-center gap-2">
              <span>{freeze ? `Seis: ${formatFreezeTime(freeze.freezeAt)}` : `Uuendatud: ${updatedAt}`}</span>
              <span>·</span>
              <PublicSnapshotRefreshStatus state={refreshState} />
            </p>
            <PublicLeaderboardHighlighter competitionId={id} teams={teams} />
          </div>
        </div>

        {freeze && (
          <p role="status" className="mb-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            Pingerida on külmutatud seisuga {formatFreezeTime(freeze.freezeAt)}. Lõplik pingerida avalikustatakse autasustamisel.
          </p>
        )}

        <PublicLeaderboardBody snapshot={snapshot} desktop={desktop} classFilters={classFilters} />
        <p className="text-center text-xs text-gray-400 mt-6">Tulemuste haldus · Andmed uuenevad automaatselt</p>
      </div>
    </div>
  )
}
