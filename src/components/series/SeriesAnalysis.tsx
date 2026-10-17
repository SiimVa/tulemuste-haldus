import Link from "next/link"
import AnalysisView from "@/components/public/AnalysisView"
import { seriesAnalysisData } from "@/lib/seriesAnalysis"
import type { SeriesView } from "@/lib/seriesRanking.server"
import { KpComparisonWidget } from "./SeriesWidgets"
export function SeriesAnalysis({ view, basePath, mode, teamId }: { view: SeriesView; basePath: string; mode: "team" | "kp"; teamId: string | null }) {
  const data = seriesAnalysisData(view.data, view.ranking)
  return <div className="space-y-5">
    <nav aria-label="Analüüsi vaade" className="flex flex-wrap gap-2 text-sm">
      <Link href={basePath} aria-current={mode === "team" ? "page" : undefined} className="rounded-lg border bg-white px-4 py-2">Võistkonnad ja KP võrdlus</Link>
      <Link href={`${basePath}?vaade=kp`} aria-current={mode === "kp" ? "page" : undefined} className="rounded-lg border bg-white px-4 py-2">KP-d osavõistlustes</Link>
    </nav>
    {mode === "kp" ? <KpComparisonWidget view={view} /> : <>
      <p className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">Pingerida arvestab iga võistkonna {view.ranking.countedKpCount ?? "kõiki"} parimat KP-d ja kõiki lisakaristusi. Arvestamata KP-d on märgitud eraldi. KP võrdlus kasutab üleriiklikult ümberarvutatud punkte.</p>
      <AnalysisView embedded enableSimulator={false} initialTeamId={teamId} teamUrlBase={basePath}
        competitionId={`series-${view.series.id}`} competitionName={view.series.name}
        scoringMode={view.ranking.scoringMode ?? "PLUS"} {...data} simElements={[]} defaultMax={30} />
    </>}
  </div>
}
