import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

async function checkAccess(competitionId: string, userId: string, role: string) {
  if (role === "ADMIN") return true
  const comp = await prisma.competition.findUnique({
    where: { id: competitionId },
    include: { members: { where: { userId }, select: { id: true } } },
  })
  return comp?.organizerId === userId || (comp?.members?.length ?? 0) > 0
}

// PATCH — uuenda sportlaste punktide nähtavuse seadeid (osaline)
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params

  const ok = await checkAccess(id, session.user.id, session.user.role ?? "")
  if (!ok) return NextResponse.json({ error: "Keelatud" }, { status: 403 })

  const body = await req.json()

  // Võistluse-tasemel seaded
  const compData: Record<string, unknown> = {}
  if (body.mode !== undefined) compData.athletePointsMode = body.mode
  if (body.ranges !== undefined) compData.athletePointsRanges = JSON.stringify(body.ranges)
  if (body.showTotal !== undefined) compData.athleteShowTotal = Boolean(body.showTotal)
  if (Object.keys(compData).length > 0) {
    await prisma.competition.update({ where: { id }, data: compData })
  }

  // Per-element avaldamine: { elements: [{ id, reveal }] } VÕI { revealAll: true/false }
  if (typeof body.revealAll === "boolean") {
    await prisma.scoringElement.updateMany({
      where: { competitionId: id },
      data: { revealPointsToAthletes: body.revealAll },
    })
  }
  if (Array.isArray(body.elements)) {
    for (const el of body.elements) {
      if (el && el.id) {
        await prisma.scoringElement.update({
          where: { id: el.id },
          data: { revealPointsToAthletes: Boolean(el.reveal) },
        })
      }
    }
  }

  const competition = await prisma.competition.findUnique({
    where: { id },
    select: { athletePointsMode: true, athletePointsRanges: true, athleteShowTotal: true },
  })
  const elements = await prisma.scoringElement.findMany({
    where: { competitionId: id },
    orderBy: { order: "asc" },
    select: { id: true, revealPointsToAthletes: true },
  })
  return NextResponse.json({ competition, elements })
}
