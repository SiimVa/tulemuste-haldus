import { NextResponse } from "next/server"
import * as XLSX from "xlsx"
import { auth } from "@/lib/auth"
import { canAccessCompetition } from "@/lib/competitionAccess"
import { withSecurityRoute } from "@/lib/securityRoute.server"
import { loadMapEditorData } from "@/lib/competitionMap.server"
import { ELEMENT_TYPE_SHORT_LABELS, MAP_TEMPLATE_HEADERS, MARKER_TYPE_LABEL } from "@/lib/mapTemplate"
import { prisma } from "@/lib/prisma"
import { TRACKED_ELEMENT_TYPES } from "@/lib/dashboard/types"

async function handleGET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  if (!await canAccessCompetition(id, { id: session.user.id, role: session.user.role })) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  }
  const [data, competition] = await Promise.all([
    loadMapEditorData(id),
    prisma.competition.findUnique({ where: { id }, select: { name: true } }),
  ])
  const rows = [
    [...MAP_TEMPLATE_HEADERS],
    ...data.elements.filter((element) => !element.isCancelled && TRACKED_ELEMENT_TYPES.includes(element.type)).map((element) => [
      element.code, element.name, ELEMENT_TYPE_SHORT_LABELS[element.type] ?? element.type, element.mgrs ?? "",
    ]),
    ...data.markers.map((marker) => ["", marker.label, MARKER_TYPE_LABEL, marker.mgrs ?? ""]),
  ]
  const sheet = XLSX.utils.aoa_to_sheet(rows)
  sheet["!cols"] = [{ wch: 10 }, { wch: 32 }, { wch: 8 }, { wch: 24 }]
  const help = XLSX.utils.aoa_to_sheet([
    ["Juhend"],
    ["Sisesta igale KP-le MGRS-koordinaat, nt 35VLF 70000 89000 (10 numbrit = 1 m täpsus, 8 numbrit = 10 m)."],
    ["Tühi MGRS-lahter jätab olemasoleva koordinaadi muutmata. Koordinaadi kustutamiseks kasuta kaardi lehte."],
    [`Starti, finiši või muu märgi lisamiseks lisa rida, mille tüüp on „${MARKER_TYPE_LABEL}” ja nimi märgi silt (nt Start KT).`],
    ["Tähist ja tüüpi ära muuda: KP-d tuvastatakse tähise järgi."],
  ])
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, "Asukohad")
  XLSX.utils.book_append_sheet(book, help, "Juhend")
  const buffer = XLSX.write(book, { type: "buffer", bookType: "xlsx" })
  const filename = `${(competition?.name ?? "voistlus").replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "voistlus"}_asukohad.xlsx`
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
    },
  })
}

export const GET = withSecurityRoute("/api/competitions/[id]/map/template", handleGET)
