import { withSecurityRoute } from "@/lib/securityRoute.server"
import { setSecurityRecordCount } from "@/lib/security.server"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { loadSeriesView } from "@/lib/seriesRanking.server"
import * as XLSX from "xlsx"

const formatAverage = (value: number | null) => (value === null ? "" : value)

// Üleriikliku arvestuse eksport: pingerida, osavõistluste keskmised ja reeglite kontroll.
async function handleGET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  const { id } = await params
  const view = await loadSeriesView(id, "internal")
  if (!view?.rules) return NextResponse.json({ error: "Arvestust ei leitud" }, { status: 404 })
  const { series, competitions, ranking, rules } = view
  setSecurityRecordCount(ranking.rows.length)
  const plus = ranking.scoringMode !== "PENALTY"
  const competitionName = new Map(competitions.map((competition) => [competition.id, competition.name]))

  const rankingSheet = XLSX.utils.aoa_to_sheet([
    [series.name],
    [`Arvestatav KP-de arv: ${ranking.countedKpCount ?? "–"}`],
    [],
    ["Koht", "Klassi koht", "Klass", "Tähis", "Võistkond", "Osavõistlus", "Läbitud KP", "Arvestatud KP-d", plus ? "KP punktid" : "KP karistuspunktid", "Karistused", "Kokku"],
    ...ranking.rows.map((row) => [
      row.rank,
      row.classRank ?? "",
      row.team.class ?? "",
      row.team.code,
      row.team.name,
      row.competitionName,
      row.passedCount,
      row.kpScores.filter((score) => score.counted).map((score) => `${score.code} (${score.points})`).join(", "),
      row.kpTotal,
      row.penaltyTotal,
      row.total,
    ]),
  ])
  rankingSheet["!cols"] = [{ wch: 6 }, { wch: 10 }, { wch: 8 }, { wch: 10 }, { wch: 28 }, { wch: 22 }, { wch: 10 }, { wch: 60 }, { wch: 12 }, { wch: 11 }, { wch: 10 }]

  const competitionSheet = XLSX.utils.aoa_to_sheet([
    ["Osavõistlus", "Olek", "KP-sid", "Võistkondi arvestuses", "Neist tulemusega", "Läbitud KP-sid kokku", "Keskmine", "Ümardatud"],
    ...ranking.competitions.map((summary) => [
      summary.name,
      competitions.find((competition) => competition.id === summary.id)?.statusLabel ?? "",
      summary.kpCount,
      summary.teamCount,
      summary.startedTeamCount,
      summary.passedTotal,
      formatAverage(summary.average),
      formatAverage(summary.roundedAverage),
    ]),
    [],
    ["Arvestatav KP-de arv (väikseim ümardatud keskmine)", ranking.countedKpCount ?? ""],
  ])
  competitionSheet["!cols"] = [{ wch: 28 }, { wch: 14 }, { wch: 8 }, { wch: 20 }, { wch: 16 }, { wch: 18 }, { wch: 10 }, { wch: 10 }]

  const names = (ids: string[]) => ids.map((competitionId) => competitionName.get(competitionId) ?? competitionId).join(", ")
  const rulesSheet = XLSX.utils.aoa_to_sheet([
    ["Element", "Nimi", "Omadus", "Osavõistlused", "Väärtus"],
    ...(rules.scoringModes.length > 1 ? rules.scoringModes.map((variant) => ["", "", "Hindamissüsteem", names(variant.competitionIds), variant.value]) : []),
    ...rules.differences.flatMap((difference) => difference.variants.map((variant) => [difference.code, difference.name, difference.property, names(variant.competitionIds), variant.value])),
    ...rules.missing.map((item) => [item.code, item.name, "Puudub", names(item.missingIn), ""]),
    ...rules.ignored.map((item) => [item.code, item.name, "Arvestusse ei lähe", competitionName.get(item.competitionId) ?? "", item.type]),
  ])
  rulesSheet["!cols"] = [{ wch: 10 }, { wch: 28 }, { wch: 18 }, { wch: 40 }, { wch: 70 }]

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, rankingSheet, "Pingerida")
  XLSX.utils.book_append_sheet(workbook, competitionSheet, "Osavõistlused")
  XLSX.utils.book_append_sheet(workbook, rulesSheet, "Reeglite kontroll")
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })
  const fileName = `${series.name.replace(/[^a-zA-Z0-9äöüõÄÖÜÕ_-]/g, "_")}_uleriiklik.xlsx`
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  })
}

export const GET = withSecurityRoute("/api/series/[id]/export", handleGET)
