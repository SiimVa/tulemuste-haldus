import { withSecurityRoute } from "@/lib/securityRoute.server"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { parseSeriesInput } from "@/lib/seriesRanking.server"

async function requireAdmin() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  return null
}

// Nime ja osavõistluste muutmine; osavõistluste valik asendatakse tervikuna.
async function handlePATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin()
  if (denied) return denied
  const { id } = await params
  if (!await prisma.competitionSeries.findUnique({ where: { id }, select: { id: true } })) {
    return NextResponse.json({ error: "Arvestust ei leitud" }, { status: 404 })
  }
  const input = await parseSeriesInput(await req.json().catch(() => ({})))
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 })
  await prisma.$transaction([
    prisma.competitionSeries.update({ where: { id }, data: { name: input.name } }),
    prisma.competitionSeriesCompetition.deleteMany({ where: { seriesId: id } }),
    prisma.competitionSeriesCompetition.createMany({
      data: input.competitionIds.map((competitionId, order) => ({ seriesId: id, competitionId, order })),
    }),
  ])
  return NextResponse.json({ id })
}

async function handleDELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin()
  if (denied) return denied
  const { id } = await params
  const deleted = await prisma.competitionSeries.deleteMany({ where: { id } })
  if (deleted.count === 0) return NextResponse.json({ error: "Arvestust ei leitud" }, { status: 404 })
  return NextResponse.json({ ok: true })
}

export const PATCH = withSecurityRoute("/api/series/[id]", handlePATCH)
export const DELETE = withSecurityRoute("/api/series/[id]", handleDELETE)
