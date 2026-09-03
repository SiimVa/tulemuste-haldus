import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { generateAccessToken } from "@/lib/accessTokens.server"
import { prisma } from "@/lib/prisma"

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { teamId } = await params
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      code: true,
      name: true,
      competitionId: true,
      registrationStatus: true,
      competition: { select: { status: true } },
      members: {
        where: { userId: session.user.id },
        select: { id: true },
        take: 1,
      },
      representative: {
        select: { member: { select: { userId: true } } },
      },
      accessTokens: {
        where: { type: "ATHLETE" },
        select: { token: true },
        orderBy: { createdAt: "asc" },
        take: 1,
      },
    },
  })

  const mayAccess = Boolean(
    team &&
      (team.members.length > 0 ||
        team.representative?.member.userId === session.user.id)
  )
  if (!team || !mayAccess) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  }
  if (
    team.competition.status !== "ACTIVE" ||
    team.registrationStatus !== "APPROVED"
  ) {
    return NextResponse.json(
      { error: "Tulemuste link avaneb aktiivse võistluse kinnitatud võistkonnale" },
      { status: 409 }
    )
  }

  const existingToken = team.accessTokens[0]?.token
  if (existingToken) {
    return NextResponse.json({ token: existingToken })
  }

  const accessToken = await prisma.accessToken.create({
    data: {
      token: generateAccessToken(),
      type: "ATHLETE",
      name: `${team.code} · ${team.name}`,
      competitionId: team.competitionId,
      teamId: team.id,
    },
    select: { token: true },
  })
  return NextResponse.json(accessToken)
}
