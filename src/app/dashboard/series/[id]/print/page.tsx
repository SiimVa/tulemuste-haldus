import { notFound, redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { RankBadge } from "@/components/leaderboard/LeaderboardDetails"
import { LeaderboardClassFilter } from "@/components/leaderboard/LeaderboardClassFilter"
import { PrintButton } from "@/components/PrintButton"
import { leaderboardClassFilter } from "@/lib/leaderboard"
import { loadSeriesView } from "@/lib/seriesRanking.server"

export const dynamic = "force-dynamic"

// Prinditav üleriiklik pingerida (valitud klassid).
export default async function SeriesPrintPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ class?: string | string[] }> }) {
  const session = await auth()
  if (!session?.user) redirect("/login")
  if (session.user.role !== "ADMIN") redirect("/dashboard")
  const [{ id }, query] = await Promise.all([params, searchParams])
  const view = await loadSeriesView(id, "internal")
  if (!view) notFound()
  const { ranking } = view
  const matchesClass = leaderboardClassFilter(query.class, ranking.classes)
  const rows = ranking.rows.filter((row) => matchesClass(row.team))
  const generated = view.generatedAt.toLocaleString("et-EE", { timeZone: "Europe/Tallinn", dateStyle: "medium", timeStyle: "short" })
  return (
    <div className="space-y-4">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { font-size: 11px; }
          [title="Kuld"], [title="Hõbe"], [title="Pronks"] { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        }
        @page { size: A4 portrait; margin: 10mm; }
      `}</style>
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <LeaderboardClassFilter classes={ranking.classes} />
        <PrintButton label="Prindi pingerida" />
      </div>
      <div>
        <h2 className="text-xl font-bold text-gray-900">{view.series.name} — üleriiklik pingerida</h2>
        <p className="text-sm text-gray-500">Arvestatav KP-de arv {ranking.countedKpCount ?? "–"} · {generated}</p>
      </div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-gray-800 text-left">
            <th className="px-2 py-1.5">Üld</th><th className="px-2 py-1.5">Klass</th><th className="px-2 py-1.5">Võistkond</th>
            <th className="px-2 py-1.5">Osavõistlus</th><th className="px-2 py-1.5 text-right">Läbitud KP</th><th className="px-2 py-1.5 text-right">KP</th>
            <th className="px-2 py-1.5 text-right">Karistused</th><th className="px-2 py-1.5 text-right">Kokku</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.team.id} className="border-b border-gray-200">
              <td className="px-2 py-1.5 font-bold"><RankBadge rank={row.rank} /></td>
              <td className="px-2 py-1.5">{row.team.class ? <>{row.team.class} <RankBadge rank={row.classRank} /></> : "–"}</td>
              <td className="px-2 py-1.5">{row.team.name}</td>
              <td className="px-2 py-1.5">{row.competitionName}</td>
              <td className="px-2 py-1.5 text-right">{row.passedCount}</td>
              <td className="px-2 py-1.5 text-right font-mono">{row.kpTotal.toFixed(2)}</td>
              <td className="px-2 py-1.5 text-right font-mono">{row.penaltyTotal === 0 ? "–" : row.penaltyTotal.toFixed(2)}</td>
              <td className="px-2 py-1.5 text-right font-mono font-bold">{row.total.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
