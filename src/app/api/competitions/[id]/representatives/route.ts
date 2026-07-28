import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { canAccessCompetition } from "@/lib/competitionAccess"

function actorFromSession(session: {
  user: { id: string; role?: string | null }
}) {
  return { id: session.user.id, role: session.user.role }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  if (!await canAccessCompetition(id, actorFromSession(session))) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  }

  const representatives = await prisma.teamRepresentative.findMany({
    where: { competitionId: id },
    include: {
      team: { select: { id: true, code: true, name: true } },
      member: {
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
      },
    },
    orderBy: { team: { code: "asc" } },
  })

  return NextResponse.json(representatives)
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  if (!await canAccessCompetition(id, actorFromSession(session))) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  }

  const body = await req.json()
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  const rawTeamIds: unknown[] = Array.isArray(body.teamIds)
    ? body.teamIds
    : []
  const teamIds: string[] = [
    ...new Set(
      rawTeamIds.filter(
        (teamId): teamId is string =>
          typeof teamId === "string" && teamId.length > 0
      )
    ),
  ]

  if (!email || teamIds.length === 0) {
    return NextResponse.json(
      { error: "E-post ja vähemalt üks võistkond on kohustuslikud" },
      { status: 400 }
    )
  }

  const [user, teams] = await Promise.all([
    prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true },
    }),
    prisma.team.findMany({
      where: { competitionId: id, id: { in: teamIds } },
      select: { id: true },
    }),
  ])

  if (!user) {
    return NextResponse.json({ error: "Kasutajat ei leitud" }, { status: 404 })
  }
  if (teams.length !== teamIds.length) {
    return NextResponse.json(
      { error: "Kõik võistkonnad peavad kuuluma samale võistlusele" },
      { status: 400 }
    )
  }

  const assignments = await prisma.$transaction(async (tx) => {
    const previousMemberIds = [
      ...new Set(
        (
          await tx.teamRepresentative.findMany({
            where: { competitionId: id, teamId: { in: teamIds } },
            select: { memberId: true },
          })
        ).map((assignment) => assignment.memberId)
      ),
    ]

    const membership = await tx.competitionMember.upsert({
      where: { competitionId_userId: { competitionId: id, userId: user.id } },
      create: { competitionId: id, userId: user.id },
      update: {},
    })

    await tx.competitionMemberRole.upsert({
      where: {
        memberId_role: {
          memberId: membership.id,
          role: "REPRESENTATIVE",
        },
      },
      create: { memberId: membership.id, role: "REPRESENTATIVE" },
      update: {},
    })

    for (const teamId of teamIds) {
      await tx.teamRepresentative.upsert({
        where: { teamId },
        create: {
          competitionId: id,
          teamId,
          memberId: membership.id,
        },
        update: { memberId: membership.id },
      })
    }

    for (const previousMemberId of previousMemberIds) {
      if (previousMemberId === membership.id) continue

      const remainingAssignments = await tx.teamRepresentative.count({
        where: { memberId: previousMemberId },
      })
      if (remainingAssignments === 0) {
        await tx.competitionMemberRole.deleteMany({
          where: {
            memberId: previousMemberId,
            role: "REPRESENTATIVE",
          },
        })

        const remainingRoles = await tx.competitionMemberRole.count({
          where: { memberId: previousMemberId },
        })
        if (remainingRoles === 0) {
          await tx.competitionMember.delete({
            where: { id: previousMemberId },
          })
        }
      }
    }

    return tx.teamRepresentative.findMany({
      where: { competitionId: id, teamId: { in: teamIds } },
      include: {
        team: { select: { id: true, code: true, name: true } },
        member: {
          include: {
            user: { select: { id: true, email: true, name: true } },
          },
        },
      },
      orderBy: { team: { code: "asc" } },
    })
  })

  return NextResponse.json(assignments)
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  if (!await canAccessCompetition(id, actorFromSession(session))) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  }

  const body = await req.json()
  if (typeof body.teamId !== "string" || !body.teamId) {
    return NextResponse.json(
      { error: "Võistkonna id on kohustuslik" },
      { status: 400 }
    )
  }

  await prisma.$transaction(async (tx) => {
    const assignment = await tx.teamRepresentative.findFirst({
      where: { competitionId: id, teamId: body.teamId },
      select: { memberId: true },
    })
    if (!assignment) return

    await tx.teamRepresentative.deleteMany({
      where: { competitionId: id, teamId: body.teamId },
    })

    const representedTeamCount = await tx.teamRepresentative.count({
      where: { memberId: assignment.memberId },
    })
    if (representedTeamCount === 0) {
      await tx.competitionMemberRole.deleteMany({
        where: {
          memberId: assignment.memberId,
          role: "REPRESENTATIVE",
        },
      })
    }

    const roleCount = await tx.competitionMemberRole.count({
      where: { memberId: assignment.memberId },
    })
    if (roleCount === 0 && representedTeamCount === 0) {
      await tx.competitionMember.delete({
        where: { id: assignment.memberId },
      })
    }
  })
  return NextResponse.json({ ok: true })
}
