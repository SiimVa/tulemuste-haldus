import { withSecurityRoute } from "@/lib/securityRoute.server"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { canAccessCompetition } from "@/lib/competitionAccess"
import {
  CompetitionCopyError,
  copyScoringElementConfiguration,
} from "@/lib/competitionCopy.server"
import { prisma } from "@/lib/prisma"

// Korraga kopeeritavate elementide ülempiir.
const MAX_COPY_ELEMENTS = 100

// Kopeerib valitud hindamiselemendid sellesse võistlusse ühe tehinguna:
// kopeeritakse kõik või mitte ükski. Koopiad lisatakse saadetud järjekorras.
async function handlePOST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id: targetCompetitionId } = await params
  const body = await req.json().catch(() => ({}))
  const requested: unknown[] = Array.isArray(body.sourceElementIds) ? body.sourceElementIds : []
  if (requested.length === 0 || requested.some((id) => typeof id !== "string" || !id)) {
    return NextResponse.json(
      { error: "Vali vähemalt üks hindamiselement" },
      { status: 400 }
    )
  }
  const sourceElementIds = [...new Set(requested as string[])]
  if (sourceElementIds.length > MAX_COPY_ELEMENTS) {
    return NextResponse.json(
      { error: `Korraga saab kopeerida kuni ${MAX_COPY_ELEMENTS} elementi` },
      { status: 400 }
    )
  }

  const sources = await prisma.scoringElement.findMany({
    where: { id: { in: sourceElementIds } },
    select: { competitionId: true },
  })
  if (sources.length !== sourceElementIds.length) {
    return NextResponse.json(
      { error: "Hindamiselementi ei leitud" },
      { status: 404 }
    )
  }

  const actor = { id: session.user.id, role: session.user.role }
  const competitionIds = [...new Set([targetCompetitionId, ...sources.map((source) => source.competitionId)])]
  const access = await Promise.all(competitionIds.map((competitionId) => canAccessCompetition(competitionId, actor)))
  if (access.some((allowed) => !allowed)) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  }

  try {
    const elements = await prisma.$transaction(
      async (tx) => {
        const copies = []
        for (const sourceElementId of sourceElementIds) {
          copies.push(await copyScoringElementConfiguration(tx, { sourceElementId, targetCompetitionId }))
        }
        return copies
      },
      { maxWait: 5_000, timeout: 30_000 }
    )
    return NextResponse.json(
      { elements: elements.map(({ id, code, name }) => ({ id, code, name })) },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof CompetitionCopyError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      )
    }
    console.error("Hindamiselementide kopeerimine ebaõnnestus:", error)
    return NextResponse.json(
      { error: "Hindamiselementide kopeerimine ebaõnnestus" },
      { status: 500 }
    )
  }
}

export const POST = withSecurityRoute("/api/competitions/[id]/elements/copy", handlePOST)
