import { WidgetCard, EmptyState } from "@/components/dashboard/WidgetCard"
import type { DashboardData } from "@/lib/dashboard/data.server"
import { TEAM_STATUS_LABELS } from "@/lib/dashboard/routes"
import { formatClock, formatNumber, formatPercent } from "@/lib/dashboard/format"

// Poolringikujuline näidik: punane < 50%, oranž < 80%, roheline.
export function Gauge({ value, label }: { value: number | null; label: string }) {
  const clamped = Math.max(0, Math.min(100, value ?? 0))
  const angle = Math.PI * (1 - clamped / 100)
  const arc = (from: number, to: number) => {
    const a0 = Math.PI * (1 - from / 100), a1 = Math.PI * (1 - to / 100)
    return `M ${60 + 50 * Math.cos(a0)} ${60 - 50 * Math.sin(a0)} A 50 50 0 0 1 ${60 + 50 * Math.cos(a1)} ${60 - 50 * Math.sin(a1)}`
  }
  return (
    <figure className="flex flex-col items-center">
      <svg viewBox="0 0 120 72" className="w-full max-w-44" role="img" aria-label={`${label}: ${formatPercent(value)}`}>
        <path d={arc(0, 50)} stroke="#dc2626" strokeWidth="10" fill="none" />
        <path d={arc(50, 80)} stroke="#f59e0b" strokeWidth="10" fill="none" />
        <path d={arc(80, 100)} stroke="#16a34a" strokeWidth="10" fill="none" />
        {value != null && <line x1="60" y1="60" x2={60 + 42 * Math.cos(angle)} y2={60 - 42 * Math.sin(angle)} stroke="#111827" strokeWidth="3" strokeLinecap="round" />}
        <circle cx="60" cy="60" r="5" fill="#111827" />
      </svg>
      <figcaption className="-mt-1 text-center">
        <span className="block text-2xl font-bold text-ink tabular-nums">{formatPercent(value)}</span>
        <span className="text-xs text-ink-muted">{label}</span>
      </figcaption>
    </figure>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-canvas px-3 py-3">
      <p className="text-3xl font-bold text-ink tabular-nums sm:text-4xl">{value}</p>
      <p className="mt-1 text-xs text-ink-muted">{label}</p>
      {sub && <p className="text-xs text-ink-subtle">{sub}</p>}
    </div>
  )
}

export function SummaryWidget({ data }: { data: DashboardData }) {
  const summary = data.summary
  if (!summary) return null
  const statuses = (["ON_ROUTE", "FINISHED", "NOT_SEEN", "DNF", "DNS"] as const).filter((status) => summary.statusCounts[status] > 0)
  return (
    <WidgetCard id="summary">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="KP-d keskmiselt läbitud" value={formatNumber(summary.averageVisited)} sub={`${summary.routeElementCount} KP-st`} />
        <Gauge value={summary.visitPct} label="Läbimise %" />
        <Stat label="Tulemusi sisestatud" value={String(summary.resultsEntered)} sub={`${summary.resultsExpected} oodatust`} />
        <Gauge value={summary.resultsPct} label="Tulemuste %" />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-soft">
        <span>{summary.teamCount} võistkonda{summary.inCompCount !== summary.teamCount && ` (${summary.inCompCount} arvestuses)`}</span>
        <span>{summary.classCount} klassi</span>
        <span>{summary.activeElementCount} elementi</span>
        {statuses.map((status) => <span key={status}>{TEAM_STATUS_LABELS[status]}: <strong className="text-ink">{summary.statusCounts[status]}</strong></span>)}
        {summary.alertCount > 0 && (
          <a href="#widget-teamTracker-title" className="rounded-full bg-danger-soft px-2.5 py-0.5 text-xs font-semibold text-danger-hover">
            {summary.alertCount} ohutushoiatus{summary.alertCount === 1 ? "" : "t"}
          </a>
        )}
      </div>
    </WidgetCard>
  )
}

// Elemenditüübi värvid on kategooriavärvid, mitte tokenid.
export const TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  CHECKPOINT: { label: "KP", cls: "bg-blue-100 text-blue-700" },
  PENALTY_BOX: { label: "PK", cls: "bg-orange-100 text-orange-700" },
  COUNTER_ACTION: { label: "VT", cls: "bg-red-100 text-red-700" },
  EQUIPMENT_CHECK: { label: "VA", cls: "bg-yellow-100 text-yellow-700" },
  LATENESS: { label: "HL", cls: "bg-purple-100 text-purple-700" },
  ABANDONMENT: { label: "KT", cls: "bg-rose-100 text-rose-700" },
  OTHER: { label: "MU", cls: "bg-teal-100 text-teal-700" },
  MANUAL: { label: "KS", cls: "bg-gray-100 text-gray-600" },
}

