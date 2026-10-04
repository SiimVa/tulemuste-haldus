import { withSecurityRoute } from "@/lib/securityRoute.server"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { normalizeSeriesDashboardConfig, seriesDashboardConfigSchema } from "@/lib/seriesDashboard"
import { requireSeriesAdmin } from "@/lib/seriesAccess.server"

// Ülevaate vidinate nähtavus, järjekord ja lävendid.
async function handlePUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireSeriesAdmin(params)
  if (!access.ok) return access.response
  const parsed = seriesDashboardConfigSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Vigased vidinate seaded" }, { status: 400 })
  const config = normalizeSeriesDashboardConfig(parsed.data)
  await prisma.competitionSeries.update({ where: { id: access.id }, data: { dashboardConfig: JSON.stringify(config) } })
  return NextResponse.json(config)
}

export const PUT = withSecurityRoute("/api/series/[id]/dashboard-config", handlePUT)
