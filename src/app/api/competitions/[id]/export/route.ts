import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { naturalCompare } from "@/lib/utils"
import * as XLSX from "xlsx"

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const { searchParams } = new URL(req.url)
  const format = searchParams.get("format") ?? "csv"

  const competition = await prisma.competition.findUnique({ where: { id } })
  if (!competition) return NextResponse.json({ error: "Ei leitud" }, { status: 404 })

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
    const cls = r.team.class ?? ""
    classRank[cls] = (classRank[cls] ?? 0) + 1
    return { ...r, rank: i + 1, classRank: classRank[cls], hc: false }
  })
  const hcRows = horsComp.map((r) => ({ ...r, rank: null, classRank: null, hc: true }))
  const baseName = competition.name.replace(/[^a-zA-Z0-9äöüõÄÖÜÕ_-]/g, "_")

  if (format === "xlsx") {
    const headers = ["Üldkoht", "Klassist", "Tähis", "Võistkond", "Klass",
      ...elements.map((el) => el.code), "Lisaärid", "Kokku", "AV"]

    const toRow = (r: typeof ranked[0] | typeof hcRows[0]) => [
      r.rank ?? "AV",
      r.classRank ?? "",
      r.team.code,
      r.team.name,
      r.team.class ?? "",
      ...elements.map((el) => r.byElement[el.id] ?? ""),
      r.manualTotal > 0 ? r.manualTotal : "",
      r.total,
      r.hc ? "AV" : "",
    ]

    const wsData = [
      [competition.name],
      [],
      headers,
      ...ranked.map(toRow),
      ...(hcRows.length > 0 ? [["Arvestusvälised"], ...hcRows.map(toRow)] : []),
    ]

    const ws = XLSX.utils.aoa_to_sheet(wsData)

    // Bold header row (row index 2, 0-indexed)
    ws["!cols"] = [
      { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 24 }, { wch: 10 },
      ...elements.map(() => ({ wch: 10 })),
      { wch: 8 }, { wch: 10 }, { wch: 5 },
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Lõpuprotokoll")

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${baseName}_lopuprotokoll.xlsx`)}`,
      },
    })
  }

  // CSV (vaikimisi)
  const headers = ["Üldkoht", "Klassist", "Tähis", "Võistkond", "Klass",
    ...elements.map((el) => el.code), "Lisaärid", "Kokku", "AV"]

  const toCsv = (r: typeof ranked[0] | typeof hcRows[0]) =>
    [r.rank ?? "", r.classRank ?? "", r.team.code, r.team.name, r.team.class ?? "",
      ...elements.map((el) => { const v = r.byElement[el.id]; return v !== undefined ? v.toFixed(2) : "" }),
      r.manualTotal > 0 ? r.manualTotal.toFixed(2) : "", r.total.toFixed(2), r.hc ? "AV" : ""]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")

  const lines = [`"${competition.name}"`, "", headers.map((h) => `"${h}"`).join(","),
    ...ranked.map(toCsv),
    ...(hcRows.length > 0 ? ["", '"Arvestusvälised"', ...hcRows.map(toCsv)] : []),
  ]

  return new NextResponse(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${baseName}_tulemused.csv`)}`,
    },
  })
}
