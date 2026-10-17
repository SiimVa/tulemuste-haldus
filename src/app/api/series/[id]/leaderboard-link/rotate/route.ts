import { withSecurityRoute } from "@/lib/securityRoute.server"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { generateAnalysisLinkToken, hashAnalysisLinkToken } from "@/lib/analysisAccess.server"
import { requireSeriesAdmin } from "@/lib/seriesAccess.server"

// Loob uue pingerealingi; vana lakkab kohe kehtimast.
async function handlePOST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireSeriesAdmin(params)
  if (!access.ok) return access.response
  const series = await prisma.competitionSeries.findUniqueOrThrow({ where: { id: access.id }, select: { leaderboardAccessMode: true } })
  if (series.leaderboardAccessMode !== "LINK_ONLY") {
    return NextResponse.json({ error: "Uue lingi saab luua ainult lingiga pingerea režiimis" }, { status: 409 })
  }
  const leaderboardLinkToken = generateAnalysisLinkToken()
  await prisma.competitionSeries.update({ where: { id: access.id }, data: { leaderboardTokenHash: hashAnalysisLinkToken(leaderboardLinkToken) } })
  return NextResponse.json({ leaderboardLinkToken })
}

export const POST = withSecurityRoute("/api/series/[id]/leaderboard-link/rotate", handlePOST)
