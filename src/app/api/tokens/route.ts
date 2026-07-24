import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import {
  canAccessCompetition,
  canAccessToken,
  elementBelongsToCompetition,
  teamBelongsToCompetition,
} from "@/lib/competitionAccess"

// Loo juurdepääsu token (kohtunik / võistleja)
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { type, name, competitionId, elementId, teamId } = body
  const actor = { id: session.user.id, role: session.user.role }

  if (!["JUDGE", "ATHLETE"].includes(type) || typeof name !== "string" || !name.trim() || typeof competitionId !== "string") {
    return NextResponse.json({ error: "Vigased tokeni andmed" }, { status: 400 })
  }
  if (!await canAccessCompetition(competitionId, actor)) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  }
  if (type === "JUDGE") {
    if (
      teamId != null ||
      (elementId != null && (
        typeof elementId !== "string" ||
        !await elementBelongsToCompetition(elementId, competitionId)
      ))
    ) {
      return NextResponse.json({ error: "Element ei kuulu sellele võistlusele" }, { status: 400 })
    }
  } else if (
    typeof teamId !== "string" ||
    !teamId ||
    elementId != null ||
    !await teamBelongsToCompetition(teamId, competitionId)
  ) {
    return NextResponse.json({ error: "Võistkond ei kuulu sellele võistlusele" }, { status: 400 })
  }

  const token = await prisma.accessToken.create({
    data: {
      type,
      name: name.trim(),
      competitionId,
      elementId: elementId || null,
      teamId: teamId || null,
    },
    include: {
      element: { select: { name: true } },
      team: { select: { name: true } },
    },
  })
  return NextResponse.json(token)
}

// Kustuta token
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await req.json().catch(() => ({}))
  if (typeof id !== "string") return NextResponse.json({ error: "Tokeni ID puudub" }, { status: 400 })
  if (!await canAccessToken(id, { id: session.user.id, role: session.user.role })) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  }
  await prisma.accessToken.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
