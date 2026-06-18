import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const where =
    session.user.role === "ADMIN"
      ? {}
      : { OR: [{ organizerId: session.user.id }, { members: { some: { userId: session.user.id } } }] }

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

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const { name, date, endDate, location, ...defaults } = body

  if (!name) return NextResponse.json({ error: "Nimi on kohustuslik" }, { status: 400 })

  const competition = await prisma.competition.create({
    data: {
      name,
      date: date ? new Date(date) : null,
      endDate: endDate ? new Date(endDate) : null,
      location,
      organizerId: session.user.id,
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
        ? JSON.stringify(defaults.defaultFixedRankingPoints) : "[]",
    },
  })
  return NextResponse.json(competition)
}
