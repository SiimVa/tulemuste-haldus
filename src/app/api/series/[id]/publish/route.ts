import { withSecurityRoute } from "@/lib/securityRoute.server"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSeriesAdmin } from "@/lib/seriesAccess.server"

// Avaldab või peidab üleriikliku arvestuse avalikud vaated.
async function handlePUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireSeriesAdmin(params)
  if (!access.ok) return access.response
  const body = await req.json().catch(() => null)
  if (typeof body?.isPublished !== "boolean") return NextResponse.json({ error: "Vigane päring" }, { status: 400 })
  await prisma.competitionSeries.update({ where: { id: access.id }, data: { isPublished: body.isPublished } })
  return NextResponse.json({ isPublished: body.isPublished })
}

export const PUT = withSecurityRoute("/api/series/[id]/publish", handlePUT)
