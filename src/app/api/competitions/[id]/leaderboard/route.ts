import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { naturalCompare } from "@/lib/utils"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: competitionId } = await params

  const [competition, teams, scores, penalties, elements] = await Promise.all([
    prisma.competition.findUnique({
      where: { id: competitionId },
      select: { scoringMode: true },
    }),
    prisma.team.findMany({ where: { competitionId } }).then(t => t.sort((a, b) => naturalCompare(a.code, b.code))),
    prisma.computedScore.findMany({
      where: { element: { competitionId } },
      include: { element: { select: { id: true, name: true, code: true } } },
    }),
    prisma.manualPenalty.findMany({ where: { competitionId } }),
    prisma.scoringElement.findMany({
      where: { competitionId },
      orderBy: { order: "asc" },
      select: { id: true, name: true, code: true },
    }),
  ])

  const scoringMode = competition?.scoringMode ?? "PENALTY"

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
      manualPenalties: teamPenalties,
    }
  })

  // PENALTY: väiksem = parem (ascending), PLUS: suurem = parem (descending)
  leaderboard.sort((a, b) =>
    scoringMode === "PLUS" ? b.total - a.total : a.total - b.total
  )

  const classCounts: Record<string, number> = {}
  const result = leaderboard.map((entry, idx) => {
    const cls = entry.team.class ?? ""
    classCounts[cls] = (classCounts[cls] ?? 0) + 1
    return { ...entry, rank: idx + 1, classRank: classCounts[cls] }
  })

  return NextResponse.json({ leaderboard: result, elements, scoringMode })
}
