import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { canAccessCompetition } from "@/lib/competitionAccess"
import {
  CompetitionCopyError,
  copyCompetitionConfiguration,
} from "@/lib/competitionCopy.server"
import { canCreateCompetition } from "@/lib/permissions"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!canCreateCompetition(session.user.role)) {
    return NextResponse.json(
      { error: "Sul puudub uue võistluse loomise õigus" },
      { status: 403 }
    )
  }

  const { id } = await params
  const allowed = await canAccessCompetition(id, {
    id: session.user.id,
    role: session.user.role,
  })
  if (!allowed) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const name = typeof body.name === "string" ? body.name : undefined
  const includeElements = body.includeElements !== false

  try {
    const competition = await copyCompetitionConfiguration({
      sourceCompetitionId: id,
      organizerId: session.user.id,
      name,
      includeElements,
    })
    return NextResponse.json(competition, { status: 201 })
  } catch (error) {
    if (error instanceof CompetitionCopyError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      )
    }
    console.error("Võistluse kopeerimine ebaõnnestus:", error)
    return NextResponse.json(
      { error: "Võistluse kopeerimine ebaõnnestus" },
      { status: 500 }
    )
  }
}
