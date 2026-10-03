import { prisma } from "@/lib/prisma"
import { withSecurityRoute } from "@/lib/securityRoute.server"
import { mapImageResponse } from "@/lib/mapImage.server"
import { parseDashboardConfig, visibleWidgetIds } from "@/lib/dashboard/config"

// Avalik kaardipilt ainult siis, kui kaart on avalikus vaates nähtav. KP-de
// asukohad on vaikimisi avalikud alles pärast võistlust.
async function handleGET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const competition = await prisma.competition.findUnique({ where: { id }, select: { status: true, dashboardConfig: true } })
  if (!competition || !visibleWidgetIds(parseDashboardConfig(competition.dashboardConfig), "public", competition.status).includes("map")) {
    return Response.json({ error: "Ei leitud" }, { status: 404, headers: { "Cache-Control": "no-store" } })
  }
  return mapImageResponse(id, "public, max-age=300")
}

export const GET = withSecurityRoute("/api/public/competitions/[id]/map-image", handleGET)
