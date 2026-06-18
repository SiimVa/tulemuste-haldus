import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import * as XLSX from "xlsx"

async function checkAccess(competitionId: string, userId: string, role: string) {
  if (role === "ADMIN") return true
  const comp = await prisma.competition.findUnique({
    where: { id: competitionId },
    include: { members: { where: { userId }, select: { id: true } } },
  })
  return comp?.organizerId === userId || (comp?.members?.length ?? 0) > 0
}

type RowData = { code: string; name: string; class?: string; members?: string }

function parseRows(rawRows: Record<string, unknown>[]): RowData[] {
  return rawRows.map((r) => {
    // Support both English and Estonian column headers
    const code = String(r["code"] ?? r["Tähis"] ?? r["tähis"] ?? "").trim()
    const name = String(r["name"] ?? r["Võistkond"] ?? r["võistkond"] ?? "").trim()
    const cls = String(r["class"] ?? r["Klass"] ?? r["klass"] ?? "").trim()
    const members = String(r["members"] ?? r["Liikmed"] ?? r["liikmed"] ?? "").trim()
    return { code, name, class: cls || undefined, members: members || undefined }
  })
}

function parseCSVText(text: string): RowData[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length < 2) return []

  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, "").toLowerCase())
  const codeIdx = headers.findIndex((h) => h === "code" || h === "tähis")
  const nameIdx = headers.findIndex((h) => h === "name" || h === "võistkond")
  const classIdx = headers.findIndex((h) => h === "class" || h === "klass")
  const membersIdx = headers.findIndex((h) => h === "members" || h === "liikmed")

  if (nameIdx === -1 || codeIdx === -1) return []

  return lines.slice(1).map((line) => {
    const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""))
    return {
      code: cols[codeIdx] ?? "",
      name: cols[nameIdx] ?? "",
      class: classIdx >= 0 ? (cols[classIdx] ?? "") || undefined : undefined,
      members: membersIdx >= 0 ? (cols[membersIdx] ?? "") || undefined : undefined,
    }
  })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id: competitionId } = await params

  const ok = await checkAccess(competitionId, session.user.id, session.user.role ?? "")
  if (!ok) return NextResponse.json({ error: "Keelatud" }, { status: 403 })

  let rows: RowData[] = []
  const errors: string[] = []

  const contentType = req.headers.get("content-type") ?? ""

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData()
    const file = formData.get("file")
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "Fail puudub" }, { status: 400 })
    }

    const buffer = await file.arrayBuffer()
    const filename = (file as File).name.toLowerCase()

    if (filename.endsWith(".csv")) {
      const text = Buffer.from(buffer).toString("utf-8")
      rows = parseCSVText(text)
      if (rows.length === 0) {
        return NextResponse.json({ error: "CSV-s pole andmeid või puuduvad vajalikud veerud (code, name)" }, { status: 400 })
      }
    } else {
      // Excel
      const wb = XLSX.read(new Uint8Array(buffer), { type: "array" })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" })
      rows = parseRows(raw)
    }
  } else {
    // JSON fallback for backward compatibility
    const body = await req.json()
    const { rows: jsonRows } = body
    if (!Array.isArray(jsonRows) || jsonRows.length === 0) {
      return NextResponse.json({ error: "Vale formaat" }, { status: 400 })
    }
    rows = jsonRows.map((r: Record<string, unknown>) => ({
      code: String(r.code ?? "").trim(),
      name: String(r.name ?? "").trim(),
      class: r.class ? String(r.class).trim() || undefined : undefined,
      members: r.members ? String(r.members).trim() || undefined : undefined,
    }))
  }

  const existing = await prisma.team.findMany({
    where: { competitionId },
    select: { name: true },
  })
  const existingNames = new Set(existing.map((t) => t.name.toLowerCase().trim()))

  let added = 0
  let skipped = 0

  for (const row of rows) {
    const name = String(row.name ?? "").trim()
    const code = String(row.code ?? "").trim()
    if (!name || !code) { skipped++; continue }
    if (existingNames.has(name.toLowerCase())) { skipped++; continue }

    try {
      const team = await prisma.team.create({
        data: {
          competitionId,
          name,
          code,
          class: row.class ? String(row.class).trim() || null : null,
        },
      })
      added++
      existingNames.add(name.toLowerCase())

      // Create team members if provided
      const memberNames = row.members?.split(";").map((m) => m.trim()).filter(Boolean) ?? []
      for (const memberName of memberNames) {
        try {
          await prisma.teamMember.create({
            data: { teamId: team.id, name: memberName, role: "COMPETITOR" },
          })
        } catch {
          errors.push(`Liikme lisamine ebaõnnestus: ${memberName} (võistkond ${name})`)
        }
      }
    } catch {
      skipped++
    }
  }

  return NextResponse.json({ added, skipped, errors })
}
