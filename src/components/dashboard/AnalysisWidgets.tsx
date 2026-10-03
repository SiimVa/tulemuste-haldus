import { EmptyState, TableScroll, WidgetCard, td, tdNum, th } from "@/components/dashboard/WidgetCard"
import type { DashboardData } from "@/lib/dashboard/data.server"
import { formatDuration, formatNumber, formatPercent, formatSecondsOfDay } from "@/lib/dashboard/format"

function ElementName({ code, name }: { code: string; name: string }) {
  return <><span className="font-mono text-xs text-ink-subtle">{code}</span> <span className="font-medium text-ink">{name}</span></>
}

export function ElementTableWidget({ data }: { data: DashboardData }) {
  const rows = data.elementTable
  if (!rows) return null
  return (
    <WidgetCard id="elementTable" subtitle="„Käis KP-s” = sooritas + läbis, aga ei sooritanud. Andmete täielikkus arvestab sooritanute sisestusvälju.">
      {rows.length === 0 ? <EmptyState>Elemente pole.</EmptyState> : (
        <TableScroll>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={th}>Element</th><th className={`${th} text-right`}>Oodatud</th><th className={`${th} text-right`}>Tulemusi</th>
                <th className={`${th} text-right`}>Sooritas</th><th className={`${th} text-right`}>Läbis, ei sooritanud</th><th className={`${th} text-right`}>Ei läbinud</th>
                <th className={`${th} text-right`}>Muu erand</th><th className={`${th} text-right`}>Käis KP-s</th><th className={`${th} text-right`}>Andmed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-line">
                  <td className={td}><ElementName code={row.code} name={row.name} /></td>
                  <td className={tdNum}>{row.expected}</td>
                  <td className={tdNum}>{row.entered} <span className="text-xs text-ink-muted">{formatPercent(row.enteredPct)}</span></td>
                  <td className={tdNum}>{row.performed}</td>
                  <td className={tdNum}>{row.passedNotDone}</td>
                  <td className={tdNum}>{row.notPassed}</td>
                  <td className={tdNum}>{row.otherException}</td>
                  <td className={`${tdNum} font-semibold`}>{row.visited}</td>
                  <td className={tdNum}>{formatPercent(row.dataPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
    </WidgetCard>
  )
}

function Bar({ value, tone }: { value: number; tone: string }) {
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-sunken">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  )
}

export function DifficultyWidget({ data }: { data: DashboardData }) {
  const rows = data.difficulty
  if (!rows) return null
  return (
    <WidgetCard id="difficulty" subtitle="Keskmine punktikaotus parima tulemuse suhtes, protsendina KP maksimumist. Erandiga tulemused on sooritamata.">
      {rows.length === 0 ? <EmptyState>KP-de tulemusi pole veel.</EmptyState> : (
        <ul className="space-y-2.5">
          {rows.map((row) => (
            <li key={row.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-sm sm:grid-cols-[14rem_minmax(0,1fr)_15rem]">
              <span className="min-w-0 truncate"><ElementName code={row.code} name={row.name} /></span>
              <span className="order-3 col-span-2 sm:order-none sm:col-span-1"><Bar value={row.lossPct ?? 0} tone={(row.lossPct ?? 0) >= 50 ? "bg-red-500" : (row.lossPct ?? 0) >= 25 ? "bg-amber-500" : "bg-green-500"} /></span>
              <span className="whitespace-nowrap text-right tabular-nums">
                <strong className="text-ink">{formatPercent(row.lossPct)}</strong>
                <span className="ml-2 text-xs text-ink-muted">−{formatNumber(row.averageLoss, 2)} p{row.notDonePct ? ` · sooritamata ${formatPercent(row.notDonePct)}` : ""}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  )
}

function correlationLabel(value: number | null) {
  if (value == null) return "liiga vähe andmeid"
  const strength = Math.abs(value) >= 0.6 ? "tugev" : Math.abs(value) >= 0.3 ? "mõõdukas" : "nõrk"
  return value < 0 ? `${strength}, vastupidine` : strength
}

export function DiscriminationWidget({ data }: { data: DashboardData }) {
  const rows = data.discrimination
  if (!rows) return null
  const maxStd = Math.max(1e-9, ...rows.map((row) => row.stdDev))
  return (
    <WidgetCard id="discrimination" subtitle="Hajuvus näitab, kui palju KP punktid võistkonniti erinesid. Seos näitab, kas KP-s edukad olid ka ülejäänud võistlusel eespool (Spearman, −1…1).">
      {rows.length === 0 ? <EmptyState>KP-de tulemusi pole veel.</EmptyState> : (
        <TableScroll>
          <table className="w-full text-sm">
            <thead><tr><th className={th}>KP</th><th className={th}>Hajuvus</th><th className={`${th} text-right`}>Vahemik</th><th className={`${th} text-right`}>Seos</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-line">
                  <td className={td}><ElementName code={row.code} name={row.name} /></td>
                  <td className={`${td} min-w-32`}>
                    <div className="flex items-center gap-2"><Bar value={(row.stdDev / maxStd) * 100} tone="bg-blue-500" /><span className="w-12 shrink-0 text-right tabular-nums">{formatNumber(row.stdDev, 2)}</span></div>
                    {row.stdDev === 0 && <span className="text-xs text-ink-muted">Kõik said sama tulemuse</span>}
                  </td>
                  <td className={tdNum}>{formatNumber(row.range, 2)}</td>
                  <td className={tdNum}>{row.correlation == null ? "–" : formatNumber(row.correlation, 2)} <span className="block text-xs text-ink-muted">{correlationLabel(row.correlation)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
    </WidgetCard>
  )
}

export function ClassComparisonWidget({ data }: { data: DashboardData }) {
  const comparison = data.classComparison
  if (!comparison) return null
  return (
    <WidgetCard id="classComparison" subtitle={`Klassi keskmised punktid KP kaupa. ${data.competition.scoringMode === "PLUS" ? "Suurem" : "Väiksem"} on parem; parim on rõhutatud.`}>
      {comparison.classes.length < 2 ? <EmptyState>Võrdlemiseks on vaja vähemalt kahte klassi.</EmptyState> : (
        <TableScroll>
          <table className="w-full text-sm">
            <thead><tr><th className={th}>KP</th>{comparison.classes.map((cls) => <th key={cls} className={`${th} text-right`}>{cls}</th>)}</tr></thead>
            <tbody>
              {comparison.rows.map((row) => (
                <tr key={row.id} className="border-t border-line">
                  <td className={td}><ElementName code={row.code} name={row.name} /></td>
                  {comparison.classes.map((cls, index) => (
                    <td key={cls} className={`${tdNum} ${row.bestClass === cls ? "font-bold text-success" : ""}`}>
                      {formatNumber(row.averages[index], 2)} <span className="text-xs font-normal text-ink-subtle">({row.counts[index]})</span>
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="border-t-2 border-line">
                <td className={`${td} font-semibold`}>Keskmine kogusumma</td>
                {comparison.totals.map((total, index) => <td key={comparison.classes[index]} className={`${tdNum} font-semibold`}>{formatNumber(total, 2)}</td>)}
              </tr>
            </tbody>
          </table>
        </TableScroll>
      )}
    </WidgetCard>
  )
}

export function TimeSpentWidget({ data }: { data: DashboardData }) {
  const rows = data.timeSpent
  if (!rows) return null
  return (
    <WidgetCard id="timeSpent" subtitle="Ajavahemiku väljal on kestus lõpp miinus algus; samaaegselt näitab, mitu võistkonda oli korraga ülesandel.">
      {rows.length === 0 ? <EmptyState>Ajaväljaga KP-sid või nende tulemusi pole.</EmptyState> : (
        <TableScroll>
          <table className="w-full text-sm">
            <thead><tr><th className={th}>KP</th><th className={`${th} text-right`}>Keskmine</th><th className={`${th} text-right`}>Mediaan</th><th className={th}>Kiireim</th><th className={th}>Aeglaseim</th><th className={th}>Samaaegselt</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-line">
                  <td className={td}><ElementName code={row.code} name={row.name} /><span className="block text-xs text-ink-muted">{row.fieldLabel} · {row.n} tulemust</span></td>
                  <td className={tdNum}>{formatDuration(row.averageSeconds)}</td>
                  <td className={tdNum}>{formatDuration(row.medianSeconds)}</td>
                  <td className={td}>{formatDuration(row.fastest.seconds)} <span className="text-xs text-ink-muted">{row.fastest.team.name}</span></td>
                  <td className={td}>{formatDuration(row.slowest.seconds)} <span className="text-xs text-ink-muted">{row.slowest.team.name}</span></td>
                  <td className={td}>{row.peakConcurrent ? `kuni ${row.peakConcurrent} (kell ${formatSecondsOfDay(row.peakAtSeconds)})` : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
    </WidgetCard>
  )
}

const PENALTY_TITLES: Record<string, string> = { COUNTER_ACTION: "Vastutegevus", EQUIPMENT_CHECK: "Varustus", LATENESS: "Hilinemine" }

export function PenaltiesWidget({ data }: { data: DashboardData }) {
  const summary = data.penalties
  if (!summary) return null
  const empty = summary.elements.length === 0 && summary.manual.count === 0
  return (
    <WidgetCard id="penalties">
      {empty ? <EmptyState>Karistusi pole.</EmptyState> : (
        <div className="grid gap-3 sm:grid-cols-2">
          {summary.elements.map((element) => (
            <div key={element.id} className="rounded-lg border border-line px-3 py-2 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{PENALTY_TITLES[element.type] ?? element.type}</p>
              <p className="font-medium text-ink"><ElementName code={element.code} name={element.name} /></p>
              <p className="mt-1">{element.teamsAffected} võistkonda · kokku {formatNumber(element.totalPoints, 2)} p</p>
              {element.fields.filter((field) => field.teams > 0).map((field) => <p key={field.label} className="text-ink-muted">{field.label}: {formatNumber(field.total, 2)} ({field.teams} võistkonda)</p>)}
            </div>
          ))}
          {summary.manual.count > 0 && (
            <div className="rounded-lg border border-line px-3 py-2 text-sm sm:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Käsitsi karistused</p>
              <p className="mt-1">{summary.manual.count} karistust · {summary.manual.teams} võistkonda · kokku {formatNumber(summary.manual.totalPoints, 2)} p</p>
              <ul className="mt-1 space-y-0.5 text-ink-muted">
                {summary.manual.byDescription.map((item) => <li key={item.description}>{item.description}: {item.count} × ({formatNumber(item.points, 2)} p)</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </WidgetCard>
  )
}
