import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id: competitionId } = await params

  const [elements, teams, existing] = await Promise.all([
    prisma.scoringElement.findMany({ where: { competitionId }, select: { id: true, name: true, code: true } }),
    prisma.team.findMany({ where: { competitionId }, select: { id: true, name: true, code: true } }),
    prisma.accessToken.findMany({
      where: { competitionId },
      select: { elementId: true, teamId: true, type: true },
    }),
  ])

  const existingJudgeElements = new Set(existing.filter(t => t.type === "JUDGE" && t.elementId).map(t => t.elementId!))
  const existingAthleteTeams = new Set(existing.filter(t => t.type === "ATHLETE" && t.teamId).map(t => t.teamId!))

  const toCreate: { type: string; name: string; competitionId: string; elementId?: string; teamId?: string }[] = []

  for (const el of elements) {
    if (!existingJudgeElements.has(el.id)) {
      toCreate.push({ type: "JUDGE", name: `[${el.code}] ${el.name}`, competitionId, elementId: el.id })
    }
  }

  for (const team of teams) {
    if (!existingAthleteTeams.has(team.id)) {
      toCreate.push({ type: "ATHLETE", name: `${team.code} · ${team.name}`, competitionId, teamId: team.id })
    }
  }

  if (toCreate.length > 0) {
    await prisma.accessToken.createMany({ data: toCreate })
  }

  const allTokens = await prisma.accessToken.findMany({
    where: { competitionId },
    include: {
      element: { select: { name: true } },
      team: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json({ created: toCreate.length, tokens: allTokens })
}
