import { withSecurityRoute } from "@/lib/securityRoute.server"
import { setSecurityTargets } from "@/lib/security.server"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { managedCompetitionsWhere } from "@/lib/competitionAccess"
import { canCreateCompetition } from "@/lib/permissions"
import { isTeamCountScope } from "@/lib/classGroups"
import { isFixedRankingMode, nonNegativeFiniteNumber, parseFixedPointValues } from "@/lib/fixedRanking"

async function handleGET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const where = managedCompetitionsWhere({
    id: session.user.id,
    role: session.user.role,
  })

  const competitions = await prisma.competition.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      organizer: { select: { name: true } },
      _count: { select: { teams: true, elements: true } },
    },
  })
  return NextResponse.json(competitions)
}

async function handlePOST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!canCreateCompetition(session.user.role)) {
    return NextResponse.json(
      { error: "Sul puudub võistluse loomise õigus" },
      { status: 403 }
    )
  }

  const body = await req.json()
  const { name, date, endDate, location, ...defaults } = body

  if (!name) return NextResponse.json({ error: "Nimi on kohustuslik" }, { status: 400 })

  const competition = await prisma.competition.create({
    data: {
      name,
      date: date ? new Date(date) : null,
      endDate: endDate ? new Date(endDate) : null,
      location,
      createdById: session.user.id,
      organizerId: null,
      scoringMode: defaults.scoringMode ?? "PENALTY",
      defaultKPMaxValue: defaults.defaultKPMaxValue ?? 30,
      defaultPKMaxValue: defaults.defaultPKMaxValue ?? 15,
      defaultNotPassed: defaults.defaultNotPassed ?? 40,
      defaultPassedNotDone: defaults.defaultPassedNotDone ?? 35,
      defaultVastutegevusPenaltyPerLife: defaults.defaultVastutegevusPenaltyPerLife ?? 5,
      defaultVarustusPenaltyPerItem: defaults.defaultVarustusPenaltyPerItem ?? 5,
      defaultHilinemineMode: defaults.defaultHilinemineMode ?? "ONE_TIME",
      defaultHilinemineIntervalMinutes: defaults.defaultHilinemineIntervalMinutes ?? 1,
      defaultHilineminePenaltyPerInterval: defaults.defaultHilineminePenaltyPerInterval ?? 1,
      defaultHilinemineMaxPenalty: defaults.defaultHilinemineMaxPenalty ?? 30,
      defaultCalcType: defaults.defaultCalcType ?? "RELATIVE_RANKING",
      defaultHigherIsBetter: defaults.defaultHigherIsBetter ?? false,
      defaultRankingMinPoints: defaults.defaultRankingMinPoints ?? 0,
      defaultFixedRankingPoints: defaults.defaultFixedRankingPoints
        ? JSON.stringify(parseFixedPointValues(defaults.defaultFixedRankingPoints)) : "[]",
      defaultFixedRankingMode: isFixedRankingMode(defaults.defaultFixedRankingMode)
        ? defaults.defaultFixedRankingMode : "PARTIAL",
      defaultTeamCountScope: isTeamCountScope(defaults.defaultTeamCountScope)
        ? defaults.defaultTeamCountScope : "ALL",
      defaultTeamCountBase: nonNegativeFiniteNumber(defaults.defaultTeamCountBase, 0),
      defaultTeamCountStep: nonNegativeFiniteNumber(defaults.defaultTeamCountStep, 1),
      // Klassigrupid saab luua alles registreerimisseadetes määratud klassidest.
      classGroups: "[]",
    },
  })
  setSecurityTargets({ competitionId: competition.id })
  return NextResponse.json(competition)
}

export const GET = withSecurityRoute("/api/competitions", handleGET)
export const POST = withSecurityRoute("/api/competitions", handlePOST)
