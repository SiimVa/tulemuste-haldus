import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { canAccessCompetition } from "@/lib/competitionAccess"
import { prisma } from "@/lib/prisma"

const judgeInclude = {
  user: { select: { id: true, name: true, email: true } },
  judgedElements: {
    include: {
      element: { select: { id: true, name: true, code: true, order: true } },
    },
    orderBy: { element: { order: "asc" as const } },
  },
} as const

async function mayManageJudges(competitionId: string) {
  const session = await auth()
  if (!session?.user?.id) return { session: null, allowed: false }

  const allowed = await canAccessCompetition(competitionId, {
    id: session.user.id,
    role: session.user.role,
  })
  return { session, allowed }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { session, allowed } = await mayManageJudges(id)
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!allowed) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  }

  const judges = await prisma.competitionMember.findMany({
    where: {
      competitionId: id,
      roles: { some: { role: "JUDGE" } },
    },
    include: judgeInclude,
    orderBy: { addedAt: "asc" },
  })

  return NextResponse.json(judges)
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { session, allowed } = await mayManageJudges(id)
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!allowed) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  const rawElementIds: unknown[] = Array.isArray(body.elementIds)
    ? body.elementIds
    : []
  const elementIds = [
    ...new Set(
      rawElementIds.filter(
        (elementId): elementId is string =>
          typeof elementId === "string" && Boolean(elementId)
      )
    ),
  ]

  if (!email || elementIds.length === 0) {
    return NextResponse.json(
      { error: "Sisesta kasutaja e-post ja vali vähemalt üks element" },
      { status: 400 }
    )
  }

  const [competition, user, elements] = await Promise.all([
    prisma.competition.findUnique({
      where: { id },
      select: { organizerId: true },
    }),
    prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true },
    }),
    prisma.scoringElement.findMany({
      where: { competitionId: id, id: { in: elementIds } },
      select: { id: true },
    }),
  ])

  if (!competition) {
    return NextResponse.json({ error: "Võistlust ei leitud" }, { status: 404 })
  }
  if (!user) {
    return NextResponse.json(
      { error: "Selle e-postiga kasutajakontot ei leitud" },
      { status: 404 }
    )
  }
  if (competition.organizerId === user.id) {
    return NextResponse.json(
      { error: "Võistluse omanikul on juba ligipääs kõigile elementidele" },
      { status: 400 }
    )
  }
  if (elements.length !== elementIds.length) {
    return NextResponse.json(
      { error: "Vähemalt üks element ei kuulu sellele võistlusele" },
      { status: 400 }
    )
  }

  const judge = await prisma.$transaction(async (tx) => {
    const membership = await tx.competitionMember.upsert({
      where: {
        competitionId_userId: { competitionId: id, userId: user.id },
      },
      create: { competitionId: id, userId: user.id },
      update: {},
    })

    await tx.competitionMemberRole.upsert({
      where: { memberId_role: { memberId: membership.id, role: "JUDGE" } },
      create: { memberId: membership.id, role: "JUDGE" },
      update: {},
    })

    await tx.judgeElementAssignment.deleteMany({
      where: {
        memberId: membership.id,
        elementId: { notIn: elementIds },
      },
    })
    await tx.judgeElementAssignment.createMany({
      data: elementIds.map((elementId) => ({
        competitionId: id,
        memberId: membership.id,
        elementId,
      })),
      skipDuplicates: true,
    })

    return tx.competitionMember.findUniqueOrThrow({
      where: { id: membership.id },
      include: judgeInclude,
    })
  })

  return NextResponse.json(judge)
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { session, allowed } = await mayManageJudges(id)
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!allowed) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const userId = typeof body.userId === "string" ? body.userId : ""
  if (!userId) {
    return NextResponse.json({ error: "Kasutaja ID puudub" }, { status: 400 })
  }

  await prisma.$transaction(async (tx) => {
    const membership = await tx.competitionMember.findUnique({
      where: { competitionId_userId: { competitionId: id, userId } },
      select: { id: true },
    })
    if (!membership) return

    await tx.judgeElementAssignment.deleteMany({
      where: { memberId: membership.id },
    })
    await tx.competitionMemberRole.deleteMany({
      where: { memberId: membership.id, role: "JUDGE" },
    })

    const remaining = await tx.competitionMember.findUnique({
      where: { id: membership.id },
      select: {
        _count: {
          select: {
            roles: true,
            representedTeams: true,
            judgedElements: true,
          },
        },
      },
    })
    if (
      remaining &&
      remaining._count.roles === 0 &&
      remaining._count.representedTeams === 0 &&
      remaining._count.judgedElements === 0
    ) {
      await tx.competitionMember.delete({ where: { id: membership.id } })
    }
  })

  return NextResponse.json({ ok: true })
}
