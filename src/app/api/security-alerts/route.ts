import { auth } from "@/lib/auth"
import { listSecurityAlerts } from "@/lib/securityAlerts.server"
import { withSecurityRoute } from "@/lib/securityRoute.server"

export const dynamic = "force-dynamic"

async function handleGET() {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "ADMIN") return Response.json({ error: "Keelatud" }, { status: 403 })
  return Response.json(await listSecurityAlerts(), { headers: { "Cache-Control": "private, no-store" } })
}

export const GET = withSecurityRoute("/api/security-alerts", handleGET)
