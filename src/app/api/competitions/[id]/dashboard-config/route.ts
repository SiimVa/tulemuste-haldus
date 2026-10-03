import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { canAccessCompetition } from "@/lib/competitionAccess"
import { withSecurityRoute } from "@/lib/securityRoute.server"
import { dashboardConfigInputSchema, normalizeDashboardConfig, pruneDashboardElementIds } from "@/lib/dashboard/config"

async function handlePUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  if (!await canAccessCompetition(id, { id: session.user.id, role: session.user.role })) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const parsed = dashboardConfigInputSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Vigased seaded" }, { status: 400 })
  }
  const elements = await prisma.scoringElement.findMany({ where: { competitionId: id }, select: { id: true } })
  const config = pruneDashboardElementIds(normalizeDashboardConfig(parsed.data), new Set(elements.map((element) => element.id)))
  await prisma.competition.update({ where: { id }, data: { dashboardConfig: JSON.stringify(config) } })
  return NextResponse.json(config)
}

export const PUT = withSecurityRoute("/api/competitions/[id]/dashboard-config", handlePUT)
