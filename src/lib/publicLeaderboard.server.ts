import "server-only"

import { prisma } from "@/lib/prisma"
import { getPublicFreeze } from "@/lib/leaderboardFreeze.server"
import { buildPublicLeaderboard, type PublicLeaderboardSnapshot } from "@/lib/publicLeaderboard"
import { getPublicSnapshot } from "@/lib/publicSnapshotCache"

/** Shared between the initial page and its JSON refresh. Only public fields leave this loader. */
export async function getPublicLeaderboard(competitionId: string): Promise<PublicLeaderboardSnapshot | null> {
  // Check freeze boundaries before accepting a cached live snapshot, including a scheduled freeze.
  const freeze = await getPublicFreeze(competitionId)
  const version = freeze ? `${freeze.freezeAt.toISOString()}:${freeze.snapshot.takenAt}` : "live"
  return getPublicSnapshot("leaderboard", competitionId, version, async () => {
    const competition = await prisma.competition.findUnique({
      where: { id: competitionId },
      select: { id: true, name: true, scoringMode: true, analysisAccessMode: true, tieBreakConfig: true,
        registrationClasses: { where: { isActive: true }, select: { name: true } } },
    })
    if (!competition) return null
    const [teams, elements] = await Promise.all([
      prisma.team.findMany({ where: { competitionId }, select: {
        id: true, code: true, name: true, class: true, isHorsDeCompetition: true, hcFromElementOrder: true,
        dnfFromElementOrder: true, dnfReason: true, dqFromElementOrder: true, dnsFlag: true,
      } }),
      prisma.scoringElement.findMany({ where: { competitionId }, orderBy: { order: "asc" },
        select: { id: true, code: true, name: true, type: true, isCancelled: true } }),
    ])
    // Frozen scores already contain all score/penalty/misc data; do not read live results unnecessarily.
    const [scores, penalties, miscEntries] = freeze ? [[], [], []] : await Promise.all([
      prisma.computedScore.findMany({ where: { element: { competitionId } }, select: { teamId: true, elementId: true, penaltyPoints: true } }),
      prisma.manualPenalty.findMany({ where: { competitionId }, select: { teamId: true, points: true } }),
      prisma.miscEntry.findMany({ where: { element: { competitionId, type: { in: ["OTHER", "ABANDONMENT"] } } },
        select: { elementId: true, teamId: true, points: true, description: true, element: { select: { type: true } } } }),
    ])
    return buildPublicLeaderboard({ competition, freeze, teams, elements, scores, penalties, miscEntries })
  })
}
