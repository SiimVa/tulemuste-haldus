import { withSecurityRoute } from "@/lib/securityRoute.server"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { naturalCompare } from "@/lib/utils"
import { canAccessCompetition } from "@/lib/competitionAccess"
import * as XLSX from "xlsx"
import { parseQrOptions, renderAccessQrExport } from "@/lib/accessQrExport"

async function handleGET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: competitionId } = await params
  if (!await canAccessCompetition(competitionId, { id: session.user.id, role: session.user.role })) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  }

  const searchParams = new URL(req.url).searchParams
  const qrExport = searchParams.get("format") === "qr"
  const qrOptions = parseQrOptions(searchParams)
  if (qrExport && !qrOptions) {
    return NextResponse.json({ error: "Vali sihtrühm ja 1–12 QR-koodi lehe kohta" }, { status: 400 })
  }

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

  // Ehita base URL host-päisest (skeem + host, ilma teeta) — origin/referer annaks vale tee
  const host = req.headers.get("host") ?? "localhost:3000"
  const proto = req.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")
  const baseUrl = `${proto}://${host}`

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

  if (qrExport && qrOptions) {
    const entries = sorted
      .filter(t => (t.type === "JUDGE" || t.type === "ATHLETE") &&
        (qrOptions.audience === "ALL" || t.type === qrOptions.audience))
      .map(t => ({
        name: t.name,
        role: t.type === "JUDGE" ? "Kohtunik" : "Võistkond",
        subject: t.type === "JUDGE"
          ? (t.element ? `[${t.element.code}] ${t.element.name}` : "Kõik KP-d")
          : (t.team ? `${t.team.code} · ${t.team.name}` : ""),
        link: `${baseUrl}/${t.type === "JUDGE" ? "judge" : "athlete"}/${t.token}`,
      }))
    if (entries.length === 0) {
      return new NextResponse("Valitud sihtrühmale pole juurdepääsulinke loodud.", {
        status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      })
    }
    return new NextResponse(await renderAccessQrExport(competition.name, entries, qrOptions.perPage), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
      },
    })
  }

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

export const GET = withSecurityRoute("/api/competitions/[id]/tokens/export", handleGET)
