import { Prisma } from "@prisma/client"
import { setTeamRepresentative } from "./teamRepresentatives.server"
import { deliverPendingNotificationsSafely } from "./notifications.server"
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

export async function updateCompetitionMemberRoles({ competitionId, userId, roles, elementIds, teamIds, canManageOrganizers, actorId, invitation }: {
  competitionId: string; userId: string; roles: EditableCompetitionRole[]; elementIds: string[]; teamIds: string[]; canManageOrganizers: boolean; actorId?: string
  invitation?: { id: string; tokenHash: string; teamIds: string }
}) {
  await validateCompetitionRoleTargets({ competitionId, elementIds, teamIds })
  const result = await prisma.$transaction(async tx => {
    const competition = await tx.competition.findUniqueOrThrow({ where: { id: competitionId } })
    if (competition.organizerId === userId) throw new CompetitionRoleAssignmentError("Võistluse omaniku rolli ei saa muuta", 400)
    const existing = await tx.competitionMember.findUnique({ where: { competitionId_userId: { competitionId, userId } }, include: { roles: true } })
    if (!mayChangeOrganizerRole(existing?.roles.map(item => item.role) ?? [], roles, canManageOrganizers)) throw new CompetitionRoleAssignmentError("Korraldaja õigust saab muuta ainult võistluse omanik või administraator", 403)
    if (invitation) {
      const claimed = await tx.competitionRoleInvitation.updateMany({ where: {
        id: invitation.id, competitionId, tokenHash: invitation.tokenHash, teamIds: invitation.teamIds,
        acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() },
      }, data: { acceptedAt: new Date(), acceptedById: userId } })
      if (!claimed.count) throw new CompetitionRoleAssignmentError("Kutse on aegunud või selle õigused on muutunud. Ava kutse uuesti.", 409)
    }
    if (!existing && !roles.length) return null
    const membership = await tx.competitionMember.upsert({ where: { competitionId_userId: { competitionId, userId } }, create: { competitionId, userId }, update: {} })
    await tx.judgeElementAssignment.deleteMany({ where: { memberId: membership.id, ...(roles.includes("JUDGE") ? { elementId: { notIn: elementIds } } : {}) } })
    if (roles.includes("JUDGE")) await tx.judgeElementAssignment.createMany({ data: elementIds.map(elementId => ({ competitionId, memberId: membership.id, elementId })), skipDuplicates: true })
    const removed = await tx.teamRepresentative.findMany({ where: { memberId: membership.id, ...(roles.includes("REPRESENTATIVE") ? { teamId: { notIn: teamIds } } : {}) } })
    for (const assignment of removed) await setTeamRepresentative(tx, competitionId, assignment.teamId, null, { actorId, cleanup: false })
    if (roles.includes("REPRESENTATIVE")) for (const teamId of teamIds) await setTeamRepresentative(tx, competitionId, teamId, userId, { actorId })
    const rolesToRemove = EDITABLE_COMPETITION_ROLES.filter(role => !roles.includes(role) && (canManageOrganizers || role !== "ORGANIZER"))
    const rolesToCreate = roles.filter(role => canManageOrganizers || role !== "ORGANIZER")
    await tx.competitionMemberRole.deleteMany({ where: { memberId: membership.id, role: { in: rolesToRemove } } })
    await tx.competitionMemberRole.createMany({ data: rolesToCreate.map(role => ({ memberId: membership.id, role })), skipDuplicates: true })
    const remaining = await tx.competitionMember.findUniqueOrThrow({ where: { id: membership.id }, include: { _count: { select: { roles: true, representedTeams: true, judgedElements: true } } } })
    if (!remaining._count.roles && !remaining._count.representedTeams && !remaining._count.judgedElements) {
      await tx.competitionMember.delete({ where: { id: membership.id } })
      return null
    }
    return tx.competitionMember.findUniqueOrThrow({ where: { id: membership.id }, include: competitionMemberRoleInclude })
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  await deliverPendingNotificationsSafely()
  return result
}

export async function setCompetitionOwner({
  competitionId,
  userId,
}: {
  competitionId: string
  userId: string | null
}) {
  return prisma.$transaction(async (tx) => {
    const competition = await tx.competition.findUnique({
      where: { id: competitionId },
      select: { organizerId: true },
    })
    if (!competition) {
      throw new CompetitionRoleAssignmentError("Võistlust ei leitud", 404)
    }

    if (userId) {
      const userExists = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true },
      })
      if (!userExists) {
        throw new CompetitionRoleAssignmentError("Kasutajat ei leitud", 404)
      }
      if (userId !== competition.organizerId) {
        const organizer = await tx.competitionMember.findFirst({
          where: { competitionId, userId, roles: { some: { role: "ORGANIZER" } } },
          select: { id: true },
        })
        if (!organizer) {
          throw new CompetitionRoleAssignmentError(
            "Peakorraldajaks saab määrata ainult selle võistluse korraldaja",
            400
          )
        }
      }
    }

    const previousOwnerRoles = await tx.competitionMemberRole.findMany({
      where: {
        role: "OWNER",
        member: { competitionId },
      },
      select: { memberId: true },
    })

    await tx.competitionMemberRole.deleteMany({
      where: {
        role: "OWNER",
        member: { competitionId },
      },
    })

    await tx.competition.update({
      where: { id: competitionId },
      data: { organizerId: userId },
    })

    let owner = null
    let ownerMemberId: string | null = null
    if (userId) {
      const membership = await tx.competitionMember.upsert({
        where: {
          competitionId_userId: { competitionId, userId },
        },
        create: { competitionId, userId },
        update: {},
      })
      ownerMemberId = membership.id
      await tx.competitionMemberRole.create({
        data: { memberId: membership.id, role: "OWNER" },
      })
      owner = await tx.competitionMember.findUniqueOrThrow({
        where: { id: membership.id },
        include: competitionMemberRoleInclude,
      })
    }

    const displacedMemberIds = previousOwnerRoles
      .map(({ memberId }) => memberId)
      .filter((memberId) => memberId !== ownerMemberId)
    if (displacedMemberIds.length > 0) {
      await tx.competitionMember.deleteMany({
        where: {
          id: { in: displacedMemberIds },
          roles: { none: {} },
          representedTeams: { none: {} },
          judgedElements: { none: {} },
        },
      })
    }

    return owner
  })
}
