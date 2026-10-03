import Link from "next/link"
import { EmptyState, WidgetCard } from "@/components/dashboard/WidgetCard"
import type { DashboardData, DashboardMapPoint } from "@/lib/dashboard/data.server"
import { MAP_COLOR_MODE_LABELS } from "@/lib/dashboard/config"
import { scoreColor } from "@/lib/dashboard/mapData"
import type { FreshnessLevel } from "@/lib/dashboard/progress"
import { formatMinutes, formatNumber } from "@/lib/dashboard/format"

const FRESHNESS_COLOR: Record<FreshnessLevel, string> = {
  OK: "#16a34a", WARN: "#f59e0b", ALERT: "#dc2626", NONE: "#9ca3af", DONE: "#2563eb",
}
const FRESHNESS_LABEL: Record<FreshnessLevel, string> = {
  OK: "aktiivne", WARN: "vaikne", ALERT: "vaikib", NONE: "sisestusi pole", DONE: "valmis",
}

function pointColor(point: DashboardMapPoint, mode: string) {
  if (mode === "FRESHNESS") return point.freshness ? FRESHNESS_COLOR[point.freshness] : "#9ca3af"
  if (mode === "RESULT") return scoreColor(point.score)
  return "#2563eb"
}

function describe(point: DashboardMapPoint) {
  const parts = [`${point.code} ${point.name}`, `läbinud ${point.visits}`]
  if (point.score != null) parts.push(`keskmine kaotus ${formatNumber((1 - point.score) * 100, 0)}% maksimumist`)
  if (point.freshness) parts.push(point.minutesAgo != null ? `viimane sisestus ${formatMinutes(point.minutesAgo)} tagasi` : FRESHNESS_LABEL[point.freshness])
  if (point.teamsHere) parts.push(`viimati siin nähtud ${point.teamsHere} võistkonda`)
  return parts.join(" · ")
}

