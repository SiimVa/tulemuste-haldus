import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { naturalCompare } from "@/lib/utils"
import * as XLSX from "xlsx"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: competitionId } = await params

  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    include: {
      elements: { orderBy: { order: "asc" }, select: { id: true, name: true, code: true, order: true } },
      teams: { select: { id: true, name: true, code: true } },
      accessTokens: {
        include: {
          element: { select: { id: true, name: true, code: true, order: true } },
          team: { select: { id: true, name: true, code: true } },
        },
      },
    },
  })
  if (!competition) return NextResponse.json({ error: "Ei leitud" }, { status: 404 })

  const origin = req.headers.get("origin") ?? req.headers.get("referer")?.replace(/\/[^/]*$/, "") ?? ""
  const baseUrl = origin.replace(/\/$/, "")

  const elementOrderMap = new Map(competition.elements.map((el, i) => [el.id, i]))
  const teamOrderMap = new Map(
    [...competition.teams]
      .sort((a, b) => naturalCompare(a.code, b.code))
      .map((t, i) => [t.id, i])
  )

  const sorted = [...competition.accessTokens].sort((a, b) => {
    if (a.type !== b.type) return a.type === "JUDGE" ? -1 : 1
    if (a.type === "JUDGE") {
      const aO = a.elementId ? (elementOrderMap.get(a.elementId) ?? 9999) : -1
      const bO = b.elementId ? (elementOrderMap.get(b.elementId) ?? 9999) : -1
      return aO - bO
    }
    const aO = a.teamId ? (teamOrderMap.get(a.teamId) ?? 9999) : 9999
    const bO = b.teamId ? (teamOrderMap.get(b.teamId) ?? 9999) : 9999
    return aO - bO
  })

  const rows = sorted.map(t => {
    const path = t.type === "JUDGE" ? `/judge/${t.token}` : `/athlete/${t.token}`
    const link = `${baseUrl}${path}`
    const subject = t.type === "JUDGE"
      ? (t.element ? `[${t.element.code}] ${t.element.name}` : "Kõik KP-d")
      : (t.team ? `${t.team.code} · ${t.team.name}` : "")
    return [
      t.type === "JUDGE" ? "Kohtunik" : "Võistleja",
      t.name,
      subject,
      link,
    ]
  })

  const wsData = [
    [`${competition.name} — Juurdepääsulingid`],
    [],
    ["Tüüp", "Nimi", "KP / Võistkond", "Link"],
    ...rows,
  ]

  const ws = XLSX.utils.aoa_to_sheet(wsData)
  ws["!cols"] = [{ wch: 12 }, { wch: 28 }, { wch: 30 }, { wch: 60 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Lingid")

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })
  const filename = `${competition.name}_lingid.xlsx`

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  })
}
