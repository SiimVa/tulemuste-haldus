import { prisma } from "@/lib/prisma"
import { naturalCompare } from "@/lib/utils"
import { notFound } from "next/navigation"
import Link from "next/link"
import { AutoRefresh } from "@/components/AutoRefresh"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const comp = await prisma.competition.findUnique({ where: { id }, select: { name: true } })
  return { title: comp ? `${comp.name} – Pingerida` : "Pingerida" }
}

export default async function PublicLeaderboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const competition = await prisma.competition.findUnique({ where: { id } })
  if (!competition) notFound()

  const scoringMode = competition.scoringMode as "PENALTY" | "PLUS"

  const [teams, scores, penalties, elements] = await Promise.all([
    prisma.team.findMany({ where: { competitionId: id } }).then(t => t.sort((a, b) => naturalCompare(a.code, b.code))),
    prisma.computedScore.findMany({ where: { element: { competitionId: id } } }),
    prisma.manualPenalty.findMany({ where: { competitionId: id } }),
    prisma.scoringElement.findMany({ where: { competitionId: id }, orderBy: { order: "asc" } }),
  ])

  const allRows = teams.map((team) => {
    const teamScores = scores.filter((s) => s.teamId === team.id)
    const teamPenalties = penalties.filter((p) => p.teamId === team.id)
    const kpTotal = teamScores.reduce((sum, s) => sum + s.penaltyPoints, 0)
    const manualTotal = teamPenalties.reduce((sum, p) => sum + p.points, 0)
    const total = scoringMode === "PLUS" ? kpTotal - manualTotal : kpTotal + manualTotal
    const byElement = Object.fromEntries(teamScores.map((s) => [s.elementId, s.penaltyPoints]))
    return { team, total: Math.round(total * 1000) / 1000, kpTotal, manualTotal, byElement }
  })

  const inComp = allRows
    .filter((r) => !r.team.isHorsDeCompetition)
    .sort((a, b) => (scoringMode === "PLUS" ? b.total - a.total : a.total - b.total))

  const horsComp = allRows
    .filter((r) => r.team.isHorsDeCompetition)
    .sort((a, b) => (scoringMode === "PLUS" ? b.total - a.total : a.total - b.total))

  const classRank: Record<string, number> = {}
  const inCompRows = inComp.map((entry, idx) => {
    const cls = entry.team.class ?? "–"
    classRank[cls] = (classRank[cls] ?? 0) + 1
    return { ...entry, rank: idx + 1, classRank: classRank[cls], class: cls }
  })
  const horsCompRows = horsComp.map((entry) => ({
    ...entry, rank: null, classRank: null, class: entry.team.class ?? "–",
  }))

  const isPlusMode = scoringMode === "PLUS"
  const updatedAt = new Date().toLocaleString("et-EE", { timeZone: "Europe/Tallinn", dateStyle: "medium", timeStyle: "short" })

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{competition.name}</h1>
              <p className="text-gray-500 text-sm mt-1">
                Pingerida · {inCompRows.length} võistkonda
                {horsCompRows.length > 0 && ` + ${horsCompRows.length} arvestusvälised`}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${isPlusMode ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"}`}>
                {isPlusMode ? "Plusspunktid" : "Karistuspunktid"}
              </span>
              <Link href={`/public/${id}/analysis`} className="text-xs text-blue-600 hover:underline">
                VK analüüs →
              </Link>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-2 flex items-center gap-2">
            <span>Uuendatud: {updatedAt}</span>
            <span>·</span>
            <AutoRefresh intervalSeconds={30} />
          </p>
        </div>

        {/* Table */}
        <div className="bg-white border rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left border-b">
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 w-10">Üld</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 w-10">Klass</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500">Võistkond</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500">Klass</th>
                  {elements.map((el) => (
                    <th key={el.id} className="px-3 py-3 text-xs font-medium text-right">
                      {el.isCancelled ? (
                        <span className="line-through text-gray-300" title="Tühistatud">{el.code}</span>
                      ) : (
                        <span className="text-gray-400">{el.code}</span>
                      )}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 text-right">Lisaär.</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-700 text-right">KOKKU</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {inCompRows.map((row) => (
                  <tr key={row.team.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-bold text-gray-900">{row.rank}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{row.classRank}</td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-gray-400 mr-1">{row.team.code}</span>
                      <span className="font-medium text-gray-900">{row.team.name}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{row.class}</span>
                    </td>
                    {elements.map((el) => (
                      <td key={el.id} className="px-3 py-3 text-right font-mono text-xs text-gray-600">
                        {row.byElement[el.id] !== undefined ? row.byElement[el.id].toFixed(1) : "–"}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-right font-mono text-xs text-orange-600">
                      {row.manualTotal > 0 ? (isPlusMode ? `-${row.manualTotal.toFixed(1)}` : `+${row.manualTotal.toFixed(1)}`) : "–"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-bold text-gray-900 font-mono">{row.total.toFixed(2)}</span>
                    </td>
                  </tr>
                ))}
                {horsCompRows.length > 0 && (
                  <>
                    <tr>
                      <td colSpan={6 + elements.length} className="px-4 py-2 bg-amber-50 text-xs font-semibold text-amber-700 tracking-wide uppercase">
                        Arvestusvälised
                      </td>
                    </tr>
                    {horsCompRows.map((row) => (
                      <tr key={row.team.id} className="hover:bg-gray-50 bg-amber-50/40">
                        <td className="px-4 py-3 text-xs text-amber-600 font-medium">AV</td>
                        <td className="px-4 py-3 text-gray-400 text-xs">–</td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs text-gray-400 mr-1">{row.team.code}</span>
                          <span className="font-medium text-amber-700">{row.team.name}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{row.class}</span>
                        </td>
                        {elements.map((el) => (
                          <td key={el.id} className="px-3 py-3 text-right font-mono text-xs text-gray-600">
                            {row.byElement[el.id] !== undefined ? row.byElement[el.id].toFixed(1) : "–"}
                          </td>
                        ))}
                        <td className="px-4 py-3 text-right font-mono text-xs text-orange-600">
                          {row.manualTotal > 0 ? (isPlusMode ? `-${row.manualTotal.toFixed(1)}` : `+${row.manualTotal.toFixed(1)}`) : "–"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-bold text-amber-700 font-mono">{row.total.toFixed(2)}</span>
                        </td>
                      </tr>
                    ))}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <p className="text-center text-xs text-gray-400 mt-6">Tulemuste haldus · Andmed uuenevad lehe värskendamisel</p>
      </div>
    </div>
  )
}
