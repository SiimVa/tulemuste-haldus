import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { naturalCompare } from "@/lib/utils"

async function checkAccess(competitionId: string, userId: string, role: string) {
  if (role === "ADMIN") return true
  const comp = await prisma.competition.findUnique({
    where: { id: competitionId },
    include: { members: { where: { userId }, select: { id: true } } },
  })
  return comp?.organizerId === userId || (comp?.members?.length ?? 0) > 0
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params

  const ok = await checkAccess(id, session.user.id, session.user.role ?? "")
  if (!ok) return NextResponse.json({ error: "Keelatud" }, { status: 403 })

  const competition = await prisma.competition.findUnique({
    where: { id },
    include: {
      organizer: { select: { name: true, email: true } },
      elements: {
        orderBy: { order: "asc" },
        include: {
          fields: { orderBy: { order: "asc" } },
          exceptions: { orderBy: { order: "asc" } },
          calcMethod: true,
          _count: { select: { results: true } },
        },
      },
      teams: {
        orderBy: { code: "asc" },
        include: { members: true },
      },
      _count: { select: { teams: true, elements: true } },
    },
  })

  if (!competition) return NextResponse.json({ error: "Ei leitud" }, { status: 404 })
  competition.teams.sort((a, b) => naturalCompare(a.code, b.code))
  return NextResponse.json(competition)
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params

  try {
    const body = await req.json()
    const ok = await checkAccess(id, session.user.id, session.user.role ?? "")
    if (!ok) return NextResponse.json({ error: "Keelatud" }, { status: 403 })

    const updated = await prisma.competition.update({
      where: { id },
      data: {
        name: body.name,
        date: body.date ? new Date(body.date) : body.date === null ? null : undefined,
        endDate: body.endDate ? new Date(body.endDate) : body.endDate === null ? null : undefined,
        location: body.location ?? null,
        status: body.status,
        scoringMode: body.scoringMode,
        defaultKPMaxValue: Number(body.defaultKPMaxValue),
        defaultPKMaxValue: Number(body.defaultPKMaxValue),
        defaultNotPassed: Number(body.defaultNotPassed),
        defaultPassedNotDone: Number(body.defaultPassedNotDone),
        defaultVastutegevusPenaltyPerLife: Number(body.defaultVastutegevusPenaltyPerLife),
        defaultVarustusPenaltyPerItem: Number(body.defaultVarustusPenaltyPerItem),
        defaultHilinemineMode: body.defaultHilinemineMode,
        defaultHilinemineIntervalMinutes: body.defaultHilinemineIntervalMinutes != null
          ? Math.round(Number(body.defaultHilinemineIntervalMinutes)) : undefined,
        defaultHilineminePenaltyPerInterval: Number(body.defaultHilineminePenaltyPerInterval),
        defaultHilinemineMaxPenalty: Number(body.defaultHilinemineMaxPenalty),
        defaultCalcType: body.defaultCalcType,
        defaultHigherIsBetter: body.defaultHigherIsBetter,
        defaultRankingMinPoints: body.defaultRankingMinPoints != null ? Number(body.defaultRankingMinPoints) : undefined,
        defaultFixedRankingPoints: Array.isArray(body.defaultFixedRankingPoints)
          ? JSON.stringify(body.defaultFixedRankingPoints) : undefined,
      },
    })
    return NextResponse.json(updated)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("Competition PATCH viga:", msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params

  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Keelatud" }, { status: 403 })

  await prisma.competition.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
