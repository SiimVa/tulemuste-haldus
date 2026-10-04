import { withSecurityRoute } from "@/lib/securityRoute.server"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { isAnalysisAccessMode } from "@/lib/analysisAccess"
import { generateAnalysisLinkToken, hashAnalysisLinkToken } from "@/lib/analysisAccess.server"
import { requireSeriesAdmin } from "@/lib/seriesAccess.server"

// Analüüsi avalik ligipääs nagu võistlusel. LINK_ONLY-le lülitudes luuakse
// tunnus, mida näidatakse vastuses ainult korra.
async function handlePATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireSeriesAdmin(params)
  if (!access.ok) return access.response
  const body = await req.json().catch(() => ({}))
  if (!isAnalysisAccessMode(body.analysisAccessMode)) return NextResponse.json({ error: "Tundmatu ligipääsuviis" }, { status: 400 })
  const analysisAccessMode = body.analysisAccessMode
  const current = await prisma.competitionSeries.findUniqueOrThrow({ where: { id: access.id }, select: { analysisAccessMode: true, analysisTokenHash: true } })

  // Olemasolev link jääb kehtima, et varem jagatud aadress ei kaoks.
  let analysisLinkToken: string | null = null
  let analysisTokenHash = current.analysisTokenHash
  if (analysisAccessMode === "LINK_ONLY" && (current.analysisAccessMode !== "LINK_ONLY" || !analysisTokenHash)) {
    analysisLinkToken = generateAnalysisLinkToken()
    analysisTokenHash = hashAnalysisLinkToken(analysisLinkToken)
  }
  await prisma.competitionSeries.update({ where: { id: access.id }, data: { analysisAccessMode, analysisTokenHash } })
  return NextResponse.json({ analysisAccessMode, analysisLinkToken, hasAnalysisLink: Boolean(analysisTokenHash) })
}

export const PATCH = withSecurityRoute("/api/series/[id]/analysis-access", handlePATCH)
