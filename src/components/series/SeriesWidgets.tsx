import type { ReactNode } from "react"
import { EmptyState, TableScroll, WidgetFrame, td, tdNum, th } from "@/components/dashboard/WidgetCard"
import { ScreenRotator } from "@/components/dashboard/ScreenRotator"
import { RankBadge } from "@/components/leaderboard/LeaderboardDetails"
import { formatDateTime, formatNumber } from "@/lib/dashboard/format"
import { seriesWidget, type SeriesWidgetId } from "@/lib/seriesDashboard"
import { classComparison, closeContests, competitionComparison, kpComparison, topTeams } from "@/lib/seriesInsights"
import type { SeriesView } from "@/lib/seriesRanking.server"

type WidgetProps = { view: SeriesView }

const number = (value: number | null | undefined, digits = 2) => formatNumber(value, digits)

function Frame({ id, subtitle, children }: { id: SeriesWidgetId; subtitle?: ReactNode; children: ReactNode }) {
  return <WidgetFrame id={id} title={seriesWidget(id).title} subtitle={subtitle}>{children}</WidgetFrame>
}

function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg bg-canvas px-3 py-2.5">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="mt-0.5 text-2xl font-bold tabular-nums text-ink">{value}</p>
      {hint && <p className="text-xs text-ink-muted">{hint}</p>}
    </div>
  )
}

function SummaryWidget({ view }: WidgetProps) {
  const { ranking } = view
  const finished = view.competitions.filter((competition) => competition.status === "FINISHED").length
  return (
    <Frame id="summary">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Osavõistlusi" value={ranking.competitions.length} hint={`lõppenud ${finished}`} />
        <Stat label="Võistkondi arvestuses" value={ranking.rows.length} />
        <Stat label="Arvestatav KP-de arv" value={ranking.countedKpCount ?? "–"} hint="väikseim ümardatud keskmine" />
        <Stat label="Klasse" value={ranking.classes.length} />
      </div>
    </Frame>
  )
}

