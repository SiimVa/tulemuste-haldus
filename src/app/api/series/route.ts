import { withSecurityRoute } from "@/lib/securityRoute.server"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { parseSeriesInput } from "@/lib/seriesRanking.server"

// Üleriikliku arvestuse loomine (ainult administraator).
async function handlePOST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Keelatud" }, { status: 403 })

  const input = await parseSeriesInput(await req.json().catch(() => ({})))
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 })
  const series = await prisma.competitionSeries.create({
    data: {
      name: input.name,
      competitions: { create: input.competitionIds.map((competitionId, order) => ({ competitionId, order })) },
    },
  })
  return NextResponse.json({ id: series.id }, { status: 201 })
}

export const POST = withSecurityRoute("/api/series", handlePOST)
