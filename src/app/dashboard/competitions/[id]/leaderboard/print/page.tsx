import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { naturalCompare } from "@/lib/utils"
import { notFound } from "next/navigation"
import Link from "next/link"
import { PrintButton } from "@/components/PrintButton"

export default async function LeaderboardPrintPage({ params }: { params: Promise<{ id: string }> }) {
  await auth()
  const { id } = await params

  const competition = await prisma.competition.findUnique({ where: { id } })
  if (!competition) notFound()

  const scoringMode = competition.scoringMode as "PENALTY" | "PLUS"
  const isPlusMode = scoringMode === "PLUS"

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
    const total = Math.round((isPlusMode ? kpTotal - manualTotal : kpTotal + manualTotal) * 1000) / 1000
    const byElement = Object.fromEntries(teamScores.map((s) => [s.elementId, s.penaltyPoints]))
    return { team, total, manualTotal, byElement }
  })

  const inComp = allRows.filter((r) => !r.team.isHorsDeCompetition)
    .sort((a, b) => isPlusMode ? b.total - a.total : a.total - b.total)
  const horsComp = allRows.filter((r) => r.team.isHorsDeCompetition)
    .sort((a, b) => isPlusMode ? b.total - a.total : a.total - b.total)

  const classRank: Record<string, number> = {}
  const ranked = inComp.map((r, i) => {
    const cls = r.team.class ?? "–"
    classRank[cls] = (classRank[cls] ?? 0) + 1
    return { ...r, rank: i + 1, classRank: classRank[cls], cls }
  })

  const dateStr = competition.date ? competition.date.toLocaleDateString("et-EE") : ""
  const endDateStr = competition.endDate && competition.endDate.toDateString() !== competition.date?.toDateString()
    ? ` – ${competition.endDate.toLocaleDateString("et-EE")}` : ""

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; font-size: 11px; }
          .print-page { padding: 10mm; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #666; padding: 3px 6px; }
          th { background: #e5e7eb; font-weight: 600; }
        }
        @page { size: A4 landscape; margin: 0; }
        table { border-collapse: collapse; }
        th, td { border: 1px solid #999; padding: 4px 8px; font-size: 12px; }
        th { background: #f3f4f6; font-weight: 600; }
      `}</style>

      <div className="print-page p-6">
        <div className="no-print flex items-center gap-3 mb-6 p-3 bg-gray-50 rounded-lg border">
          <Link href={`/dashboard/competitions/${id}/leaderboard`} className="text-sm text-gray-500 hover:text-gray-700">← Tagasi</Link>
          <span className="text-gray-300">|</span>
          <PrintButton label="Prindi / Salvesta PDF" />
        </div>

        <div className="flex justify-between items-end mb-4">
          <div>
            <h1 className="text-xl font-bold">{competition.name} — Lõpuprotokoll</h1>
            <p className="text-sm text-gray-600">{dateStr}{endDateStr}{competition.location && ` · ${competition.location}`}</p>
          </div>
          <p className="text-xs text-gray-400">{isPlusMode ? "Plusspunktid" : "Karistuspunktid"} · {ranked.length} võistkonda</p>
        </div>

        <table className="w-full mb-6">
          <thead>
            <tr>
              <th style={{ width: 35 }}>Üld</th>
              <th style={{ width: 40 }}>Klass</th>
              <th style={{ width: 55 }}>Tähis</th>
              <th style={{ minWidth: 140, textAlign: "left" }}>Võistkond</th>
              <th style={{ width: 55 }}>Klass</th>
              {elements.map((el) => (
                <th key={el.id} style={{ minWidth: 55 }}>{el.code}</th>
              ))}
              <th style={{ width: 60 }}>Lisaär.</th>
              <th style={{ minWidth: 65, textAlign: "right" }}>KOKKU</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((row, i) => (
              <tr key={row.team.id} style={{ background: i % 2 === 0 ? "#fff" : "#f9fafb" }}>
                <td style={{ textAlign: "center", fontWeight: 700 }}>{row.rank}</td>
                <td style={{ textAlign: "center", color: "#6b7280", fontSize: 10 }}>{row.classRank}</td>
                <td style={{ textAlign: "center", fontFamily: "monospace", fontWeight: 600 }}>{row.team.code}</td>
                <td>{row.team.name}</td>
                <td style={{ textAlign: "center", fontSize: 10 }}>{row.cls}</td>
                {elements.map((el) => (
                  <td key={el.id} style={{ textAlign: "right", fontFamily: "monospace", fontSize: 11 }}>
                    {row.byElement[el.id] !== undefined ? row.byElement[el.id].toFixed(1) : "–"}
                  </td>
                ))}
                <td style={{ textAlign: "right", fontFamily: "monospace", fontSize: 11, color: "#c2410c" }}>
                  {row.manualTotal > 0 ? (isPlusMode ? `-${row.manualTotal.toFixed(1)}` : `+${row.manualTotal.toFixed(1)}`) : "–"}
                </td>
                <td style={{ textAlign: "right", fontWeight: 700, fontFamily: "monospace" }}>
                  {row.total.toFixed(2)}
                </td>
              </tr>
            ))}
            {horsComp.length > 0 && (
              <>
                <tr>
                  <td colSpan={5 + elements.length + 2}
                    style={{ background: "#fef3c7", fontWeight: 600, fontSize: 10, padding: "3px 6px" }}>
                    Arvestusvälised
                  </td>
                </tr>
                {horsComp.map((row, i) => (
                  <tr key={row.team.id} style={{ background: i % 2 === 0 ? "#fffbeb" : "#fef9e7" }}>
                    <td style={{ textAlign: "center", color: "#b45309", fontSize: 10 }}>AV</td>
                    <td style={{ textAlign: "center", color: "#6b7280", fontSize: 10 }}>–</td>
                    <td style={{ textAlign: "center", fontFamily: "monospace", color: "#b45309" }}>{row.team.code}</td>
                    <td style={{ color: "#92400e" }}>{row.team.name}</td>
                    <td style={{ textAlign: "center", fontSize: 10 }}>{row.team.class ?? "–"}</td>
                    {elements.map((el) => (
                      <td key={el.id} style={{ textAlign: "right", fontFamily: "monospace", fontSize: 11 }}>
                        {row.byElement[el.id] !== undefined ? row.byElement[el.id].toFixed(1) : "–"}
                      </td>
                    ))}
                    <td style={{ textAlign: "right", fontFamily: "monospace", fontSize: 11, color: "#c2410c" }}>
                      {row.manualTotal > 0 ? (isPlusMode ? `-${row.manualTotal.toFixed(1)}` : `+${row.manualTotal.toFixed(1)}`) : "–"}
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 700, fontFamily: "monospace", color: "#92400e" }}>
                      {row.total.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </>
            )}
          </tbody>
        </table>

        <div className="flex justify-between text-xs text-gray-400 mt-4">
          <span>Genereeritud: {new Date().toLocaleString("et-EE")}</span>
          <span>Tulemuste haldus</span>
        </div>
      </div>
    </>
  )
}
