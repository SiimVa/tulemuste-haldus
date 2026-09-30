import { auth } from "@/lib/auth"
import { canAccessCompetition } from "@/lib/competitionAccess"
import { getRegistrationReport } from "@/lib/registrationReport.server"
import { reportCsv, reportMatrix } from "@/lib/registrationReport"
import { withSecurityRoute } from "@/lib/securityRoute.server"
import * as XLSX from "xlsx"

export const GET = withSecurityRoute("/api/competitions/[id]/registrations/export", async (request, { params }) => {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  if (!await canAccessCompetition(id, { id: session.user.id, role: session.user.role })) return Response.json({ error: "Keelatud" }, { status: 403 })
  const query = new URL(request.url).searchParams
  const phase = query.get("phase") ?? "REGISTRATION"
  const format = query.get("format") ?? "xlsx"
  const view = query.get("view") ?? "teams"
  if (view !== "teams" && view !== "summary") return Response.json({ error: "Vigane ülevaate tüüp" }, { status: 400 })
  if ((phase !== "REGISTRATION" && phase !== "MANDATE") || !["csv", "xlsx"].includes(format)) return Response.json({ error: "Vigane ekspordi formaat või etapp" }, { status: 400 })
  const report = await getRegistrationReport(id, phase)
  if (!report) return Response.json({ error: "Võistlust ei leitud" }, { status: 404 })
  const selected = query.has("column") ? query.getAll("column") : undefined
  if (selected && (!selected.length || selected.some(key => !report.columns.some(column => column.key === key)))) return Response.json({ error: "Vali eksporditavad veerud" }, { status: 400 })
  const answers: Record<string, string> = Object.create(null)
  for (const raw of query.getAll("answer")) {
    let pair: unknown
    try { pair = JSON.parse(raw) } catch { return Response.json({ error: "Vigane vormivälja filter" }, { status: 400 }) }
    if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== "string" || typeof pair[1] !== "string"
      || !report.columns.some(column => column.group === "form" && column.key === pair[0])) {
      return Response.json({ error: "Vigane vormivälja filter" }, { status: 400 })
    }
    answers[pair[0]] = pair[1]
  }
  const matrix = reportMatrix(report, selected, { status: query.get("status") ?? undefined, className: query.get("class") ?? undefined, search: query.get("search") ?? undefined, answers }, view)
  const title = phase === "MANDATE" ? "Mandaat" : "Registreerimine"
  const filename = `${report.name.replace(/[^a-zA-Z0-9äöüõÄÖÜÕ_-]/g, "_")}_${title.toLowerCase()}${view === "summary" ? "_kokkuvote" : ""}.${format}`
  const headers = {
    "Cache-Control": "private, no-store",
    "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
  }
  if (format === "csv") return new Response(reportCsv(matrix), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" } })
  const sheet = XLSX.utils.aoa_to_sheet(matrix)
  sheet["!cols"] = matrix[0].map(() => ({ wch: 26 }))
  sheet["!autofilter"] = { ref: XLSX.utils.encode_range({ r: 0, c: 0 }, { r: matrix.length - 1, c: matrix[0].length - 1 }) }
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, title)
  return new Response(new Uint8Array(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })), { headers: { ...headers, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } })
})
