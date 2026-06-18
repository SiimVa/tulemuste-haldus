import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { naturalCompare } from "@/lib/utils"
import * as XLSX from "xlsx"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; elementId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: competitionId, elementId } = await params

  const element = await prisma.scoringElement.findUnique({
    where: { id: elementId },
    include: {
      fields: {
        where: { sectionId: null, formula: null },
        orderBy: { order: "asc" },
      },
      sections: {
        orderBy: { order: "asc" },
        include: {
          fields: {
            where: { formula: null },
            orderBy: { order: "asc" },
          },
        },
      },
      competition: { select: { name: true } },
    },
  })
  if (!element) return NextResponse.json({ error: "Ei leitud" }, { status: 404 })

  const teams = (await prisma.team.findMany({
    where: { competitionId },
  })).sort((a, b) => naturalCompare(a.code, b.code))

  const directInputFields = element.fields.filter((f) => f.type !== "COMPUTED")
  const sectionInputFields = (element.sections ?? []).flatMap((s) =>
    s.fields.filter((f) => f.type !== "COMPUTED")
  )
  const inputFields = [...directInputFields, ...sectionInputFields]

  // TIME_RANGE fields expand to two columns (algus + lõpp)
  const expandedFields = inputFields.flatMap((f) =>
    f.type === "TIME_RANGE"
      ? [{ label: `${f.label} (algus)`, key: f.name + "_start" }, { label: `${f.label} (lõpp)`, key: f.name + "_end" }]
      : [{ label: f.label, key: f.name }]
  )

  const titleRow = [`[${element.code}] ${element.name}`]
  const emptyRow: string[] = []
  const headerRow = [
    "Tähis",
    "Võistkond",
    "Klass",
    ...expandedFields.map((f) => f.label),
    "Erand",
  ]

  const teamRows = teams.map((t) => [
    t.code,
    t.name,
    t.class ?? "",
    ...expandedFields.map(() => ""),
    "",
  ])

  const wsData = [titleRow, emptyRow, headerRow, ...teamRows]

  const ws = XLSX.utils.aoa_to_sheet(wsData)
  ws["!cols"] = [
    { wch: 8 },
    { wch: 22 },
    { wch: 8 },
    ...expandedFields.map(() => ({ wch: 12 })),
    { wch: 18 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, element.code.slice(0, 31))

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })

  const filename = `${element.code}_mall.xlsx`
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  })
}
