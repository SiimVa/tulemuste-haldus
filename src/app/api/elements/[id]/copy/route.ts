import { withSecurityRoute } from "@/lib/securityRoute.server"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { canAccessCompetition } from "@/lib/competitionAccess"
import {
  CompetitionCopyError,
  copyScoringElementConfiguration,
} from "@/lib/competitionCopy.server"
import { prisma } from "@/lib/prisma"

async function handlePOST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const targetCompetitionId =
    typeof body.targetCompetitionId === "string"
      ? body.targetCompetitionId
      : ""
  if (!targetCompetitionId) {
    return NextResponse.json(
      { error: "Sihtvõistlus tuleb valida" },
      { status: 400 }
    )
  }

  const source = await prisma.scoringElement.findUnique({
    where: { id },
    select: { competitionId: true },
  })
  if (!source) {
    return NextResponse.json(
      { error: "Hindamiselementi ei leitud" },
      { status: 404 }
    )
  }

  const actor = { id: session.user.id, role: session.user.role }
  const [mayAccessSource, mayAccessTarget] = await Promise.all([
    canAccessCompetition(source.competitionId, actor),
    canAccessCompetition(targetCompetitionId, actor),
  ])
  if (!mayAccessSource || !mayAccessTarget) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  }

  try {
    const element = await prisma.$transaction((tx) =>
      copyScoringElementConfiguration(tx, {
        sourceElementId: id,
        targetCompetitionId,
      })
    )
    return NextResponse.json(element, { status: 201 })
  } catch (error) {
    if (error instanceof CompetitionCopyError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      )
    }
    console.error("Hindamiselemendi kopeerimine ebaõnnestus:", error)
    return NextResponse.json(
      { error: "Hindamiselemendi kopeerimine ebaõnnestus" },
      { status: 500 }
    )
  }
}

export const POST = withSecurityRoute("/api/elements/[id]/copy", handlePOST)
