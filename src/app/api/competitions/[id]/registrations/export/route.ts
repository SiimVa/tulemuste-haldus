import { auth } from "@/lib/auth"
import { canAccessCompetition } from "@/lib/competitionAccess"
import { getRegistrationReport } from "@/lib/registrationReport.server"
import { reportCsv, reportMatrix, reportMembersMatrix, type ReportView } from "@/lib/registrationReport"
import { withSecurityRoute } from "@/lib/securityRoute.server"
import { setSecurityRecordCount } from "@/lib/security.server"
import * as XLSX from "xlsx"

const VIEWS: ReportView[] = ["teams", "summary", "members"]

// Veeru laius sisu järgi, et pikad e-postid ja nimed oleksid loetavad.
function sheet(matrix: (string | number)[][]) {
  const result = XLSX.utils.aoa_to_sheet(matrix)
  result["!cols"] = matrix[0].map((_, column) => ({
    wch: Math.min(50, Math.max(8, ...matrix.map(row => String(row[column] ?? "").length + 2))),
  }))
  result["!autofilter"] = { ref: XLSX.utils.encode_range({ r: 0, c: 0 }, { r: Math.max(0, matrix.length - 1), c: Math.max(0, matrix[0].length - 1) }) }
  return result
}

export const GET = withSecurityRoute("/api/competitions/[id]/registrations/export", async (request, { params }) => {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  if (!await canAccessCompetition(id, { id: session.user.id, role: session.user.role })) return Response.json({ error: "Keelatud" }, { status: 403 })
  const query = new URL(request.url).searchParams
  const phase = query.get("phase") ?? "REGISTRATION"
  const format = query.get("format") ?? "xlsx"
  const view = (query.get("view") ?? "teams") as ReportView
  if (!VIEWS.includes(view)) return Response.json({ error: "Vigane ülevaate tüüp" }, { status: 400 })
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
  const filters = { status: query.get("status") ?? undefined, className: query.get("class") ?? undefined, search: query.get("search") ?? undefined, answers }
  const matrix = reportMatrix(report, selected, filters, view)
  // Võistkondade Exceli juurde käib liikmete leht, kui liikmete veerud on valitud.
  const memberColumns = report.columns.filter(column => column.group === "members").map(column => column.key)
  const withMembers = format === "xlsx" && view === "teams" && (selected === undefined || selected.some(key => memberColumns.includes(key)))
  const members = withMembers ? reportMembersMatrix(report, filters) : null
  setSecurityRecordCount(matrix.length - 1 + (members ? members.length - 1 : 0))

  const title = phase === "MANDATE" ? "Mandaat" : "Registreerimine"
  const suffix = view === "summary" ? "_kokkuvote" : view === "members" ? "_liikmed" : ""
  const filename = `${report.name.replace(/[^a-zA-Z0-9äöüõÄÖÜÕ_-]/g, "_")}_${title.toLowerCase()}${suffix}.${format}`
  const headers = {
    "Cache-Control": "private, no-store",
    "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
  }
  if (format === "csv") return new Response(reportCsv(matrix), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" } })
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet(matrix), view === "members" ? "Liikmed" : title)
  if (members && members.length > 1) XLSX.utils.book_append_sheet(workbook, sheet(members), "Liikmed")
  return new Response(new Uint8Array(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })), { headers: { ...headers, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } })
})
