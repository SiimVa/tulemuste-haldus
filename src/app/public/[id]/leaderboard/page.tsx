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
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{competition.name}</h1>
              <p className="text-gray-500 text-sm mt-1">
                Pingerida · {inCompRows.length} võistkonda
                {horsCompRows.length > 0 && ` + ${horsCompRows.length} arvestusvälised`}
              </p>
            </div>
            <div className="flex flex-row sm:flex-col items-start sm:items-end gap-2 sm:gap-1">
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

        {/* Mobiilivaade: kompaktsed kaardid (koht + võistkond + kokku) */}
        <div className="md:hidden space-y-2">
          {inCompRows.map((row) => (
            <div key={row.team.id} className="bg-white border rounded-xl shadow-sm px-3 py-2.5 flex items-center gap-3">
              <span className="text-lg font-bold text-gray-900 w-7 text-center shrink-0">{row.rank}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-xs text-gray-400">{row.team.code}</span>
                  <span className="font-medium text-gray-900 truncate">{row.team.name}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{row.class} · {row.classRank}.</span>
                  {row.manualTotal > 0 && (
                    <span className="text-xs font-mono text-orange-600">
                      Lisaär. {isPlusMode ? "-" : "+"}{row.manualTotal.toFixed(1)}
                    </span>
                  )}
                </div>
              </div>
              <span className="font-bold text-gray-900 font-mono text-base shrink-0">{row.total.toFixed(2)}</span>
            </div>
          ))}
          {horsCompRows.length > 0 && (
            <>
              <p className="px-1 pt-2 text-xs font-semibold text-amber-700 tracking-wide uppercase">Arvestusvälised</p>
              {horsCompRows.map((row) => (
                <div key={row.team.id} className="bg-amber-50/60 border rounded-xl shadow-sm px-3 py-2.5 flex items-center gap-3">
                  <span className="text-xs text-amber-600 font-medium w-7 text-center shrink-0">AV</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs text-gray-400">{row.team.code}</span>
                      <span className="font-medium text-amber-700 truncate">{row.team.name}</span>
                    </div>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full mt-0.5 inline-block">{row.class}</span>
                  </div>
                  <span className="font-bold text-amber-700 font-mono text-base shrink-0">{row.total.toFixed(2)}</span>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Arvutivaade: täielik tabel kõigi elemendi-veergudega */}
        <div className="hidden md:block bg-white border rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left border-b">
                  <th className="sticky left-0 z-20 bg-gray-50 w-12 px-2 py-3 text-xs font-medium text-gray-500 text-center">Üld</th>
                  <th className="sticky left-12 z-20 bg-gray-50 w-12 px-2 py-3 text-xs font-medium text-gray-500 text-center">Klass</th>
                  <th className="sticky left-24 z-20 bg-gray-50 border-r px-4 py-3 text-xs font-medium text-gray-500 min-w-[160px]">Võistkond</th>
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
                  <th className="sticky right-0 z-20 bg-gray-50 border-l px-4 py-3 text-xs font-semibold text-gray-700 text-right">KOKKU</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {inCompRows.map((row) => (
                  <tr key={row.team.id} className="hover:bg-gray-50">
                    <td className="sticky left-0 z-10 bg-white w-12 px-2 py-3 font-bold text-gray-900 text-center">{row.rank}</td>
                    <td className="sticky left-12 z-10 bg-white w-12 px-2 py-3 text-gray-400 text-xs text-center">{row.classRank}</td>
                    <td className="sticky left-24 z-10 bg-white border-r px-4 py-3 min-w-[160px]">
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
                    <td className="sticky right-0 z-10 bg-white border-l px-4 py-3 text-right">
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
                        <td className="sticky left-0 z-10 bg-amber-50 w-12 px-2 py-3 text-xs text-amber-600 font-medium text-center">AV</td>
                        <td className="sticky left-12 z-10 bg-amber-50 w-12 px-2 py-3 text-gray-400 text-xs text-center">–</td>
                        <td className="sticky left-24 z-10 bg-amber-50 border-r px-4 py-3 min-w-[160px]">
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
                        <td className="sticky right-0 z-10 bg-amber-50 border-l px-4 py-3 text-right">
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
