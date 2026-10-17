import { withSecurityRoute } from "@/lib/securityRoute.server"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { isAnalysisAccessMode } from "@/lib/analysisAccess"
import { generateAnalysisLinkToken, hashAnalysisLinkToken } from "@/lib/analysisAccess.server"
import { requireSeriesAdmin } from "@/lib/seriesAccess.server"

// Pingerea avalik ligipääs nagu võistlusel. LINK_ONLY-le lülitudes luuakse
// tunnus, mida näidatakse vastuses ainult korra.
async function handlePATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireSeriesAdmin(params)
  if (!access.ok) return access.response
  const body = await req.json().catch(() => ({}))
  if (!isAnalysisAccessMode(body?.leaderboardAccessMode)) return NextResponse.json({ error: "Tundmatu ligipääsuviis" }, { status: 400 })
  const leaderboardAccessMode = body.leaderboardAccessMode
  const current = await prisma.competitionSeries.findUniqueOrThrow({ where: { id: access.id }, select: { leaderboardAccessMode: true, leaderboardTokenHash: true } })

  // Olemasolev link jääb kehtima, et varem jagatud aadress ei kaoks.
  let leaderboardLinkToken: string | null = null
  let leaderboardTokenHash = current.leaderboardTokenHash
  if (leaderboardAccessMode === "LINK_ONLY" && (current.leaderboardAccessMode !== "LINK_ONLY" || !leaderboardTokenHash)) {
    leaderboardLinkToken = generateAnalysisLinkToken()
    leaderboardTokenHash = hashAnalysisLinkToken(leaderboardLinkToken)
  }
  await prisma.competitionSeries.update({ where: { id: access.id }, data: { leaderboardAccessMode, leaderboardTokenHash } })
  return NextResponse.json({ leaderboardAccessMode, leaderboardLinkToken, hasLeaderboardLink: Boolean(leaderboardTokenHash) })
}

export const PATCH = withSecurityRoute("/api/series/[id]/leaderboard-access", handlePATCH)
