import { Prisma } from "@prisma/client"

type TransactionClient = Prisma.TransactionClient

export type LinkableTeamMember = {
  name: string
  role: string
  email?: string
}

export type ResolvedTeamMember = {
  name: string
  role: string
  userId: string | null
}

export class TeamMemberAccountConflictError extends Error {}

function normalizeEmail(value: string | undefined) {
  return value?.trim().toLowerCase() ?? ""
}

export async function resolveTeamMemberAccounts(
  tx: TransactionClient,
  competitionId: string,
  teamId: string | null,
  members: LinkableTeamMember[]
): Promise<ResolvedTeamMember[]> {
  const emails = Array.from(
    new Set(
      members
        .map(({ email }) => normalizeEmail(email))
        .filter(Boolean)
    )
  )
  const users =
    emails.length > 0
      ? await tx.user.findMany({
          where: { email: { in: emails } },
          select: { id: true, email: true },
        })
      : []
  const userByEmail = new Map(
    users.map((user) => [normalizeEmail(user.email), user.id])
  )
  const resolved = members.map((member) => ({
    name: member.name,
    role: member.role,
    userId: userByEmail.get(normalizeEmail(member.email)) ?? null,
  }))
  const userIds = resolved.flatMap(({ userId }) => (userId ? [userId] : []))

  if (new Set(userIds).size !== userIds.length) {
    throw new TeamMemberAccountConflictError(
      "Sama kasutajakontot ei saa lisada võistkonda mitu korda"
    )
  }
  if (userIds.length === 0) return resolved

  const conflict = await tx.teamMember.findFirst({
    where: {
      competitionId,
      userId: { in: userIds },
      ...(teamId ? { teamId: { not: teamId } } : {}),
    },
    select: {
      user: { select: { email: true } },
      team: { select: { name: true } },
    },
  })
  if (conflict) {
    throw new TeamMemberAccountConflictError(
      `Kasutaja ${conflict.user?.email ?? ""} on sellel võistlusel juba võistkonna „${conflict.team.name}” liige`
    )
  }

  return resolved
}

export async function ensureCompetitorRoles(
  tx: TransactionClient,
  competitionId: string,
  userIds: string[]
) {
  for (const userId of new Set(userIds)) {
    const membership = await tx.competitionMember.upsert({
      where: { competitionId_userId: { competitionId, userId } },
      create: { competitionId, userId },
      update: {},
    })
    await tx.competitionMemberRole.upsert({
      where: {
        memberId_role: { memberId: membership.id, role: "COMPETITOR" },
      },
      create: { memberId: membership.id, role: "COMPETITOR" },
      update: {},
    })
  }
}

export async function cleanupCompetitorRoles(
  tx: TransactionClient,
  competitionId: string,
  userIds: string[]
) {
  for (const userId of new Set(userIds)) {
    const remainingTeamMemberships = await tx.teamMember.count({
      where: { competitionId, userId },
    })
    if (remainingTeamMemberships > 0) continue

    const membership = await tx.competitionMember.findUnique({
      where: { competitionId_userId: { competitionId, userId } },
      select: { id: true },
    })
    if (!membership) continue

    await tx.competitionMemberRole.deleteMany({
      where: { memberId: membership.id, role: "COMPETITOR" },
    })
    const remainingRoles = await tx.competitionMemberRole.count({
      where: { memberId: membership.id },
    })
    if (remainingRoles === 0) {
      await tx.competitionMember.delete({ where: { id: membership.id } })
    }
  }
}