function TopTeamsWidget({ view }: WidgetProps) {
  const groups = topTeams(view.ranking, view.config.thresholds.topCount).filter((group) => group.entries.length > 0)
  return (
    <Frame id="topTeams" subtitle={`Esimesed ${view.config.thresholds.topCount} üldarvestuses ja klassiti`}>
      {groups.length === 0 ? <EmptyState>Tulemusi pole veel.</EmptyState> : (
        <div className="grid gap-4 sm:grid-cols-2">
          {groups.map((group) => (
            <div key={group.className ?? "all"} data-top-group={group.className ?? "Üld"}>
              <h3 className="mb-1 text-sm font-semibold text-ink">{group.className ?? "Üldarvestus"}</h3>
              <ol className="space-y-1">
                {group.entries.map((entry) => (
                  <li key={entry.team.id} className="flex items-center gap-2 text-sm">
                    <span className="w-8 shrink-0 text-center"><RankBadge rank={entry.rank} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-ink">{entry.team.name}</span>
                      <span className="block truncate text-xs text-ink-muted">{entry.competitionName}</span>
                    </span>
                    <span className="shrink-0 text-right font-mono tabular-nums text-ink">
                      {number(entry.total)}
                      {entry.gapToPrevious != null && <span className="block text-xs text-ink-muted">{entry.gapToPrevious === 0 ? "viik" : `−${number(entry.gapToPrevious)}`}</span>}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </Frame>
  )
}

function CompetitionsWidget({ view }: WidgetProps) {
  const rows = competitionComparison(view.ranking)
  return (
    <Frame id="competitions" subtitle="Läbitud KP = sooritus, „Ebaõnnestus” või „Läbis, aga ei sooritanud”. N on väikseim ümardatud keskmine.">
      <TableScroll>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className={th}>Osavõistlus</th><th className={`${th} text-right`}>Võistkondi</th>
              <th className={`${th} text-right`}>Keskm. läbitud KP</th><th className={`${th} text-right`}>Ümardatud</th>
              <th className={`${th} text-right`}>Keskm. tulemus</th><th className={th}>Parim</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className={td}>{row.name}</td>
                <td className={tdNum}>{row.teamCount}</td>
                <td className={tdNum}>{number(row.average)}</td>
                <td className={tdNum}>
                  <span className={row.isMinimum ? "rounded bg-primary-soft px-1.5 font-semibold text-primary-hover" : ""} title={row.isMinimum ? "Määrab arvestatava KP-de arvu" : undefined}>{row.roundedAverage ?? "–"}</span>
                </td>
                <td className={tdNum}>{number(row.averageTotal)}</td>
                <td className={td}>{row.best ? <>{row.best.name} <span className="font-mono text-xs text-ink-muted">{number(row.bestTotal)}</span></> : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
    </Frame>
  )
}

function ClassComparisonWidget({ view }: WidgetProps) {
  const { competitions, rows } = classComparison(view.ranking)
  return (
    <Frame id="classComparison" subtitle="Keskmine tulemus klassiti kokku ja osavõistluste kaupa.">
      {rows.length === 0 ? <EmptyState>Klasse pole.</EmptyState> : (
        <TableScroll>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={th}>Klass</th><th className={`${th} text-right`}>Võistkondi</th><th className={`${th} text-right`}>Keskmine</th><th className={`${th} text-right`}>Parim</th>
                {competitions.map((competition) => <th key={competition.id} className={`${th} text-right`}>{competition.name}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row) => (
                <tr key={row.className}>
                  <td className={`${td} font-medium`}>{row.className}</td>
                  <td className={tdNum}>{row.teamCount}</td>
                  <td className={tdNum}>{number(row.averageTotal)}</td>
                  <td className={tdNum}>{number(row.bestTotal)}</td>
                  {row.byCompetition.map((value, index) => <td key={competitions[index].id} className={tdNum}>{number(value)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
    </Frame>
  )
}

function CloseContestsWidget({ view }: WidgetProps) {
  const contests = closeContests(view.ranking, view.config.thresholds.closeGap)
  return (
    <Frame id="closeContests" subtitle={`Poodiumikohad, kus vahe naabriga on kuni ${number(view.config.thresholds.closeGap)} p`}>
      {contests.length === 0 ? <EmptyState>Tihedaid heitlusi pole.</EmptyState> : (
        <ul className="space-y-2 text-sm">
          {contests.map((contest) => (
            <li key={`${contest.className}-${contest.upper.team.id}-${contest.lower.team.id}`} className="rounded-lg bg-canvas px-3 py-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{contest.className ?? "Üldarvestus"}</span>
              <p className="text-ink">
                {contest.upper.rank}. {contest.upper.team.name} <span className="text-ink-muted">({number(contest.upper.total)})</span>
                {" – "}
                {contest.lower.rank}. {contest.lower.team.name} <span className="text-ink-muted">({number(contest.lower.total)})</span>
              </p>
              <p className="text-xs text-ink-muted">Vahe {number(contest.gap)} p</p>
            </li>
          ))}
        </ul>
      )}
    </Frame>
  )
}

// Ka analüüsi KP-de vaade.
export function KpComparisonWidget({ view }: WidgetProps) {
  const { competitions, rows } = kpComparison(view.data, view.ranking)
  return (
    <Frame id="kpComparison" subtitle="Keskmine KP tulemus (läbimise %). Esile tõstetud osavõistlus oli selles KP-s raskeim (protsendina maksimumist).">
      {rows.length === 0 ? <EmptyState>KP-sid pole.</EmptyState> : (
        <TableScroll maxHeight>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={th}>KP</th>
                {competitions.map((competition) => <th key={competition.id} className={`${th} text-right`}>{competition.name}</th>)}
                <th className={`${th} text-right`}>Vahe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row) => (
                <tr key={row.code} data-kp={row.code}>
                  <td className={td}><span className="font-medium">{row.code}</span> <span className="text-xs text-ink-muted">{row.name}</span></td>
                  {row.cells.map((cell) => (
                    <td key={cell.competitionId} className={`${tdNum} ${cell.competitionId === row.hardestCompetitionId ? "bg-amber-50 font-semibold text-amber-900" : ""}`}>
                      {cell.averagePoints === null ? "–" : <>{number(cell.averagePoints, 1)} <span className="text-xs font-normal text-ink-muted">({number(cell.passedPercent, 0)}%)</span></>}
                    </td>
                  ))}
                  <td className={tdNum}>{number(row.spread, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
    </Frame>
  )
}

const RENDERERS: Record<SeriesWidgetId, (props: WidgetProps) => ReactNode> = {
  summary: SummaryWidget,
  topTeams: TopTeamsWidget,
  competitions: CompetitionsWidget,
  classComparison: ClassComparisonWidget,
  closeContests: CloseContestsWidget,
  kpComparison: KpComparisonWidget,
}

export function SeriesFreezeNotice({ view }: { view: SeriesView }) {
  if (view.publicFreeze) {
    return (
      <p role="status" className="rounded-xl border border-primary-soft bg-primary-soft px-4 py-3 text-sm text-primary-hover">
        Üleriiklik arvestus on külmutatud seisuga {formatDateTime(view.publicFreeze.freezeAt)}. Lõplik seis avalikustatakse autasustamisel.
      </p>
    )
  }
  if (view.frozenCompetitionNames.length > 0) {
    return (
      <p role="status" className="rounded-xl border border-primary-soft bg-primary-soft px-4 py-3 text-sm text-primary-hover">
        Osavõistluse {view.frozenCompetitionNames.join(", ")} pingerida on külmutatud; arvestuses on selle külmutamise hetke seis.
      </p>
    )
  }
  return null
}

export function SeriesDashboardView({ view, widgets }: { view: SeriesView; widgets: SeriesWidgetId[] }) {
  if (widgets.length === 0) return <p className="py-10 text-center text-ink-muted">Ühtegi vidinat pole valitud.</p>
  return (
    <div className="grid min-w-0 gap-5">
      {widgets.map((id) => {
        const Widget = RENDERERS[id]
        return <div key={id} className="min-w-0"><Widget view={view} /></div>
      })}
    </div>
  )
}

export function SeriesDashboardScreen({ view, widgets }: { view: SeriesView; widgets: SeriesWidgetId[] }) {
  return (
    <div className="min-h-screen bg-canvas px-4 py-4 sm:px-6">
      <ScreenRotator title={view.series.name} rotateSeconds={view.config.thresholds.screenRotateSeconds} labels={widgets.map((id) => seriesWidget(id).title)}>
        {widgets.map((id) => {
          const Widget = RENDERERS[id]
          return <div key={id} className="screen-zoom mx-auto max-w-7xl"><Widget view={view} /></div>
        })}
      </ScreenRotator>
    </div>
  )
}
