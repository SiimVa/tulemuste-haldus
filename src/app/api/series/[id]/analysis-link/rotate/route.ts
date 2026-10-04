import { withSecurityRoute } from "@/lib/securityRoute.server"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { generateAnalysisLinkToken, hashAnalysisLinkToken } from "@/lib/analysisAccess.server"
import { requireSeriesAdmin } from "@/lib/seriesAccess.server"

// Loob uue analüüsilingi; vana lakkab kohe kehtimast.
async function handlePOST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireSeriesAdmin(params)
  if (!access.ok) return access.response
  const series = await prisma.competitionSeries.findUniqueOrThrow({ where: { id: access.id }, select: { analysisAccessMode: true } })
  if (series.analysisAccessMode !== "LINK_ONLY") {
    return NextResponse.json({ error: "Uue lingi saab luua ainult lingiga analüüsi režiimis" }, { status: 409 })
  }
  const analysisLinkToken = generateAnalysisLinkToken()
  await prisma.competitionSeries.update({ where: { id: access.id }, data: { analysisTokenHash: hashAnalysisLinkToken(analysisLinkToken) } })
  return NextResponse.json({ analysisLinkToken })
}

export const POST = withSecurityRoute("/api/series/[id]/analysis-link/rotate", handlePOST)
