import { EmptyState, TableScroll, WidgetCard, td, tdNum, th } from "@/components/dashboard/WidgetCard"
import type { DashboardData } from "@/lib/dashboard/data.server"
import type { RankedTeam } from "@/lib/dashboard/standings"
import { formatNumber } from "@/lib/dashboard/format"

const MEDALS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" }
const ROW_TONE: Record<number, string> = { 1: "bg-amber-50", 2: "bg-gray-50", 3: "bg-orange-50" }

function RankCell({ rank }: { rank: number }) {
  return <span className="inline-block w-7 text-center text-lg" aria-label={`${rank}. koht`}>{MEDALS[rank] ?? <span className="text-sm font-bold text-ink-soft">{rank}.</span>}</span>
}

function TopList({ title, teams }: { title: string; teams: RankedTeam[] }) {
  return (
    <div className="min-w-0">
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-muted">{title}</h3>
      <ol className="space-y-1.5">
        {teams.map((row) => (
          <li key={row.team.id} className={`flex items-center gap-2 rounded-lg px-2 py-2 ${ROW_TONE[row.rank] ?? "bg-canvas"}`}>
            <RankCell rank={row.rank} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-ink">{row.team.name}</span>
              <span className="text-xs text-ink-muted">
                {row.gapPrevious != null ? `vahe eelmisega ${formatNumber(row.gapPrevious, 2)}` : "liider"}
                {row.gapFirst ? ` · esimesega ${formatNumber(row.gapFirst, 2)}` : ""}
              </span>
            </span>
            <span className="shrink-0 text-right font-bold text-ink tabular-nums">{formatNumber(row.total, 2)}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

export function TopTeamsWidget({ data }: { data: DashboardData }) {
  const top = data.topTeams
  if (!top) return null
  const lists = [{ title: "Üldarvestus", teams: top.overall }, ...top.classes.map((cls) => ({ title: cls.name, teams: cls.teams }))]
  return (
    <WidgetCard id="topTeams" subtitle={data.competition.scoringMode === "PLUS" ? "Punktid, suurem on parem." : "Karistuspunktid, väiksem on parem."}>
      {top.overall.length === 0 ? <EmptyState>Pingerida pole veel.</EmptyState> : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {lists.map((list) => <TopList key={list.title} title={list.title} teams={list.teams} />)}
        </div>
      )}
    </WidgetCard>
  )
}

export function InterimStandingsWidget({ data }: { data: DashboardData }) {
  const interim = data.interimStandings
  if (!interim) return null
  const useCommon = interim.commonElements.length > 0
  const rows = [...interim.rows].sort((a, b) =>
    (useCommon ? (a.commonRank ?? 9999) - (b.commonRank ?? 9999) : 0) ||
    (a.averageRank ?? 9999) - (b.averageRank ?? 9999) ||
    a.officialRank - b.officialRank)
  return (
    <WidgetCard id="interimStandings" subtitle={useCommon
      ? `Ühised KP-d, mille tulemus on kõigil olemas: ${interim.commonElements.map((item) => item.code).join(", ")}.`
      : "Ühist KP-d, mille tulemus oleks kõigil olemas, veel pole. Võrdlus käib keskmise järgi läbitud KP kohta."}>
      {rows.length === 0 ? <EmptyState>Pingerida pole veel.</EmptyState> : (
        <TableScroll maxHeight>
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface">
              <tr>
                <th className={th}>Koht</th><th className={th}>Võistkond</th>
                {useCommon && <th className={`${th} text-right`}>Ühised KP-d</th>}
                <th className={`${th} text-right`}>Keskm. KP kohta</th><th className={`${th} text-right`}>Koht keskm. järgi</th>
                <th className={`${th} text-right`}>Läbitud KP-d</th><th className={`${th} text-right`}>Ametlik koht</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.team.id} className="border-t border-line">
                  <td className={`${td} font-bold`}>{(useCommon ? row.commonRank : row.averageRank) ?? "–"}</td>
                  <td className={td}><span className="font-medium text-ink">{row.team.name}</span> {row.team.class && <span className="text-xs text-ink-muted">{row.team.class}</span>}</td>
                  {useCommon && <td className={tdNum}>{formatNumber(row.commonTotal, 2)}</td>}
                  <td className={tdNum}>{formatNumber(row.average, 2)}</td>
                  <td className={tdNum}>{row.averageRank ?? "–"}</td>
                  <td className={tdNum}>{row.scoredCount}/{interim.routeElementCount}</td>
                  <td className={tdNum}>{row.officialRank}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
    </WidgetCard>
  )
}

export function CloseContestsWidget({ data }: { data: DashboardData }) {
  const contests = data.closeContests
  if (!contests) return null
  const gap = data.config.thresholds.closeGap
  return (
    <WidgetCard id="closeContests" subtitle={`Naaberkohad poodiumil, mille vahe on kuni ${formatNumber(gap, 2)} punkti.`}>
      {contests.length === 0 ? <EmptyState>Poodiumil pole praegu nii tihedaid heitlusi.</EmptyState> : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {contests.map((contest) => (
            <li key={`${contest.scope ?? ""}-${contest.upper.team.id}-${contest.lower.team.id}`} className="rounded-lg border border-line px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                {contest.scope ?? "Üldarvestus"} · {contest.upper.rank === contest.lower.rank ? `jagatud ${contest.upper.rank}. koht` : `${contest.upper.rank}. ja ${contest.lower.rank}. koht`}
              </p>
              <p className="mt-1 text-sm"><strong className="text-ink">{contest.upper.team.name}</strong> <span className="text-ink-muted">vs</span> <strong className="text-ink">{contest.lower.team.name}</strong></p>
              <p className="mt-0.5 text-lg font-bold text-danger-hover tabular-nums">{contest.gap === 0 ? "Viik" : `vahe ${formatNumber(contest.gap, 2)}`}</p>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  )
}

export function ElementWinnersWidget({ data }: { data: DashboardData }) {
  const winners = data.elementWinners
  if (!winners) return null
  const names = (teams: { name: string }[]) => (teams.length > 3 ? `${teams.length} võistkonda` : teams.map((team) => team.name).join(", "))
  return (
    <WidgetCard id="elementWinners">
      {winners.length === 0 ? <EmptyState>KP-de tulemusi pole veel.</EmptyState> : (
        <TableScroll>
          <table className="w-full text-sm">
            <thead><tr><th className={th}>KP</th><th className={th}>Parim</th><th className={`${th} text-right`}>Punktid</th>{data.classes.map((cls) => <th key={cls} className={th}>{cls}</th>)}</tr></thead>
            <tbody>
              {winners.map((winner) => (
                <tr key={winner.element.id} className="border-t border-line">
                  <td className={td}><span className="font-mono text-xs text-ink-subtle">{winner.element.code}</span> <span className="font-medium text-ink">{winner.element.name}</span></td>
                  <td className={`${td} font-semibold text-ink`}>{names(winner.overall)}</td>
                  <td className={tdNum}>{formatNumber(winner.best, 2)}</td>
                  {data.classes.map((cls) => {
                    const entry = winner.classes.find((item) => item.name === cls)
                    return <td key={cls} className={td}>{entry ? `${names(entry.teams)} (${formatNumber(entry.best, 2)})` : "–"}</td>
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
    </WidgetCard>
  )
}
