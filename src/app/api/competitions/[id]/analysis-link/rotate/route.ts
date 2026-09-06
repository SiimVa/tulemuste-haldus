import { withSecurityRoute } from "@/lib/securityRoute.server"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { canAccessCompetition } from "@/lib/competitionAccess"
import { prisma } from "@/lib/prisma"
import {
  generateAnalysisLinkToken,
  hashAnalysisLinkToken,
} from "@/lib/analysisAccess.server"

// POST — loo uus analüüsilink. Vana lakkab kohe kehtimast.
async function handlePOST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const allowed = await canAccessCompetition(id, {
    id: session.user.id,
    role: session.user.role,
  })
  if (!allowed) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  }

  const competition = await prisma.competition.findUnique({
    where: { id },
    select: { analysisAccessMode: true },
  })
  if (!competition) {
    return NextResponse.json({ error: "Võistlust ei leitud" }, { status: 404 })
  }
  if (competition.analysisAccessMode !== "LINK_ONLY") {
    return NextResponse.json(
      { error: "Uue lingi saab luua ainult lingiga analüüsi režiimis" },
      { status: 409 }
    )
  }

  const analysisLinkToken = generateAnalysisLinkToken()
  await prisma.competition.update({
    where: { id },
    data: { analysisTokenHash: hashAnalysisLinkToken(analysisLinkToken) },
  })

  return NextResponse.json({ analysisLinkToken })
}

export const POST = withSecurityRoute(
  "/api/competitions/[id]/analysis-link/rotate",
  handlePOST
)
