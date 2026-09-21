import { calculateEstimation, parseEstimates, readEstimation } from "@/lib/estimation"
import { pointFieldLabel } from "@/lib/pointFields"
import { withSecurityRoute } from "@/lib/securityRoute.server"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { naturalCompare } from "@/lib/utils"
import { computeFields } from "@/lib/calculators"
import { canAccessCompetition, elementBelongsToCompetition } from "@/lib/competitionAccess"
import * as XLSX from "xlsx"

async function handleGET(req: Request, { params }: { params: Promise<{ id: string; elementId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: competitionId, elementId } = await params
  if (
    !await canAccessCompetition(competitionId, { id: session.user.id, role: session.user.role }) ||
    !await elementBelongsToCompetition(elementId, competitionId)
  ) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  }
  const { searchParams } = new URL(req.url)
  const format = searchParams.get("format") ?? "xlsx"

  const element = await prisma.scoringElement.findUnique({
    where: { id: elementId },
    include: {
      fields: { orderBy: { order: "asc" } },
      scores: true,
      results: { include: { team: true } },
      competition: { select: { name: true, scoringMode: true } },
    },
  })
  if (!element) return NextResponse.json({ error: "Ei leitud" }, { status: 404 })

  const teams = await prisma.team.findMany({ where: { competitionId } }).then(t => t.sort((a, b) => naturalCompare(a.code, b.code)))
  const isPlusMode = element.competition.scoringMode === "PLUS"
  const inputFields = element.fields.filter((f) => !f.formula)
  const scoreMap = new Map(element.scores.map((s) => [s.teamId, s.penaltyPoints]))

  const buildRow = (team: typeof teams[0], rowNum: number | string) => {
    const result = element.results.find((r) => r.teamId === team.id)
    let fieldValues: Record<string, unknown> = {}
    let rawValues: Record<string, unknown> = {}
    let exceptionLabel = ""
    if (result?.exceptionLabel) {
      exceptionLabel = result.exceptionLabel
    } else if (result) {
      try { fieldValues = JSON.parse(result.values || "{}") } catch {}
      rawValues = { ...fieldValues }
      fieldValues = computeFields(fieldValues as Record<string, string | number>, element.fields)
    }
    const score = scoreMap.get(team.id)
    return [
      rowNum,
      team.code,
      team.name,
      team.class ?? "",
      ...inputFields.flatMap((f) => {
        if (f.type === "ESTIMATION") {
          const config = readEstimation(f.meta)
          if (exceptionLabel) return config.targets.map(() => "").concat(["", "", ""])
          const guesses = parseEstimates(rawValues[f.name])
          const summary = calculateEstimation(config, rawValues[f.name])
          return [...config.targets.map(t => guesses[t.id] ?? ""), ...(summary.complete ? [summary.points, summary.error, summary.errorPercent] : ["", "", ""])]
        }
        return [exceptionLabel ? "" : f.type === "TIME_POINTS" ? rawValues[f.name] ?? "" : f.type === "POINTS_SELECT" ? pointFieldLabel(f, rawValues[f.name]) : fieldValues[f.name] ?? ""]
      }),
      exceptionLabel,
      score !== undefined ? score : "",
    ]
  }

  const inComp = teams.filter((t) => !t.isHorsDeCompetition)
  const horsComp = teams.filter((t) => t.isHorsDeCompetition)
  const headers = ["#", "Tähis", "Võistkond", "Klass",
    ...inputFields.flatMap(f => f.type === "ESTIMATION" ? [...readEstimation(f.meta).targets.map(t => `${f.label} (${t.label})`), `${f.label}: punkte`, `${f.label}: eksimus (${readEstimation(f.meta).unit})`, `${f.label}: protsendivigade summa (%)`] : [f.label]),
    "Erand", isPlusMode ? "Punktid" : "Karistus"]

  const baseName = element.competition.name.replace(/[^a-zA-Z0-9äöüõÄÖÜÕ_-]/g, "_")

  if (format === "csv") {
    const toCsvRow = (row: unknown[]) =>
      row.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")
    const lines = [
      `"${element.competition.name} — ${element.code} ${element.name}"`,
      "",
      toCsvRow(headers),
      ...inComp.map((t, i) => toCsvRow(buildRow(t, i + 1))),
      ...(horsComp.length > 0
        ? ['"Arvestusvälised"', ...horsComp.map((t) => toCsvRow(buildRow(t, "AV")))]
        : []),
    ]
    return new NextResponse(lines.join("\r\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${baseName}_${element.code}.csv`)}`,
      },
    })
  }

  // xlsx (vaikimisi)
  const wsData = [
    [`${element.competition.name} — ${element.code} ${element.name}`],
    [],
    headers,
    ...inComp.map((t, i) => buildRow(t, i + 1)),
    ...(horsComp.length > 0
      ? [["Arvestusvälised"], ...horsComp.map((t) => buildRow(t, "AV"))]
      : []),
  ]

  const ws = XLSX.utils.aoa_to_sheet(wsData)
  ws["!cols"] = [
    { wch: 5 }, { wch: 8 }, { wch: 22 }, { wch: 10 },
    ...inputFields.map(() => ({ wch: 12 })),
    { wch: 20 }, { wch: 10 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, element.code.slice(0, 31))

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${baseName}_${element.code}.xlsx`)}`,
    },
  })
}

export const GET = withSecurityRoute("/api/competitions/[id]/elements/[elementId]/export", handleGET)
