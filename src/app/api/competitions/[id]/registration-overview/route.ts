import { auth } from "@/lib/auth"
import { canAccessCompetition } from "@/lib/competitionAccess"
import { getRegistrationReport } from "@/lib/registrationReport.server"
import { withSecurityRoute } from "@/lib/securityRoute.server"

export const GET = withSecurityRoute("/api/competitions/[id]/registration-overview", async (request, { params }) => {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  if (!await canAccessCompetition(id, { id: session.user.id, role: session.user.role })) return Response.json({ error: "Keelatud" }, { status: 403 })
  const phase = new URL(request.url).searchParams.get("phase") ?? "REGISTRATION"
  if (phase !== "REGISTRATION" && phase !== "MANDATE") return Response.json({ error: "Vigane etapp" }, { status: 400 })
  const report = await getRegistrationReport(id, phase)
  if (!report) return Response.json({ error: "Võistlust ei leitud" }, { status: 404 })
  // Ülevaade vajab ainult koondveerge; liikmete kontaktid jäävad ekspordi jaoks serverisse.
  const rows = report.rows.map(row => ({ id: row.id, status: row.status, className: row.className, cells: row.cells }))
  return Response.json({ ...report, rows }, { headers: { "Cache-Control": "private, no-store" } })
})
