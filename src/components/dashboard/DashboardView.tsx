import type { ComponentType } from "react"
import type { DashboardData } from "@/lib/dashboard/data.server"
import { dashboardWidget, type DashboardWidgetId } from "@/lib/dashboard/config"
import { formatDateTime } from "@/lib/dashboard/format"
import { ElementProgressWidget, EntryRateWidget, SummaryWidget } from "@/components/dashboard/SummaryWidgets"
import { FreshnessWidget, JudgesWidget, MissingResultsWidget, TeamTrackerWidget, WithdrawalsWidget } from "@/components/dashboard/LiveWidgets"
import { CloseContestsWidget, ElementWinnersWidget, InterimStandingsWidget, TopTeamsWidget } from "@/components/dashboard/ResultWidgets"
import { ClassComparisonWidget, DifficultyWidget, DiscriminationWidget, ElementTableWidget, PenaltiesWidget, TimeSpentWidget } from "@/components/dashboard/AnalysisWidgets"
import { MapWidget } from "@/components/dashboard/MapWidget"
import { ScreenRotator } from "@/components/dashboard/ScreenRotator"

const RENDERERS: Record<DashboardWidgetId, ComponentType<{ data: DashboardData }>> = {
  summary: SummaryWidget,
  map: MapWidget,
  freshness: FreshnessWidget,
  teamTracker: TeamTrackerWidget,
  missingResults: MissingResultsWidget,
  judges: JudgesWidget,
  withdrawals: WithdrawalsWidget,
  entryRate: EntryRateWidget,
  elementProgress: ElementProgressWidget,
  topTeams: TopTeamsWidget,
  interimStandings: InterimStandingsWidget,
  closeContests: CloseContestsWidget,
  elementWinners: ElementWinnersWidget,
  elementTable: ElementTableWidget,
  difficulty: DifficultyWidget,
  discrimination: DiscriminationWidget,
  classComparison: ClassComparisonWidget,
  timeSpent: TimeSpentWidget,
  penalties: PenaltiesWidget,
}

// Kitsad vidinad mahuvad laial ekraanil kahekaupa kõrvuti.
const HALF_WIDTH: DashboardWidgetId[] = ["missingResults", "judges", "withdrawals", "closeContests", "difficulty", "penalties", "entryRate", "elementProgress"]

export function FreezeNotice({ data }: { data: DashboardData }) {
  if (!data.freeze) return null
  if (data.audience === "public") {
    return (
      <p role="status" className="rounded-xl border border-primary-soft bg-primary-soft px-4 py-3 text-sm text-primary-hover">
        Tulemused on külmutatud seisuga {formatDateTime(data.freeze.freezeAt)}. Lõplik pingerida avalikustatakse autasustamisel.
      </p>
    )
  }
  return (
    <p role="status" className="rounded-xl border border-primary-soft bg-primary-soft px-4 py-3 text-sm text-primary-hover">
      {data.freeze.frozen
        ? `Avalik pingerida on külmutatud alates ${formatDateTime(data.freeze.freezeAt)}. Siin näed jooksvat seisu.`
        : `Avalik pingerida külmutatakse ${formatDateTime(data.freeze.freezeAt)}.`}{" "}
      <a className="font-medium underline" href={`/dashboard/competitions/${data.competition.id}/public-view`}>Muuda</a>
    </p>
  )
}

export function DashboardView({ data }: { data: DashboardData }) {
  if (data.widgets.length === 0) {
    return <p className="rounded-xl border border-line bg-surface px-4 py-8 text-center text-sm text-ink-muted">Ühtegi vidinat pole sisse lülitatud.</p>
  }
  return (
    <div className="grid min-w-0 gap-5 lg:grid-cols-2">
      {data.widgets.map((id) => {
        const Widget = RENDERERS[id]
        return (
          <div key={id} className={`min-w-0 ${HALF_WIDTH.includes(id) ? "" : "lg:col-span-2"}`}>
            <Widget data={data} />
          </div>
        )
      })}
    </div>
  )
}

export function DashboardScreen({ data, title }: { data: DashboardData; title: string }) {
  // Tühja kaarti ei näidata eraldi slaidina.
  const slides = data.widgets.filter((id) => id !== "map" || (data.map != null && data.map.points.length + data.map.markers.length > 0))
  return (
    <div className="min-h-screen bg-canvas px-4 py-4 sm:px-6">
      <ScreenRotator title={title} rotateSeconds={data.config.thresholds.screenRotateSeconds} labels={slides.map((id) => dashboardWidget(id).title)}>
        {slides.map((id) => {
          const Widget = RENDERERS[id]
          return <div key={id} className="screen-zoom mx-auto max-w-7xl"><Widget data={data} /></div>
        })}
      </ScreenRotator>
    </div>
  )
}
