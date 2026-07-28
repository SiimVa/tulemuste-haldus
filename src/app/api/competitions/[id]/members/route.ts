import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import {
  canAccessCompetition,
  canManageCompetitionMembers,
} from "@/lib/competitionAccess"
import {
  COMPETITION_ROLES,
  type CompetitionRoleName,
} from "@/lib/permissions"

const ASSIGNABLE_ROLES = COMPETITION_ROLES.filter((role) => role !== "OWNER")

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  if (!await canAccessCompetition(id, { id: session.user.id, role: session.user.role })) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  }

  const competition = await prisma.competition.findUnique({
    where: { id },
    select: { organizerId: true },
  })
  if (!competition) {
    return NextResponse.json({ error: "Võistlust ei leitud" }, { status: 404 })
  }

  const members = await prisma.competitionMember.findMany({
    where: {
      competitionId: id,
      userId: { not: competition.organizerId },
      roles: { some: { role: "ORGANIZER" } },
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      roles: { orderBy: { addedAt: "asc" } },
      representedTeams: {
        include: { team: { select: { id: true, code: true, name: true } } },
        orderBy: { team: { code: "asc" } },
      },
    },
    orderBy: { addedAt: "asc" },
  })
  return NextResponse.json(members)
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params

  const actor = { id: session.user.id, role: session.user.role }
  const ok = await canManageCompetitionMembers(id, actor)
  if (!ok) return NextResponse.json({ error: "Keelatud" }, { status: 403 })

  const body = await req.json()
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  const rawRoles: unknown[] = Array.isArray(body.roles)
    ? body.roles
    : ["ORGANIZER"]

  if (
    !email ||
    rawRoles.length === 0 ||
    rawRoles.some(
      (role) =>
        typeof role !== "string" ||
        !ASSIGNABLE_ROLES.includes(role as Exclude<CompetitionRoleName, "OWNER">)
    )
  ) {
    return NextResponse.json(
      { error: "E-post või rollid ei ole korrektsed" },
      { status: 400 }
    )
  }
  const requestedRoles = [
    ...new Set(rawRoles),
  ] as CompetitionRoleName[]

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true },
  })
  if (!user) return NextResponse.json({ error: "Kasutajat ei leitud" }, { status: 404 })

  const comp = await prisma.competition.findUnique({ where: { id }, select: { organizerId: true } })
  if (comp?.organizerId === user.id) return NextResponse.json({ error: "Kasutaja on juba peakorraldaja" }, { status: 400 })

  const member = await prisma.$transaction(async (tx) => {
    const membership = await tx.competitionMember.upsert({
      where: { competitionId_userId: { competitionId: id, userId: user.id } },
      create: { competitionId: id, userId: user.id },
      update: {},
    })

    await tx.competitionMemberRole.createMany({
      data: requestedRoles.map((role) => ({ memberId: membership.id, role })),
      skipDuplicates: true,
    })

    return tx.competitionMember.findUniqueOrThrow({
      where: { id: membership.id },
      include: {
        user: { select: { id: true, name: true, email: true } },
        roles: { orderBy: { addedAt: "asc" } },
        representedTeams: {
          include: { team: { select: { id: true, code: true, name: true } } },
        },
      },
    })
  })
  return NextResponse.json(member)
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params

  const ok = await canManageCompetitionMembers(id, {
    id: session.user.id,
    role: session.user.role,
  })
  if (!ok) return NextResponse.json({ error: "Keelatud" }, { status: 403 })

  const { userId } = await req.json()
  const competition = await prisma.competition.findUnique({
    where: { id },
    select: { organizerId: true },
  })
  if (competition?.organizerId === userId) {
    return NextResponse.json(
      { error: "Võistluse omanikku ei saa eemaldada" },
      { status: 400 }
    )
  }
  await prisma.$transaction(async (tx) => {
    const membership = await tx.competitionMember.findUnique({
      where: { competitionId_userId: { competitionId: id, userId } },
      select: { id: true },
    })
    if (!membership) return

    await tx.competitionMemberRole.deleteMany({
      where: { memberId: membership.id, role: "ORGANIZER" },
    })

    const remaining = await tx.competitionMember.findUnique({
      where: { id: membership.id },
      select: {
        _count: { select: { roles: true, representedTeams: true } },
      },
    })
    if (
      remaining &&
      remaining._count.roles === 0 &&
      remaining._count.representedTeams === 0
    ) {
      await tx.competitionMember.delete({ where: { id: membership.id } })
    }
  })
  return NextResponse.json({ ok: true })
}