export function MapWidget({ data }: { data: DashboardData }) {
  if (data.map === undefined) return null
  const map = data.map
  const internal = data.audience === "internal"
  if (!map || map.points.length + map.markers.length === 0) {
    if (!internal) return null
    return (
      <WidgetCard id="map">
        <EmptyState>
          Kaardil pole veel ühtegi KP-d. <Link className="text-primary hover:underline" href={`/dashboard/competitions/${data.competition.id}/map`}>Lisa kaart ja asukohad</Link>.
        </EmptyState>
      </WidgetCard>
    )
  }
  const width = 1000
  const height = Math.round(width * map.aspect)
  const minRadius = 10, maxRadius = 45
  const radius = (visits: number) => minRadius + (maxRadius - minRadius) * Math.sqrt(map.maxVisits > 0 ? visits / map.maxVisits : 0)
  const gridStep = map.mode === "SCHEMATIC" && map.scaleBar ? map.scaleBar.fraction * width : 0
  const sorted = [...map.points].sort((a, b) => b.visits - a.visits)

  return (
    <WidgetCard id="map" subtitle={`Mulli suurus: läbinud võistkondade arv. Värv: ${MAP_COLOR_MODE_LABELS[map.colorMode].toLowerCase()}.`}
      actions={internal ? <Link href={`/dashboard/competitions/${data.competition.id}/map`} className="text-sm text-primary hover:underline">Muuda kaarti</Link> : undefined}>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto max-h-[85vh] w-full rounded-lg border border-line bg-canvas" role="img" aria-label={`Kaart, ${map.points.length} KP-d`}>
        {map.imageUrl ? (
          <image href={map.imageUrl} x="0" y="0" width={width} height={height} preserveAspectRatio="none" />
        ) : (
          <g aria-hidden="true">
            <rect width={width} height={height} fill="#f8fafc" />
            {gridStep > 8 && Array.from({ length: Math.ceil(width / gridStep) }, (_, index) => <line key={`v${index}`} x1={index * gridStep} y1="0" x2={index * gridStep} y2={height} stroke="#e2e8f0" />)}
            {gridStep > 8 && Array.from({ length: Math.ceil(height / gridStep) }, (_, index) => <line key={`h${index}`} x1="0" y1={index * gridStep} x2={width} y2={index * gridStep} stroke="#e2e8f0" />)}
          </g>
        )}
        {sorted.map((point) => {
          const x = point.mapX * width, y = point.mapY * height, r = radius(point.visits)
          return (
            <g key={point.id}>
              <title>{describe(point)}</title>
              <circle cx={x} cy={y} r={r} fill={pointColor(point, map.colorMode)} fillOpacity="0.72" stroke="#ffffff" strokeWidth="3" />
              <text x={x} y={y + 6} textAnchor="middle" fontSize="16" fontWeight="700" fill="#ffffff">{point.visits}</text>
              <text x={x + r + 5} y={y + 6} fontSize="20" fontWeight="600" fill="#b91c1c" stroke="#ffffff" strokeWidth="5" paintOrder="stroke">{point.name.length > 22 ? `${point.name.slice(0, 21)}…` : point.name}</text>
              {point.teamsHere > 0 && (
                <g>
                  <circle cx={x + r * 0.75} cy={y - r * 0.75} r="14" fill="#111827" />
                  <text x={x + r * 0.75} y={y - r * 0.75 + 5} textAnchor="middle" fontSize="15" fontWeight="700" fill="#ffffff">{point.teamsHere}</text>
                </g>
              )}
            </g>
          )
        })}
        {map.markers.map((marker) => {
          const x = marker.mapX * width, y = marker.mapY * height
          return (
            <g key={marker.id}>
              <title>{marker.label}</title>
              <path d={`M ${x} ${y - 16} L ${x + 15} ${y + 10} L ${x - 15} ${y + 10} Z`} fill="none" stroke="#dc2626" strokeWidth="5" strokeLinejoin="round" />
              <text x={x + 20} y={y + 8} fontSize="22" fontWeight="800" fill="#111827" stroke="#ffffff" strokeWidth="5" paintOrder="stroke">{marker.label}</text>
            </g>
          )
        })}
        {map.scaleBar && (
          <g aria-hidden="true">
            <line x1="30" y1={height - 30} x2={30 + map.scaleBar.fraction * width} y2={height - 30} stroke="#111827" strokeWidth="6" />
            <text x="30" y={height - 42} fontSize="20" fontWeight="700" fill="#111827" stroke="#ffffff" strokeWidth="5" paintOrder="stroke">
              {map.scaleBar.meters >= 1000 ? `${map.scaleBar.meters / 1000} km` : `${map.scaleBar.meters} m`}
            </text>
          </g>
        )}
      </svg>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
        {map.colorMode === "RESULT" && <span className="flex items-center gap-1.5">Tulemus: <span className="inline-block h-2.5 w-16 rounded-full" style={{ background: "linear-gradient(90deg, hsl(0 70% 45%), hsl(60 70% 45%), hsl(120 70% 45%))" }} /> raske → kerge</span>}
        {map.colorMode === "FRESHNESS" && (Object.keys(FRESHNESS_COLOR) as FreshnessLevel[]).map((level) => (
          <span key={level} className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: FRESHNESS_COLOR[level] }} />{FRESHNESS_LABEL[level]}</span>
        ))}
        {internal && map.points.some((point) => point.teamsHere > 0) && <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-ink" />võistkonnad, keda viimati seal nähti</span>}
        {map.mode === "SCHEMATIC" && <span>Skeem koordinaatide järgi, põhi üleval.</span>}
        {internal && map.unplacedCount > 0 && <Link href={`/dashboard/competitions/${data.competition.id}/map`} className="text-primary hover:underline">{map.unplacedCount} KP-l pole asukohta</Link>}
      </div>
    </WidgetCard>
  )
}
