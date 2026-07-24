import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import {
  canAccessCompetition,
  elementBelongsToCompetition,
  teamBelongsToCompetition,
} from "@/lib/competitionAccess"
import { recomputeElementScores } from "@/lib/recompute"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; elementId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id: competitionId, elementId } = await params
  if (
    !await canAccessCompetition(competitionId, { id: session.user.id, role: session.user.role }) ||
    !await elementBelongsToCompetition(elementId, competitionId)
  ) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  }

  const entries = await prisma.miscEntry.findMany({
    where: { elementId },
    include: { team: { select: { id: true, name: true, code: true } } },
    orderBy: { createdAt: "asc" },
  })
  return NextResponse.json(entries)
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string; elementId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id: competitionId, elementId } = await params
  if (
    !await canAccessCompetition(competitionId, { id: session.user.id, role: session.user.role }) ||
    !await elementBelongsToCompetition(elementId, competitionId)
  ) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  }

  const body = await req.json()
  const { teamId, points, description, reason, abandonElementId, abandonTime } = body
  if (typeof teamId !== "string" || points == null || typeof description !== "string" || !description.trim()) {
    return NextResponse.json({ error: "Puudulikud andmed" }, { status: 400 })
  }
  const numericPoints = Number(points)
  if (!Number.isFinite(numericPoints)) {
    return NextResponse.json({ error: "Punktid peavad olema arv" }, { status: 400 })
  }
  if (!await teamBelongsToCompetition(teamId, competitionId)) {
    return NextResponse.json({ error: "Võistkond ei kuulu sellele võistlusele" }, { status: 400 })
  }

  const entry = await prisma.miscEntry.create({
    data: {
      elementId, teamId, points: numericPoints, description: description.trim(),
      reason: reason || null,
      abandonElementId: abandonElementId || null,
      abandonTime: abandonTime || null,
    },
    include: { team: { select: { id: true, name: true, code: true } } },
  })
  await recomputeElementScores(elementId)
  return NextResponse.json(entry)
}
