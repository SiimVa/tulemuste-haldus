import { rankLeaderboard, parseTieBreakConfig } from "@/lib/tieBreak"
import { withSecurityRoute } from "@/lib/securityRoute.server"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { naturalCompare } from "@/lib/utils"
import { auth } from "@/lib/auth"
import { canAccessCompetition } from "@/lib/competitionAccess"
import { getPublicFreeze } from "@/lib/leaderboardFreeze.server"
import { applyFrozenElementStatus, applyFrozenTeamStatus } from "@/lib/leaderboardFreeze"

// Public like the leaderboard page: only fields that the page itself shows.
const publicTeamSelect = {
  id: true, code: true, name: true, class: true, isHorsDeCompetition: true,
  hcFromElementOrder: true, dnfFromElementOrder: true, dqFromElementOrder: true, dnsFlag: true,
} as const

async function handleGET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: competitionId } = await params

  const [competition, liveTeams, liveScores, livePenalties, liveElements, freeze] = await Promise.all([
    prisma.competition.findUnique({
      where: { id: competitionId },
      select: { scoringMode: true, tieBreakConfig: true },
    }),
    prisma.team.findMany({ where: { competitionId }, select: publicTeamSelect }).then(t => t.sort((a, b) => naturalCompare(a.code, b.code))),
    prisma.computedScore.findMany({
      where: { element: { competitionId } },
      select: { teamId: true, elementId: true, penaltyPoints: true },
    }),
    prisma.manualPenalty.findMany({ where: { competitionId }, select: { id: true, teamId: true, points: true } }),
    prisma.scoringElement.findMany({
      where: { competitionId },
      orderBy: { order: "asc" },
      select: { id: true, name: true, code: true, type: true, isCancelled: true },
    }),
    getPublicFreeze(competitionId),
  ])

  if (!competition) return NextResponse.json({ error: "Ei leitud" }, { status: 404 })
  const scoringMode = competition.scoringMode

  // Külmutatud pingerida: korraldaja näeb jooksvat seisu, teised külmutamise hetke seisu.
  const session = freeze ? await auth() : null
  const frozen = freeze && !(session?.user?.id && await canAccessCompetition(competitionId, { id: session.user.id, role: session.user.role }))
    ? freeze : null
  const teams = frozen ? applyFrozenTeamStatus(liveTeams, frozen.snapshot) : liveTeams
  const elements = frozen ? applyFrozenElementStatus(liveElements, frozen.snapshot) : liveElements
  const scores: { teamId: string; elementId: string; penaltyPoints: number }[] = frozen
    ? frozen.snapshot.scores.map((score) => ({ teamId: score.teamId, elementId: score.elementId, penaltyPoints: score.points }))
    : liveScores
  // Snapshot'is pole karistuse ID-d; avalikus vastuses piisab järjekorranumbrist.
  const penalties: { id: string; teamId: string; points: number }[] = frozen
    ? frozen.snapshot.penalties.map((penalty, index) => ({ id: `frozen-${index}`, teamId: penalty.teamId, points: penalty.points }))
    : livePenalties

  const leaderboard = teams.map((team) => {
    const teamScores = scores.filter((s) => s.teamId === team.id)
    const teamPenalties = penalties.filter((p) => p.teamId === team.id)

    const kpTotal = teamScores.reduce((sum, s) => sum + s.penaltyPoints, 0)
    const manualTotal = teamPenalties.reduce((sum, p) => sum + p.points, 0)

    // PENALTY: liida käsitsi karistused juurde
    // PLUS: lahuta käsitsi karistused maha
    const total = scoringMode === "PLUS"
      ? kpTotal - manualTotal
      : kpTotal + manualTotal

    const byElement = Object.fromEntries(
      teamScores.map((s) => [s.elementId, s.penaltyPoints])
    )

    return {
      team,
      total: Math.round(total * 1000) / 1000,
      kpTotal: Math.round(kpTotal * 1000) / 1000,
      manualTotal: Math.round(manualTotal * 1000) / 1000,
      byElement,
      manualPenalties: teamPenalties.map(({ id, points }) => ({ id, points })),
    }
  })

  // PENALTY: väiksem = parem (ascending), PLUS: suurem = parem (descending)
  leaderboard.sort((a, b) =>
    scoringMode === "PLUS" ? b.total - a.total : a.total - b.total
  )

  const eligible = (row: typeof leaderboard[number]) => !row.team.isHorsDeCompetition && row.team.hcFromElementOrder == null && row.team.dnfFromElementOrder == null
  const result = [
    ...rankLeaderboard(leaderboard.filter(eligible), elements, scoringMode, parseTieBreakConfig(competition.tieBreakConfig)),
    ...leaderboard.filter(row => !eligible(row)).map(row => ({ ...row, rank: null, classRank: null, tieBreakReason: null, classTieBreakReason: null })),
  ]

  return NextResponse.json({ leaderboard: result, elements, scoringMode, frozenAt: frozen ? frozen.freezeAt.toISOString() : null })
}

export const GET = withSecurityRoute("/api/competitions/[id]/leaderboard", handleGET)
