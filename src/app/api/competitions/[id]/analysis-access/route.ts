import { withSecurityRoute } from "@/lib/securityRoute.server"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { canAccessCompetition } from "@/lib/competitionAccess"
import { prisma } from "@/lib/prisma"
import { isAnalysisAccessMode } from "@/lib/analysisAccess"
import {
  generateAnalysisLinkToken,
  hashAnalysisLinkToken,
} from "@/lib/analysisAccess.server"

// PATCH — uuenda VK analüüsi vaate ligipääsu.
// LINK_ONLY-le lülitudes luuakse tunnus, mida näidatakse vastuses ainult korra.
async function handlePATCH(
  req: Request,
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

  const body = await req.json()
  if (!isAnalysisAccessMode(body.analysisAccessMode)) {
    return NextResponse.json(
      { error: "Tundmatu ligipääsuviis" },
      { status: 400 }
    )
  }
  const analysisAccessMode = body.analysisAccessMode

  const current = await prisma.competition.findUnique({
    where: { id },
    select: { analysisAccessMode: true, analysisTokenHash: true },
  })
  if (!current) {
    return NextResponse.json({ error: "Võistlust ei leitud" }, { status: 404 })
  }

  // Tunnus luuakse ainult LINK_ONLY-le lülitudes või kui see on veel puudu.
  // Olemasolev link jääb kehtima, et varem jagatud aadress ei kataks.
  let analysisLinkToken: string | null = null
  let analysisTokenHash = current.analysisTokenHash
  if (
    analysisAccessMode === "LINK_ONLY" &&
    (current.analysisAccessMode !== "LINK_ONLY" || !analysisTokenHash)
  ) {
    analysisLinkToken = generateAnalysisLinkToken()
    analysisTokenHash = hashAnalysisLinkToken(analysisLinkToken)
  }

  await prisma.competition.update({
    where: { id },
    data: { analysisAccessMode, analysisTokenHash },
  })

  return NextResponse.json({
    analysisAccessMode,
    analysisLinkToken,
    hasAnalysisLink: Boolean(analysisTokenHash),
  })
}

export const PATCH = withSecurityRoute(
  "/api/competitions/[id]/analysis-access",
  handlePATCH
)
