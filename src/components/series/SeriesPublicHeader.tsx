import Link from "next/link"
import { AutoRefresh } from "@/components/AutoRefresh"
import { Badge } from "@/components/ui/badge"
import { formatFreezeTime } from "@/lib/leaderboardFreeze"
import type { SeriesView } from "@/lib/seriesRanking.server"

// Avalike üleriiklike vaadete päis: nimi, vaated ja värskendus.
export function SeriesPublicHeader({ view, preview, current }: { view: SeriesView; preview: boolean; current: "leaderboard" | "overview" | "analysis" }) {
  const base = `/public/series/${view.series.id}`
  const analysisOpen = preview || (view.series.analysisAccessMode === "PUBLIC" && !view.publicFreeze)
  const links = [
    { key: "leaderboard", href: base, label: "Pingerida" },
    { key: "overview", href: `${base}/overview`, label: "Ülevaade" },
    ...(analysisOpen ? [{ key: "analysis", href: `${base}/analysis`, label: "Analüüs" }] : []),
    { key: "screen", href: `${base}/screen`, label: "Ekraanirežiim" },
  ]
  const unfinished = view.publicFreeze ? [] : view.competitions.filter((competition) => competition.status !== "FINISHED")
  const updatedAt = view.generatedAt.toLocaleString("et-EE", { timeZone: "Europe/Tallinn", dateStyle: "medium", timeStyle: "short" })
  return (
    <div className="mb-6 space-y-3">
      {preview && (
        <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Eelvaade: arvestus ei ole avaldatud. Seda näeb ainult administraator.
        </p>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">{view.series.name}</h1>
          <p className="mt-1 text-sm text-gray-500">
            Üleriiklik arvestus · {view.ranking.competitions.length} osavõistlust · arvesse läheb {view.ranking.countedKpCount ?? "–"} parimat KP-d
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end">
          <Badge tone={view.ranking.scoringMode === "PENALTY" ? "warning" : "info"}>{view.ranking.scoringMode === "PENALTY" ? "Karistuspunktid" : "Plusspunktid"}</Badge>
          <nav aria-label="Üleriikliku arvestuse vaated" className="flex flex-wrap gap-3 text-sm">
            {links.map((link) => (
              <Link key={link.key} href={link.href} aria-current={link.key === current ? "page" : undefined}
                className={link.key === current ? "font-semibold text-gray-900" : "text-blue-600 hover:underline"}>
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
      <p className="flex items-center gap-2 text-xs text-gray-400">
        <span>{view.publicFreeze ? `Seis: ${formatFreezeTime(view.publicFreeze.freezeAt)}` : `Uuendatud: ${updatedAt}`}</span>
        <span>·</span>
        <AutoRefresh intervalSeconds={30} />
      </p>
      {unfinished.length > 0 && (
        <p className="rounded-xl border bg-white px-4 py-3 text-sm text-gray-600">
          Esialgne arvestus: {unfinished.map((competition) => competition.name).join(", ")} pole veel lõppenud.
        </p>
      )}
    </div>
  )
}
