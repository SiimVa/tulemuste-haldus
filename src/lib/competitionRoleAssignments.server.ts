import type { CompetitionRoleName } from "@/lib/permissions"
import {
  EDITABLE_COMPETITION_ROLES,
  mayChangeOrganizerRole,
  type EditableCompetitionRole,
} from "@/lib/competitionRoleManagement"
import { prisma } from "@/lib/prisma"

export const competitionMemberRoleInclude = {
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

export class CompetitionRoleAssignmentError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message)
  }
}

export async function validateCompetitionRoleTargets({
  competitionId,
  elementIds,
  teamIds,
}: {
  competitionId: string
  elementIds: string[]
  teamIds: string[]
}) {
  const [competition, validElements, validTeams] = await Promise.all([
    prisma.competition.findUnique({
      where: { id: competitionId },
      select: { id: true },
    }),
    elementIds.length > 0
      ? prisma.scoringElement.count({
          where: { competitionId, id: { in: elementIds } },
        })
      : 0,
    teamIds.length > 0
      ? prisma.team.count({
          where: { competitionId, id: { in: teamIds } },
        })
      : 0,
  ])

  if (!competition) {
    throw new CompetitionRoleAssignmentError("Võistlust ei leitud", 404)
  }
  if (validElements !== elementIds.length) {
    throw new CompetitionRoleAssignmentError(
      "Vähemalt üks hindamiselement ei kuulu sellele võistlusele",
      400
    )
  }
  if (validTeams !== teamIds.length) {
    throw new CompetitionRoleAssignmentError(
      "Vähemalt üks võistkond ei kuulu sellele võistlusele",
      400
    )
  }
}

export async function updateCompetitionMemberRoles({
  competitionId,
  userId,
  roles,
  elementIds,
  teamIds,
  canManageOrganizers,
}: {
  competitionId: string
  userId: string
  roles: EditableCompetitionRole[]
  elementIds: string[]
  teamIds: string[]
  canManageOrganizers: boolean
}) {
  const [competition, existingMembership] = await Promise.all([
    prisma.competition.findUnique({
      where: { id: competitionId },
      select: { organizerId: true },
    }),
    prisma.competitionMember.findUnique({
      where: {
        competitionId_userId: { competitionId, userId },
      },
      select: {
        id: true,
        roles: { select: { role: true } },
      },
    }),
  ])
  if (!competition) {
    throw new CompetitionRoleAssignmentError("Võistlust ei leitud", 404)
  }
  if (competition.organizerId === userId) {
    throw new CompetitionRoleAssignmentError(
      "Võistluse omaniku rolli ei saa muuta",
      400
    )
  }

  const currentRoles =
    existingMembership?.roles.map(
      ({ role }) => role as CompetitionRoleName
    ) ?? []
  if (!mayChangeOrganizerRole(currentRoles, roles, canManageOrganizers)) {
    throw new CompetitionRoleAssignmentError(
      "Korraldaja õigust saab muuta ainult võistluse omanik või administraator",
      403
    )
  }

  await validateCompetitionRoleTargets({
    competitionId,
    elementIds,
    teamIds,
  })

  return prisma.$transaction(async (tx) => {
    if (!existingMembership && roles.length === 0) return null

    const membership = await tx.competitionMember.upsert({
      where: {
        competitionId_userId: { competitionId, userId },
      },
      create: { competitionId, userId },
      update: {},
    })

    const displacedMemberIds = roles.includes("REPRESENTATIVE")
      ? [
          ...new Set(
            (
              await tx.teamRepresentative.findMany({
                where: { competitionId, teamId: { in: teamIds } },
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
          competitionId,
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
            competitionId,
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
        await tx.competitionMember.delete({ where: { id: displacedMemberId } })
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
      include: competitionMemberRoleInclude,
    })
  })
}
