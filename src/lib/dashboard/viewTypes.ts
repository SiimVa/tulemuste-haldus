import type { DashboardConfig, DashboardWidgetId, MapColorMode } from "./config"
import type { TeamProgress } from "./routes"
import type { ElementProgressRow, ElementTableRow, EntryRate, FreshnessLevel, FreshnessRow, JudgeActivity, SummaryStats, Withdrawals } from "./progress"
import type { CloseContest, ElementWinner, InterimStandings, TopTeams } from "./standings"
import type { ClassComparison, DifficultyRow, DiscriminationRow, PenaltySummary, TimeSpentRow } from "./analysis"
import type { ScoringMode } from "./types"

export type DashboardAudience = "internal" | "public"

export type DashboardMapPoint = {
  id: string
  code: string
  name: string
  mapX: number
  mapY: number
  visits: number
  // 0 (halb) … 1 (hea) keskmise tulemuse järgi; null kui hinnatav tulemus puudub.
  score: number | null
  freshness: FreshnessLevel | null
  minutesAgo: number | null
  teamsHere: number
}

export type DashboardMapData = {
  mode: "IMAGE" | "SCHEMATIC"
  imageUrl: string | null
  aspect: number
  scaleBar: { meters: number; fraction: number } | null
  colorMode: MapColorMode
  points: DashboardMapPoint[]
  markers: { id: string; label: string; mapX: number; mapY: number }[]
  unplacedCount: number
  maxVisits: number
}

export type DashboardData = {
  competition: { id: string; name: string; status: string; location: string | null; scoringMode: ScoringMode; analysisAccessMode: string }
  audience: DashboardAudience
  generatedAt: Date
  // Avalikus vaates: külmutatud seisu aeg. Töölaual: avaliku pingerea külmutuse seis.
  freeze: { freezeAt: Date; frozen: boolean } | null
  config: DashboardConfig
  widgets: DashboardWidgetId[]
  classes: string[]
  summary?: SummaryStats
  elementProgress?: ElementProgressRow[]
  freshness?: FreshnessRow[]
  teamTracker?: TeamProgress[]
  missingResults?: TeamProgress[]
  judges?: JudgeActivity
  withdrawals?: Withdrawals
  entryRate?: EntryRate | null
  topTeams?: TopTeams
  interimStandings?: InterimStandings
  closeContests?: CloseContest[]
  elementWinners?: ElementWinner[]
  elementTable?: ElementTableRow[]
  difficulty?: DifficultyRow[]
  discrimination?: DiscriminationRow[]
  classComparison?: ClassComparison
  timeSpent?: TimeSpentRow[]
  penalties?: PenaltySummary
  map?: DashboardMapData | null
}

