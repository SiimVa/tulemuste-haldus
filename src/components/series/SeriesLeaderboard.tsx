import { GapCells, GapHeadings, GapSummary, RankBadge } from "@/components/leaderboard/LeaderboardDetails"
import { Card } from "@/components/ui/card"
import type { LeaderboardGap } from "@/lib/leaderboard"
import type { SeriesRow } from "@/lib/seriesRanking"
import { isAutomaticRegistrationCode } from "@/lib/teamDisplay"

const points = (value: number) => value.toFixed(1)

function kpCell(row: SeriesRow, code: string) {
  return row.kpScores.find((score) => score.code === code)
}

// Üleriikliku arvestuse pingerida: arvutis tabel KP-de veergudega, telefonis
// kaardid. Arvesse minevad KP-d on tumedad, arvestamata KP-d hallid.
export function SeriesLeaderboard({ rows, gaps, kpCodes, showClasses, unit }: {
  rows: SeriesRow[]
  gaps: Record<string, LeaderboardGap>
  kpCodes: string[]
  showClasses: boolean
  unit: string
}) {
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-ink-muted">Tulemusi pole veel.</p>
  return (
    <>
      <div className="space-y-2 md:hidden">
        <p className="px-1 text-xs text-gray-400">Vajuta võistkonnale, et näha arvestatud KP-sid</p>
        {rows.map((row) => {
          const counted = row.kpScores.filter((score) => score.counted)
          const skipped = row.kpScores.filter((score) => !score.counted)
          return (
            <details key={row.team.id} data-lb-team={row.team.id} data-team={row.team.name} className="group rounded-xl border bg-white shadow-sm">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2.5">
                <span className="w-7 shrink-0 text-center text-lg font-bold text-gray-900"><RankBadge rank={row.rank} /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {!isAutomaticRegistrationCode(row.team.code) && <span className="font-mono text-xs text-gray-400">{row.team.code}</span>}
                    <span className="truncate font-medium text-gray-900">{row.team.name}</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2">
                    {row.team.class && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{row.team.class} · <RankBadge rank={row.classRank} /></span>}
                    <span className="truncate text-xs text-gray-500">{row.competitionName}</span>
                  </div>
                </div>
                <span className="shrink-0 font-mono text-base font-bold text-gray-900">{row.total.toFixed(2)}</span>
                <span className="shrink-0 text-xs text-gray-300 transition-transform group-open:rotate-180">▾</span>
              </summary>
              <div className="space-y-2 border-t px-3 pb-3 pt-2 text-xs">
                <p className="text-gray-600">Läbitud KP-sid: {row.passedCount} · KP {unit}: <span className="font-mono">{points(row.kpTotal)}</span>{row.penaltyTotal !== 0 && <> · Karistused: <span className="font-mono text-orange-600">{points(row.penaltyTotal)}</span></>}</p>
                <GapSummary gap={gaps[row.team.id]} showClasses={showClasses} />
                <p className="text-gray-700">Arvestatud: {counted.map((score) => `${score.code} ${points(score.points)}`).join(" · ") || "–"}</p>
                {skipped.length > 0 && <p className="text-gray-400">Arvestamata: {skipped.map((score) => `${score.code} ${points(score.points)}`).join(" · ")}</p>}
              </div>
            </details>
          )
        })}
      </div>

      <Card className="hidden overflow-hidden shadow-sm md:block">
        <div className="max-h-[75vh] overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left">
                <th className="sticky left-0 top-0 z-30 w-12 bg-gray-50 px-2 py-3 text-center text-xs font-medium text-gray-500">Üld</th>
                <th className="sticky left-12 top-0 z-30 w-12 bg-gray-50 px-2 py-3 text-center text-xs font-medium text-gray-500">Klass</th>
                <th className="sticky left-24 top-0 z-30 min-w-48 border-r bg-gray-50 px-4 py-3 text-xs font-medium text-gray-500">Võistkond</th>
                <th className="sticky top-0 z-20 bg-gray-50 px-4 py-3 text-xs font-medium text-gray-500">Klass</th>
                <th className="sticky top-0 z-20 bg-gray-50 px-3 py-3 text-right text-xs font-medium text-gray-500" title="Läbitud KP-de arv">Läbitud</th>
                {kpCodes.map((code) => <th key={code} className="sticky top-0 z-20 bg-gray-50 px-3 py-3 text-right text-xs font-medium text-gray-400">{code}</th>)}
                <th className="sticky top-0 z-20 bg-gray-50 px-4 py-3 text-right text-xs font-medium text-gray-500">Karistused</th>
                <th className="sticky right-0 top-0 z-30 border-l bg-gray-50 px-4 py-3 text-right text-xs font-semibold text-gray-700">KOKKU</th>
                <GapHeadings showClasses={showClasses} />
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr key={row.team.id} data-lb-team={row.team.id} data-team={row.team.name} className="hover:bg-gray-50">
                  <td className="sticky left-0 z-10 w-12 bg-white px-2 py-3 text-center font-bold text-gray-900"><RankBadge rank={row.rank} /></td>
                  <td className="sticky left-12 z-10 w-12 bg-white px-2 py-3 text-center text-xs text-gray-400"><RankBadge rank={row.team.class ? row.classRank : null} /></td>
                  <td className="sticky left-24 z-10 min-w-48 border-r bg-white px-4 py-3">
                    {!isAutomaticRegistrationCode(row.team.code) && <span className="mr-1.5 font-mono text-xs text-gray-400">{row.team.code}</span>}
                    <span className="font-medium text-gray-900">{row.team.name}</span>
                    <span className="block text-xs text-gray-500">{row.competitionName}</span>
                  </td>
                  <td className="px-4 py-3">{row.team.class && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{row.team.class}</span>}</td>
                  <td className="px-3 py-3 text-right font-mono text-xs text-gray-600">{row.passedCount}</td>
                  {kpCodes.map((code) => {
                    const score = kpCell(row, code)
                    return (
                      <td key={code} className={`px-3 py-3 text-right font-mono text-xs ${score?.counted ? "font-semibold text-gray-900" : "text-gray-300"}`}
                        title={score && !score.counted ? "Ei lähe arvesse" : undefined}>
                        {score ? points(score.points) : "–"}
                      </td>
                    )
                  })}
                  <td className={`px-4 py-3 text-right font-mono text-xs ${row.penaltyTotal === 0 ? "text-gray-300" : "text-orange-600"}`}>{row.penaltyTotal === 0 ? "–" : points(row.penaltyTotal)}</td>
                  <td className="sticky right-0 z-10 border-l bg-white px-4 py-3 text-right font-mono font-bold text-gray-900">{row.total.toFixed(2)}</td>
                  <GapCells gap={gaps[row.team.id]} showClasses={showClasses} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}
