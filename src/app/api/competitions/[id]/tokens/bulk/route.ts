import { withSecurityRoute } from "@/lib/securityRoute.server"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { canAccessCompetition } from "@/lib/competitionAccess"
import { ensureCompetitionAccessTokens } from "@/lib/accessTokens.server"

async function handlePOST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id: competitionId } = await params
  if (!await canAccessCompetition(competitionId, { id: session.user.id, role: session.user.role })) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  }

  const created = await prisma.$transaction((tx) =>
    ensureCompetitionAccessTokens(tx, competitionId)
  )

  const allTokens = await prisma.accessToken.findMany({
    where: { competitionId },
    include: {
      element: { select: { name: true } },
      team: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json({ created, tokens: allTokens })
}

export const POST = withSecurityRoute("/api/competitions/[id]/tokens/bulk", handlePOST)
