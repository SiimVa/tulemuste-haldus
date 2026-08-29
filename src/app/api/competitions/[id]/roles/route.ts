import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import {
  canAccessCompetition,
  canManageCompetitionMembers,
} from "@/lib/competitionAccess"
import {
  EDITABLE_COMPETITION_ROLES,
  mayChangeOrganizerRole,
  parseCompetitionRoleManagementRequest,
} from "@/lib/competitionRoleManagement"
import { prisma } from "@/lib/prisma"
import type { CompetitionRoleName } from "@/lib/permissions"

const memberInclude = {
  user: { select: { id: true, name: true, email: true } },
  roles: { orderBy: { addedAt: "asc" as const } },
  judgedElements: {
    include: {
      element: {
        select: { id: true, name: true, code: true, order: true },
      },
    },
    orderBy: { element: { order: "asc" as const } },
  },
  representedTeams: {
    include: {
      team: { select: { id: true, name: true, code: true } },
    },
    orderBy: { team: { code: "asc" as const } },
  },
} as const

function actorFromSession(session: {
  user: { id: string; role?: string | null }
}) {
  return { id: session.user.id, role: session.user.role }
}

async function authorizeRoleManager(competitionId: string) {
  const session = await auth()
  if (!session?.user?.id) {
    return { session: null, allowed: false, canManageOrganizers: false }
  }

  const actor = actorFromSession(session)
  const [allowed, canManageOrganizers] = await Promise.all([
    canAccessCompetition(competitionId, actor),
    canManageCompetitionMembers(competitionId, actor),
  ])
  return { session, allowed, canManageOrganizers }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { session, allowed, canManageOrganizers } =
    await authorizeRoleManager(id)
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!allowed) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  }

  const competition = await prisma.competition.findUnique({
    where: { id },
    select: {
      organizerId: true,
      organizer: { select: { id: true, name: true, email: true } },
      members: {
        include: memberInclude,
        orderBy: { addedAt: "asc" },
      },
    },
  })
  if (!competition) {
    return NextResponse.json({ error: "Võistlust ei leitud" }, { status: 404 })
  }

  const ownerMembership = competition.members.find(
    ({ userId }) => userId === competition.organizerId
  )
  const owner = ownerMembership ?? {
    id: `owner:${competition.organizerId}`,
    userId: competition.organizerId,
    user: competition.organizer,
    roles: [{ role: "OWNER", addedAt: new Date(0) }],
    judgedElements: [],
    representedTeams: [],
    competitionId: id,
    addedAt: new Date(0),
  }

  return NextResponse.json({
    canManageOrganizers,
    owner,
    members: competition.members.filter(
      ({ userId }) => userId !== competition.organizerId
    ),
  })
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { session, allowed, canManageOrganizers } =
    await authorizeRoleManager(id)
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!allowed) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  }

  const parsed = parseCompetitionRoleManagementRequest(
    await req.json().catch(() => null)
  )
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  const { email, roles, elementIds, teamIds } = parsed.value

  const [competition, user] = await Promise.all([
    prisma.competition.findUnique({
      where: { id },
      select: { organizerId: true },
    }),
    prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true },
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
      { error: "Võistluse omaniku rolli ei saa muuta" },
      { status: 400 }
    )
  }

  const existingMembership = await prisma.competitionMember.findUnique({
    where: { competitionId_userId: { competitionId: id, userId: user.id } },
    select: {
      id: true,
      roles: { select: { role: true } },
    },
  })
  const currentRoles =
    existingMembership?.roles.map(
      ({ role }) => role as CompetitionRoleName
    ) ?? []
  if (!mayChangeOrganizerRole(currentRoles, roles, canManageOrganizers)) {
    return NextResponse.json(
      { error: "Korraldaja õigust saab muuta ainult võistluse omanik või administraator" },
      { status: 403 }
    )
  }

  const [validElements, validTeams] = await Promise.all([
    elementIds.length > 0
      ? prisma.scoringElement.count({
          where: { competitionId: id, id: { in: elementIds } },
        })
      : 0,
    teamIds.length > 0
      ? prisma.team.count({
          where: { competitionId: id, id: { in: teamIds } },
        })
      : 0,
  ])
  if (validElements !== elementIds.length) {
    return NextResponse.json(
      { error: "Vähemalt üks hindamiselement ei kuulu sellele võistlusele" },
      { status: 400 }
    )
  }
  if (validTeams !== teamIds.length) {
    return NextResponse.json(
      { error: "Vähemalt üks võistkond ei kuulu sellele võistlusele" },
      { status: 400 }
    )
  }

  const member = await prisma.$transaction(async (tx) => {
    if (!existingMembership && roles.length === 0) return null

    const membership = await tx.competitionMember.upsert({
      where: {
        competitionId_userId: { competitionId: id, userId: user.id },
      },
      create: { competitionId: id, userId: user.id },
      update: {},
    })

    const displacedMemberIds = roles.includes("REPRESENTATIVE")
      ? [
          ...new Set(
            (
              await tx.teamRepresentative.findMany({
                where: { competitionId: id, teamId: { in: teamIds } },
                select: { memberId: true },
              })
            )
              .map(({ memberId }) => memberId)
              .filter((memberId) => memberId !== membership.id)
          ),
        ]
      : []

    await tx.judgeElementAssignment.deleteMany({
      where: {
        memberId: membership.id,
        ...(roles.includes("JUDGE")
          ? { elementId: { notIn: elementIds } }
          : {}),
      },
    })
    if (roles.includes("JUDGE")) {
      await tx.judgeElementAssignment.createMany({
        data: elementIds.map((elementId) => ({
          competitionId: id,
          memberId: membership.id,
          elementId,
        })),
        skipDuplicates: true,
      })
    }

    await tx.teamRepresentative.deleteMany({
      where: {
        memberId: membership.id,
        ...(roles.includes("REPRESENTATIVE")
          ? { teamId: { notIn: teamIds } }
          : {}),
      },
    })
    if (roles.includes("REPRESENTATIVE")) {
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
    }

    const rolesToRemove = EDITABLE_COMPETITION_ROLES.filter(
      (role) =>
        !roles.includes(role) &&
        (canManageOrganizers || role !== "ORGANIZER")
    )
    const rolesToCreate = roles.filter(
      (role) => canManageOrganizers || role !== "ORGANIZER"
    )
    await tx.competitionMemberRole.deleteMany({
      where: { memberId: membership.id, role: { in: rolesToRemove } },
    })
    await tx.competitionMemberRole.createMany({
      data: rolesToCreate.map((role) => ({ memberId: membership.id, role })),
      skipDuplicates: true,
    })

    for (const displacedMemberId of displacedMemberIds) {
      const representedTeamCount = await tx.teamRepresentative.count({
        where: { memberId: displacedMemberId },
      })
      if (representedTeamCount > 0) continue

      await tx.competitionMemberRole.deleteMany({
        where: { memberId: displacedMemberId, role: "REPRESENTATIVE" },
      })
      const displacedMember = await tx.competitionMember.findUnique({
        where: { id: displacedMemberId },
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
        displacedMember &&
        displacedMember._count.roles === 0 &&
        displacedMember._count.representedTeams === 0 &&
        displacedMember._count.judgedElements === 0
      ) {
        await tx.competitionMember.delete({
          where: { id: displacedMemberId },
        })
      }
    }

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
      return null
    }

    return tx.competitionMember.findUniqueOrThrow({
      where: { id: membership.id },
      include: memberInclude,
    })
  })

  return NextResponse.json({ member })
}
