import { auth } from "@/lib/auth"
import { resolveSecurityAlert } from "@/lib/securityAlerts.server"
import { withSecurityRoute } from "@/lib/securityRoute.server"

// Märgi hoiatus lahendatuks. Sama tegevuse jätkumisel tekib uus hoiatus.
async function handlePATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "ADMIN") return Response.json({ error: "Keelatud" }, { status: 403 })
  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!/^c[a-z0-9]{24}$/.test(id) || body?.resolved !== true) {
    return Response.json({ error: "Vigane päring" }, { status: 400 })
  }
  const result = await resolveSecurityAlert(id, session.user.id)
  if (result === "NOT_FOUND") return Response.json({ error: "Hoiatust ei leitud" }, { status: 404 })
  return Response.json({ ok: true, alreadyResolved: result === "ALREADY_RESOLVED" })
}

export const PATCH = withSecurityRoute("/api/security-alerts/[id]", handlePATCH)
