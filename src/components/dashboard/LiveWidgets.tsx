import { EmptyState, TableScroll, WidgetCard, td, tdNum, th } from "@/components/dashboard/WidgetCard"
import type { DashboardData } from "@/lib/dashboard/data.server"
import type { FreshnessLevel } from "@/lib/dashboard/progress"
import { TEAM_STATUS_LABELS, type TeamProgress } from "@/lib/dashboard/routes"
import { formatClock, formatDateTime, formatMinutes } from "@/lib/dashboard/format"

export const FRESHNESS_STYLE: Record<FreshnessLevel, { label: string; row: string; badge: string }> = {
  ALERT: { label: "Vaikib", row: "bg-danger-soft", badge: "bg-danger text-white" },
  WARN: { label: "Vaikne", row: "bg-warning-soft", badge: "bg-amber-500 text-white" },
  OK: { label: "Aktiivne", row: "", badge: "bg-success-soft text-success" },
  NONE: { label: "Pole sisestusi", row: "", badge: "bg-canvas text-ink-muted" },
  DONE: { label: "Valmis", row: "", badge: "bg-primary-soft text-primary-hover" },
}

export function FreshnessWidget({ data }: { data: DashboardData }) {
  const rows = data.freshness
  if (!rows) return null
  const { freshnessWarnMinutes: warn, freshnessAlertMinutes: alert } = data.config.thresholds
  const silent = rows.filter((row) => row.level === "ALERT").length
  return (
    <WidgetCard id="freshness" subtitle={data.competition.status === "ACTIVE"
      ? `Kollane: üle ${warn} min vaikust, punane: üle ${alert} min. Valmis KP-d ei hoiata.`
      : "Hoiatused on sees ainult siis, kui võistlus toimub."}
      actions={silent > 0 ? <span className="rounded-full bg-danger px-2.5 py-0.5 text-xs font-semibold text-white">{silent} vaikib</span> : undefined}>
      {rows.length === 0 ? <EmptyState>KP-sid pole lisatud.</EmptyState> : (
        <TableScroll>
          <table className="w-full text-sm">
            <thead><tr><th className={th}>KP</th><th className={th}>Seis</th><th className={th}>Viimane sisestus</th><th className={th}>Möödas</th><th className={th}>Sisestatud</th><th className={th}>30 min</th></tr></thead>
            <tbody>
              {rows.map((row) => {
                const style = FRESHNESS_STYLE[row.level]
                return (
                  <tr key={row.id} className={`border-t border-line ${style.row}`}>
                    <td className={td}><span className="font-mono text-xs text-ink-subtle">{row.code}</span> <span className="font-medium text-ink">{row.name}</span></td>
                    <td className={td}><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${style.badge}`}>{style.label}</span></td>
                    <td className={`${td} whitespace-nowrap tabular-nums`}>{formatDateTime(row.lastActivityAt)}</td>
                    <td className={`${td} whitespace-nowrap font-semibold tabular-nums`}>{formatMinutes(row.minutesAgo)}</td>
                    <td className={tdNum}>{row.entered}/{row.total}</td>
                    <td className={tdNum}>{row.recentCount}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </TableScroll>
      )}
    </WidgetCard>
  )
}

const STATUS_BADGE: Record<TeamProgress["status"], string> = {
  ON_ROUTE: "bg-primary-soft text-primary-hover",
  FINISHED: "bg-success-soft text-success",
  NOT_SEEN: "bg-canvas text-ink-muted",
  DNF: "bg-danger-soft text-danger-hover",
  DNS: "bg-canvas text-ink-subtle",
}

export function TeamTrackerWidget({ data }: { data: DashboardData }) {
  const rows = data.teamTracker
  if (!rows) return null
  const alerts = rows.filter((row) => row.alert)
  const safety = data.config.thresholds.safetyMinutes
  return (
    <WidgetCard id="teamTracker"
      subtitle={`Viimane KP sisestusaja järgi. Hoiatus, kui võistkonda pole ${safety} min üheski KP-s nähtud.`}
      actions={alerts.length > 0 ? <span className="rounded-full bg-danger px-2.5 py-0.5 text-xs font-semibold text-white">{alerts.length} hoiatus{alerts.length === 1 ? "" : "t"}</span> : undefined}>
      {rows.length === 0 ? <EmptyState>Võistkondi pole.</EmptyState> : (
        <TableScroll maxHeight>
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface"><tr><th className={th}>Võistkond</th><th className={th}>Seis</th><th className={th}>Viimati nähtud</th><th className={th}>Järgmine</th><th className={th}>Läbitud</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.team.id} className={`border-t border-line ${row.alert ? "bg-danger-soft" : ""}`}>
                  <td className={td}>
                    <span className="font-mono text-xs text-ink-subtle">{row.team.code}</span> <span className="font-medium text-ink">{row.team.name}</span>
                    {row.team.class && <span className="ml-1 text-xs text-ink-muted">{row.team.class}</span>}
                  </td>
                  <td className={td}>
                    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[row.status]}`}>{TEAM_STATUS_LABELS[row.status]}</span>
                    {row.alert && <span className="mt-1 block text-xs font-semibold text-danger-hover">{row.alert === "OVERDUE" ? `Pole nähtud ${formatMinutes(row.minutesSinceSeen)}` : "Pole ühestki KP-st läbi käinud"}</span>}
                  </td>
                  <td className={`${td} whitespace-nowrap`}>
                    {row.lastSeen ? <>{row.lastSeen.code} · {formatClock(row.lastSeen.at)} <span className="text-ink-muted">({formatMinutes(row.minutesSinceSeen)})</span></> : "–"}
                  </td>
                  <td className={`${td} whitespace-nowrap`}>{row.nextElement ? `${row.nextElement.code} ${row.nextElement.name}` : "–"}</td>
                  <td className={tdNum}>{row.visitedCount}/{row.routeLength}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
    </WidgetCard>
  )
}

export function MissingResultsWidget({ data }: { data: DashboardData }) {
  const rows = data.missingResults
  if (!rows) return null
  return (
    <WidgetCard id="missingResults" subtitle="Võistkond on hilisemas KP-s käinud, aga varasema KP tulemus puudub: kas KP jäi vahele või tulemus sisestamata. Lõpetanutel kontrollitakse kõiki KP-sid.">
      {rows.length === 0 ? <EmptyState>Puuduvaid tulemusi pole.</EmptyState> : (
        <ul className="-my-1 divide-y divide-line text-sm">
          {rows.map((row) => (
            <li key={row.team.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
              <span className="min-w-0"><span className="font-mono text-xs text-ink-subtle">{row.team.code}</span> <span className="font-medium text-ink">{row.team.name}</span></span>
              <span className="text-ink-soft">puudu: {row.missing.map((item) => item.code).join(", ")}</span>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  )
}

export function JudgesWidget({ data }: { data: DashboardData }) {
  const judges = data.judges
  if (!judges) return null
  return (
    <WidgetCard id="judges" subtitle="Kohtunikulingid ja kasutajad, kes on tulemusi sisestanud või kellele on KP määratud.">
      {judges.silentElements.length > 0 && (
        <p className="mb-3 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
          Sisestusi pole: {judges.silentElements.map((item) => `${item.code} ${item.name}`).join(", ")}
        </p>
      )}
      {judges.judges.length === 0 ? <EmptyState>Kohtunikke pole lisatud.</EmptyState> : (
        <TableScroll>
          <table className="w-full text-sm">
            <thead><tr><th className={th}>Sisestaja</th><th className={th}>KP-d</th><th className={th}>Sisestusi</th><th className={th}>Viimane sisestus</th><th className={th}>Link avatud</th></tr></thead>
            <tbody>
              {judges.judges.map((judge) => (
                <tr key={judge.key} className="border-t border-line">
                  <td className={td}><span className="font-medium text-ink">{judge.name}</span> <span className="text-xs text-ink-muted">{judge.kind === "TOKEN" ? "link" : "kasutaja"}</span></td>
                  <td className={td}>{judge.elements.map((item) => item.code).join(", ") || "–"}</td>
                  <td className={tdNum}>{judge.entries}</td>
                  <td className={`${td} whitespace-nowrap`}>{judge.lastEntryAt ? <>{formatClock(judge.lastEntryAt)} <span className="text-ink-muted">({formatMinutes(judge.minutesAgo)})</span></> : "–"}</td>
                  <td className={`${td} whitespace-nowrap`}>{judge.kind === "TOKEN" ? formatDateTime(judge.lastOpenedAt) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
    </WidgetCard>
  )
}

export function WithdrawalsWidget({ data }: { data: DashboardData }) {
  const info = data.withdrawals
  if (!info) return null
  const tiles = [
    { label: "Arvestuses", value: info.counts.inComp },
    { label: "Katkestanud", value: info.counts.dnf },
    { label: "Ei startinud", value: info.counts.dns },
    { label: "Diskvalifitseeritud", value: info.counts.dq },
    { label: "Arvestusvälised", value: info.counts.horsConcours },
  ]
  const team = (item: { code: string; name: string }) => <><span className="font-mono text-xs text-ink-subtle">{item.code}</span> <span className="font-medium text-ink">{item.name}</span></>
  return (
    <WidgetCard id="withdrawals">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-lg bg-canvas px-3 py-2">
            <p className="text-xl font-bold text-ink tabular-nums">{tile.value}</p>
            <p className="text-xs text-ink-muted">{tile.label}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 space-y-3 text-sm">
        {info.dnf.length > 0 && <div><h3 className="font-semibold text-ink">Katkestanud võistkonnad</h3><ul className="mt-1 space-y-1">{info.dnf.map((item) => <li key={item.team.id}>{team(item.team)} <span className="text-ink-muted">alates {item.from ? `${item.from.code} ${item.from.name}` : "algusest"}{item.reason ? ` · ${item.reason}` : ""}</span></li>)}</ul></div>}
        {info.members.length > 0 && <div><h3 className="font-semibold text-ink">Katkestanud liikmed</h3><ul className="mt-1 space-y-1">{info.members.map((item, index) => <li key={`${item.team.id}-${index}`}>{team(item.team)}: {item.description} <span className="text-ink-muted">{[item.element ? `${item.element.code} ${item.element.name}` : null, item.time, item.reason].filter(Boolean).join(" · ")}</span></li>)}</ul></div>}
        {info.dq.length > 0 && <div><h3 className="font-semibold text-ink">Diskvalifitseeritud</h3><ul className="mt-1 space-y-1">{info.dq.map((item) => <li key={item.team.id}>{team(item.team)} <span className="text-ink-muted">alates {item.from ? `${item.from.code} ${item.from.name}` : "algusest"}</span></li>)}</ul></div>}
        {info.dns.length > 0 && <div><h3 className="font-semibold text-ink">Ei startinud</h3><p className="mt-1">{info.dns.map((item) => `${item.code} ${item.name}`).join(", ")}</p></div>}
        {info.horsConcours.length > 0 && <div><h3 className="font-semibold text-ink">Arvestusvälised</h3><p className="mt-1">{info.horsConcours.map((item) => `${item.team.code} ${item.team.name}${item.from ? ` (alates ${item.from.code})` : ""}`).join(", ")}</p></div>}
        {info.dnf.length + info.members.length + info.dq.length + info.dns.length + info.horsConcours.length === 0 && <EmptyState>Katkestamisi ega erinevaid staatusi pole.</EmptyState>}
      </div>
    </WidgetCard>
  )
}
