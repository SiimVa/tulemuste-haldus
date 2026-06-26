import { prisma } from "@/lib/prisma"
import { notFound } from "next/navigation"
import { naturalCompare } from "@/lib/utils"
import Link from "next/link"
import { headers } from "next/headers"
import { CopyButton } from "@/components/CopyButton"
import { ExportMenu } from "@/components/ExportMenu"
import { MiscScoreCell } from "@/components/competition/MiscScoreCell"

export const dynamic = "force-dynamic"

export default async function LeaderboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const competition = await prisma.competition.findUnique({ where: { id } })
  if (!competition) notFound()

  const scoringMode = competition.scoringMode as "PENALTY" | "PLUS"

  const headersList = await headers()
  const host = headersList.get("host") ?? "localhost:3000"
  const proto = host.startsWith("localhost") ? "http" : "https"
  const baseUrl = `${proto}://${host}`
  const publicLeaderboardUrl = `${baseUrl}/public/${id}/leaderboard`
  const publicAnalysisUrl = `${baseUrl}/public/${id}/analysis`
  const publicDashboardUrl = `${baseUrl}/public/${id}/dashboard`

  const [teams, scores, penalties, elements, miscEntries] = await Promise.all([
    prisma.team.findMany({ where: { competitionId: id } }).then(t => t.sort((a, b) => naturalCompare(a.code, b.code))),
    prisma.computedScore.findMany({ where: { element: { competitionId: id } } }),
    prisma.manualPenalty.findMany({ where: { competitionId: id } }),
    prisma.scoringElement.findMany({ where: { competitionId: id }, orderBy: { order: "asc" } }),
    prisma.miscEntry.findMany({ where: { element: { competitionId: id, type: { in: ["OTHER", "ABANDONMENT"] } } }, select: { elementId: true, teamId: true, points: true, description: true, element: { select: { type: true } } } }),
  ])

  // Muu/Katkestamise kirjete selgitused (element + tiim) → popover pingereas
  const miscMap = new Map<string, { description: string; points: number }[]>()
  // Tiimid, kus vähemalt üks ÜKSIK liige katkestas (mitte kogu võistkond)
  const memberAbandonTeamIds = new Set<string>()
  for (const m of miscEntries) {
    const key = `${m.elementId}:${m.teamId}`
    const arr = miscMap.get(key) ?? []
    arr.push({ description: m.description, points: m.points })
    miscMap.set(key, arr)
    if (m.element.type === "ABANDONMENT" && m.description !== "Kogu võistkond") {
      memberAbandonTeamIds.add(m.teamId)
    }
  }

  const allRows = teams.map((team) => {
    const teamScores = scores.filter((s) => s.teamId === team.id)
    const teamPenalties = penalties.filter((p) => p.teamId === team.id)
    const kpTotal = teamScores.reduce((sum, s) => sum + s.penaltyPoints, 0)
    const manualTotal = teamPenalties.reduce((sum, p) => sum + p.points, 0)
    const total = scoringMode === "PLUS" ? kpTotal - manualTotal : kpTotal + manualTotal
    const byElement = Object.fromEntries(teamScores.map((s) => [s.elementId, s.penaltyPoints]))
    return { team, total: Math.round(total * 1000) / 1000, kpTotal, manualTotal, byElement }
  })

  const dnfRows = allRows
    .filter((r) => r.team.dnfFromElementOrder != null)
    .sort((a, b) => a.team.name.localeCompare(b.team.name))

  const isHC = (t: { isHorsDeCompetition: boolean; hcFromElementOrder?: number | null }) =>
    t.isHorsDeCompetition || t.hcFromElementOrder != null

  const inComp = allRows
    .filter((r) => !isHC(r.team) && r.team.dnfFromElementOrder == null)
    .sort((a, b) => (scoringMode === "PLUS" ? b.total - a.total : a.total - b.total))

  const horsComp = allRows
    .filter((r) => isHC(r.team) && r.team.dnfFromElementOrder == null)
    .sort((a, b) => (scoringMode === "PLUS" ? b.total - a.total : a.total - b.total))

  const classRank: Record<string, number> = {}
  const inCompRows = inComp.map((entry, idx) => {
    const cls = entry.team.class ?? "–"
    classRank[cls] = (classRank[cls] ?? 0) + 1
    return { ...entry, rank: idx + 1, classRank: classRank[cls], class: cls }
  })

  const horsCompRows = horsComp.map((entry) => {
    const cls = entry.team.class ?? "–"
    return { ...entry, rank: null, classRank: null, class: cls }
  })

  const isPlusMode = scoringMode === "PLUS"

  const ScoreRow = ({
    row,
    isHC = false,
    isDnf = false,
  }: {
    row: typeof inCompRows[0] | typeof horsCompRows[0]
    isHC?: boolean
    isDnf?: boolean
  }) => {
    const stickyBg = isDnf ? "bg-red-50" : isHC ? "bg-amber-50" : "bg-white"
    return (
    <tr className={`hover:bg-gray-50 ${isDnf ? "bg-red-50/50" : isHC ? "bg-amber-50/50" : ""}`}>
      <td className={`sticky left-0 z-10 ${stickyBg} w-12 px-2 py-3 font-bold text-gray-900 text-center`}>
        {isDnf ? <span className="text-red-600 font-medium text-xs">KAT</span> : row.rank ?? <span className="text-amber-600 font-medium text-xs">AV</span>}
      </td>
      <td className={`sticky left-12 z-10 ${stickyBg} w-12 px-2 py-3 text-gray-400 text-xs text-center`}>{row.classRank ?? "–"}</td>
      <td className={`sticky left-24 z-10 ${stickyBg} border-r px-4 py-3 min-w-40`}>
        <span className="font-mono text-xs text-gray-400 mr-1">{row.team.code}</span>
        <span className={`font-medium ${isDnf ? "text-red-700" : isHC ? "text-amber-700" : "text-gray-900"}`}>{row.team.name}</span>
        {isDnf && row.team.dnfReason && (
          <span className="ml-2 text-xs text-red-400">{row.team.dnfReason}</span>
        )}
        {row.team.dqFromElementOrder != null && (
          <span className="ml-1.5 text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium"
            title={`Diskvalifitseeritud alates: ${elements.find(e => e.order === row.team.dqFromElementOrder)?.code ?? row.team.dqFromElementOrder}`}>DQ</span>
        )}
        {row.team.dnsFlag && (
          <span className="ml-1.5 text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded font-medium">DNS</span>
        )}
        {memberAbandonTeamIds.has(row.team.id) && (
          <span className="ml-1.5 text-xs bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded font-medium" title="Üks või mitu liiget katkestas">👤 katk.</span>
        )}
      </td>
      <td className="px-4 py-3">
        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{row.class}</span>
      </td>
      {elements.map((el) => {
        const cellValue = row.byElement[el.id] !== undefined ? row.byElement[el.id].toFixed(1) : "–"
        const entries = (el.type === "OTHER" || el.type === "ABANDONMENT") ? (miscMap.get(`${el.id}:${row.team.id}`) ?? []) : []
        if (entries.length > 0) {
          return (
            <MiscScoreCell key={el.id} value={cellValue} entries={entries}
              className="px-3 py-3 text-right font-mono text-xs text-gray-600" />
          )
        }
        return (
          <td key={el.id} className="px-3 py-3 text-right font-mono text-xs text-gray-600">
            {cellValue}
          </td>
        )
      })}
      <td className="px-4 py-3 text-right font-mono text-xs text-orange-600">
        {row.manualTotal > 0
          ? isPlusMode ? `-${row.manualTotal.toFixed(1)}` : `+${row.manualTotal.toFixed(1)}`
          : "–"}
      </td>
      <td className={`sticky right-0 z-10 ${stickyBg} border-l px-4 py-3 text-right`}>
        <span className={`font-bold font-mono ${isDnf ? "text-red-700" : isHC ? "text-amber-700" : "text-gray-900"}`}>
          {isDnf ? "KAT" : row.total.toFixed(2)}
        </span>
      </td>
    </tr>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 text-sm text-gray-400">
        <Link href={`/dashboard/competitions/${id}`}>← Tagasi</Link>
      </div>
      {/* Share box */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-5 flex flex-col gap-2">
        <p className="text-xs font-semibold text-blue-700">Jaga avalikult</p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-blue-800 font-medium w-20 shrink-0">Pingerida</span>
          <span className="flex-1 text-xs font-mono text-gray-600 bg-white border rounded px-2 py-1 truncate">{publicLeaderboardUrl}</span>
          <CopyButton text={publicLeaderboardUrl} />
          <a href={publicLeaderboardUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline shrink-0">Ava</a>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-blue-800 font-medium w-20 shrink-0">Analüüs</span>
          <span className="flex-1 text-xs font-mono text-gray-600 bg-white border rounded px-2 py-1 truncate">{publicAnalysisUrl}</span>
          <CopyButton text={publicAnalysisUrl} />
          <a href={publicAnalysisUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline shrink-0">Ava</a>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-blue-800 font-medium w-20 shrink-0">Ülevaade</span>
          <span className="flex-1 text-xs font-mono text-gray-600 bg-white border rounded px-2 py-1 truncate">{publicDashboardUrl}</span>
          <CopyButton text={publicDashboardUrl} />
          <a href={publicDashboardUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline shrink-0">Ava</a>
        </div>
      </div>

      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-gray-900">{competition.name}</h1>
        <div className="flex items-center gap-2">
          <ExportMenu groups={[{
            title: "Lõpuprotokoll",
            options: [
              { label: "Excel (.xlsx)", href: `/api/competitions/${id}/export?format=xlsx` },
              { label: "CSV", href: `/api/competitions/${id}/export?format=csv` },
              { label: "PDF (printimine)", printHref: `/dashboard/competitions/${id}/leaderboard/print` },
            ],
          }]} />
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${isPlusMode ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"}`}>
            {isPlusMode ? "Plusspunktid" : "Karistuspunktid"}
          </span>
        </div>
      </div>
      <p className="text-gray-500 text-sm mb-6">
        Pingerida · {inCompRows.length} võistkonda
        {horsCompRows.length > 0 && ` + ${horsCompRows.length} arvestusvälised`}
      </p>

      <div className="bg-white border rounded-xl overflow-hidden">
        <div className="overflow-auto max-h-[75vh]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="sticky left-0 top-0 z-30 bg-gray-50 w-12 px-2 py-3 text-xs font-medium text-gray-500 text-center">Üld</th>
                <th className="sticky left-12 top-0 z-30 bg-gray-50 w-12 px-2 py-3 text-xs font-medium text-gray-500 text-center">Klass</th>
                <th className="sticky left-24 top-0 z-30 bg-gray-50 border-r px-4 py-3 text-xs font-medium text-gray-500 min-w-40">Võistkond</th>
                <th className="sticky top-0 z-20 bg-gray-50 px-4 py-3 text-xs font-medium text-gray-500">Klass</th>
                {elements.map((el) => (
                  <th key={el.id} className="sticky top-0 z-20 bg-gray-50 px-3 py-3 text-xs font-medium text-right">
                    {el.isCancelled ? (
                      <span className="line-through text-gray-300" title="Tühistatud">{el.code}</span>
                    ) : (
                      <span className="text-gray-400">{el.code}</span>
                    )}
                  </th>
                ))}
                <th className="sticky top-0 z-20 bg-gray-50 px-4 py-3 text-xs font-medium text-gray-500 text-right">Lisaär.</th>
                <th className="sticky right-0 top-0 z-30 bg-gray-50 border-l px-4 py-3 text-xs font-semibold text-gray-700 text-right">KOKKU</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {inCompRows.map((row) => (
                <ScoreRow key={row.team.id} row={row} />
              ))}
              {horsCompRows.length > 0 && (
                <>
                  <tr>
                    <td colSpan={6 + elements.length} className="px-4 py-2 bg-amber-50 text-xs font-semibold text-amber-700 tracking-wide uppercase">
                      Arvestusvälised
                    </td>
                  </tr>
                  {horsCompRows.map((row) => (
                    <ScoreRow key={row.team.id} row={row} isHC />
                  ))}
                </>
              )}
              {dnfRows.length > 0 && (
                <>
                  <tr>
                    <td colSpan={6 + elements.length} className="px-4 py-2 bg-red-50 text-xs font-semibold text-red-700 tracking-wide uppercase">
                      Katkestanud
                    </td>
                  </tr>
                  {dnfRows.map((row) => (
                    <ScoreRow key={row.team.id} row={{ ...row, rank: null, classRank: null, class: row.team.class ?? "–" }} isDnf />
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
