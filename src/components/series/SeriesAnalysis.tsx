import Link from "next/link"
import { GapSummary, RankBadge } from "@/components/leaderboard/LeaderboardDetails"
import { Card } from "@/components/ui/card"
import { TableScroll, td, tdNum, th } from "@/components/dashboard/WidgetCard"
import { formatNumber } from "@/lib/dashboard/format"
import { teamAnalysis } from "@/lib/seriesInsights"
import type { SeriesView } from "@/lib/seriesRanking.server"
import { KpComparisonWidget } from "@/components/series/SeriesWidgets"
import { SeriesTeamPicker } from "@/components/series/SeriesTeamPicker"

const number = (value: number | null | undefined, digits = 2) => formatNumber(value, digits)

// Üleriikliku arvestuse analüüs: võistkonna vaade ja KP-de võrdlus
// osavõistluste vahel. Sama vaade on avalik, lingiga ja administraatorile.
export function SeriesAnalysis({ view, basePath, mode, teamId }: { view: SeriesView; basePath: string; mode: "team" | "kp"; teamId: string | null }) {
  const tab = (active: boolean) => `rounded-full px-3 py-1 text-sm ${active ? "bg-primary text-primary-foreground" : "bg-canvas text-ink hover:bg-line"}`
  const analysis = mode === "team" && teamId ? teamAnalysis(view.data, view.ranking, teamId) : null
  const teams = view.ranking.rows.map((row) => ({
    id: row.team.id,
    label: `${row.rank}. ${row.team.name}${row.team.class ? ` · ${row.team.class}` : ""} · ${row.competitionName}`,
  }))
  const showClasses = view.ranking.classes.length > 0
  return (
    <div className="space-y-5">
      <nav aria-label="Analüüsi vaade" className="flex flex-wrap gap-2">
        <Link href={basePath} aria-current={mode === "team" ? "page" : undefined} className={tab(mode === "team")}>Võistkond</Link>
        <Link href={`${basePath}?vaade=kp`} aria-current={mode === "kp" ? "page" : undefined} className={tab(mode === "kp")}>KP-d osavõistlustes</Link>
      </nav>

      {mode === "kp" ? <KpComparisonWidget view={view} /> : (
        <>
          <SeriesTeamPicker teams={teams} selected={analysis ? analysis.row.team.id : null} basePath={basePath} />
          {teamId && !analysis && <p role="alert" className="text-sm text-danger">Võistkonda ei ole pingereas.</p>}
          {analysis && (
            <div className="space-y-4" data-team-analysis={analysis.row.team.name}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Card className="p-3">
                  <p className="text-xs text-ink-muted">Üldkoht</p>
                  <p className="mt-1 text-2xl font-bold text-ink"><RankBadge rank={analysis.row.rank} /><span className="text-sm font-normal text-ink-muted"> / {analysis.teamCount}</span></p>
                </Card>
                <Card className="p-3">
                  <p className="text-xs text-ink-muted">Klassikoht{analysis.row.team.class ? ` (${analysis.row.team.class})` : ""}</p>
                  <p className="mt-1 text-2xl font-bold text-ink">{analysis.row.classRank ?? "–"}{analysis.row.classRank && <span className="text-sm font-normal text-ink-muted"> / {analysis.classTeamCount}</span>}</p>
                </Card>
                <Card className="p-3">
                  <p className="text-xs text-ink-muted">Kokku</p>
                  <p className="mt-1 font-mono text-2xl font-bold text-ink">{number(analysis.row.total)}</p>
                  <p className="text-xs text-ink-muted">KP {number(analysis.row.kpTotal)} · karistused {number(analysis.row.penaltyTotal)}</p>
                </Card>
                <Card className="p-3">
                  <p className="text-xs text-ink-muted">Edestas</p>
                  <p className="mt-1 text-2xl font-bold text-ink">{analysis.beatenPercent == null ? "–" : `${analysis.beatenPercent}%`}</p>
                  <p className="text-xs text-ink-muted">võistkondadest</p>
                </Card>
              </div>
              <Card className="p-4"><GapSummary gap={analysis.gap ?? undefined} showClasses={showClasses} /></Card>
              <Card className="p-4">
                <h2 className="font-semibold text-ink">KP-d</h2>
                <p className="mt-1 text-sm text-ink-muted">
                  {analysis.row.competitionName} · läbitud {analysis.row.passedCount} · arvesse läheb {view.ranking.countedKpCount ?? "kõik"} parimat. Keskmine on osavõistluse pingereas olevate võistkondade keskmine.
                </p>
                <div className="mt-3">
                  <TableScroll>
                    <table className="w-full text-sm">
                      <thead>
                        <tr>
                          <th className={th}>KP</th><th className={`${th} text-right`}>Tulemus</th><th className={`${th} text-right`}>Keskmine</th>
                          <th className={`${th} text-right`}>Vahe</th><th className={th}>Läbitud</th><th className={th}>Arvesse</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {analysis.kps.map((kp) => (
                          <tr key={kp.code} className={kp.counted ? "" : "text-ink-subtle"} data-kp={kp.code}>
                            <td className={td}><span className="font-medium">{kp.code}</span> <span className="text-xs text-ink-muted">{kp.name}</span></td>
                            <td className={tdNum}>{number(kp.points, 1)}</td>
                            <td className={tdNum}>{number(kp.competitionAverage, 1)}</td>
                            <td className={tdNum}>{kp.points == null || kp.competitionAverage == null ? "–" : number(kp.points - kp.competitionAverage, 1)}</td>
                            <td className={td}>{kp.points == null ? "–" : kp.passed ? "jah" : <span title={kp.exceptionLabel ?? undefined}>ei{kp.exceptionLabel ? ` (${kp.exceptionLabel})` : ""}</span>}</td>
                            <td className={td}>{kp.counted ? "✓" : "–"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableScroll>
                </div>
              </Card>
              <Card className="p-4">
                <h2 className="font-semibold text-ink">Karistused</h2>
                {analysis.penalties.length === 0 ? <p className="mt-1 text-sm text-ink-muted">Karistusi pole.</p> : (
                  <ul className="mt-2 space-y-1 text-sm">
                    {analysis.penalties.map((penalty, index) => (
                      <li key={`${penalty.label}-${index}`} className="flex justify-between gap-3"><span className="text-ink">{penalty.label}</span><span className="font-mono text-orange-600">{number(penalty.points, 1)}</span></li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  )
}