export function ElementProgressWidget({ data }: { data: DashboardData }) {
  const rows = data.elementProgress
  if (!rows) return null
  return (
    <WidgetCard id="elementProgress" subtitle="Sisestatud / oodatud tulemused. Katkestanud võistkondadelt tulemust ei oodata.">
      {rows.length === 0 ? <EmptyState>Ühtegi elementi pole lisatud</EmptyState> : (
        <ul className="-my-1 divide-y divide-line">
          {rows.map((row) => {
            const pct = row.total > 0 ? (row.entered / row.total) * 100 : 0
            const badge = TYPE_BADGE[row.type] ?? { label: "?", cls: "bg-gray-100 text-gray-600" }
            const done = row.entered >= row.total && row.total > 0
            return (
              <li key={row.id} className={`flex items-center gap-3 py-2 ${row.isCancelled ? "opacity-50" : ""}`}>
                <span className="w-9 shrink-0 font-mono text-xs text-ink-subtle">{row.code}</span>
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${badge.cls}`}>{badge.label}</span>
                <span className={`w-28 shrink-0 truncate text-sm font-medium sm:w-40 ${row.isCancelled ? "text-ink-subtle line-through" : "text-ink"}`}>{row.name}</span>
                <div className="h-2 min-w-8 flex-1 overflow-hidden rounded-full bg-sunken">
                  <div className={`h-full rounded-full ${done ? "bg-green-500" : "bg-blue-400"}`} style={{ width: `${pct}%` }} />
                </div>
                <span className={`shrink-0 text-right font-mono text-sm ${done ? "font-semibold text-green-700" : "text-ink-soft"}`}>
                  {row.entered}/{row.total}
                  {row.withdrawn > 0 && <span className="ml-2 text-xs text-red-600">{row.withdrawn} KAT</span>}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </WidgetCard>
  )
}

export function EntryRateWidget({ data }: { data: DashboardData }) {
  if (data.entryRate === undefined) return null
  const rate = data.entryRate
  if (!rate) return <WidgetCard id="entryRate"><EmptyState>Tulemusi pole veel sisestatud.</EmptyState></WidgetCard>
  const max = Math.max(1, ...rate.buckets.map((bucket) => bucket.count))
  const width = 600, height = 160, gap = 2
  const barWidth = Math.max(1, width / rate.buckets.length - gap)
  const labelEvery = Math.ceil(rate.buckets.length / 6)
  const eta = rate.etaMinutes != null ? new Date(data.generatedAt.getTime() + rate.etaMinutes * 60_000) : null
  return (
    <WidgetCard id="entryRate" subtitle={`Tulemusi ${rate.bucketMinutes} minuti kaupa`}>
      <svg viewBox={`0 0 ${width + 36} ${height + 20}`} className="w-full" role="img" aria-label={`Sisestatud tulemused ajas, kokku ${rate.total}`}>
        {rate.buckets.map((bucket, index) => {
          const barHeight = (bucket.count / max) * height
          const x = index * (barWidth + gap)
          return (
            <g key={bucket.start.getTime()}>
              <rect x={x} y={height - barHeight} width={barWidth} height={barHeight} rx="2" fill="#3b82f6">
                <title>{`${formatClock(bucket.start)}: ${bucket.count} tulemust`}</title>
              </rect>
              {index % labelEvery === 0 && <text x={x} y={height + 15} fontSize="12" fill="#6b7280">{formatClock(bucket.start)}</text>}
            </g>
          )
        })}
        <line x1="0" y1={height} x2={width} y2={height} stroke="#e5e7eb" />
      </svg>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div><dt className="text-xs text-ink-muted">Kokku</dt><dd className="font-semibold text-ink">{rate.total}</dd></div>
        <div><dt className="text-xs text-ink-muted">Viimase tunni jooksul</dt><dd className="font-semibold text-ink">{rate.lastHour}</dd></div>
        <div><dt className="text-xs text-ink-muted">Ootel</dt><dd className="font-semibold text-ink">{rate.remaining}</dd></div>
        <div><dt className="text-xs text-ink-muted">Kõik sees umbes</dt><dd className="font-semibold text-ink">{eta ? `kell ${formatClock(eta)}` : "–"}</dd></div>
      </dl>
    </WidgetCard>
  )
}
