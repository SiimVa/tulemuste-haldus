import "server-only"

import { auth } from "@/lib/auth"
import { isAnalysisLinkToken } from "@/lib/analysisAccess"
import { hashAnalysisLinkToken } from "@/lib/analysisAccess.server"
import { canViewCompetition } from "@/lib/competitionAccess"
import { prisma } from "@/lib/prisma"

// Same rules as the analysis page: PUBLIC mode, the current LINK_ONLY link,
// or a competition member. PRIVATE analysis is visible to members only.
export async function canViewCompetitionAnalysis(
  competitionId: string,
  analysisLinkToken: unknown
): Promise<boolean> {
  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: { analysisAccessMode: true, analysisTokenHash: true },
  })
  if (!competition) return false
  if (competition.analysisAccessMode === "PUBLIC") return true
  if (
    competition.analysisAccessMode === "LINK_ONLY" &&
    isAnalysisLinkToken(analysisLinkToken) &&
    competition.analysisTokenHash === hashAnalysisLinkToken(analysisLinkToken)
  ) {
    return true
  }
  const session = await auth()
  if (!session?.user?.id) return false
  return canViewCompetition(competitionId, {
    id: session.user.id,
    role: session.user.role,
  })
}
