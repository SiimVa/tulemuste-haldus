import { Prisma } from "@prisma/client"

type TransactionClient = Prisma.TransactionClient

export type LinkableTeamMember = {
  name: string
  role: string
  email?: string
  isCaptain?: boolean
  assignmentRole?: string
}

export type ResolvedTeamMember = {
  name: string
  role: string
  email: string | null
  userId: string | null
  isCaptain: boolean
  assignmentRole: string | null
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
    email: normalizeEmail(member.email) || null,
    userId: userByEmail.get(normalizeEmail(member.email)) ?? null,
    isCaptain: Boolean(member.isCaptain),
    assignmentRole: member.assignmentRole?.trim() || null,
  }))
  const submittedEmails = resolved.flatMap(({ email }) =>
    email ? [email] : []
  )
  const userIds = resolved.flatMap(({ userId }) => (userId ? [userId] : []))

  if (new Set(submittedEmails).size !== submittedEmails.length) {
    throw new TeamMemberAccountConflictError(
      "Sama e-posti aadressi ei saa võistkonda mitu korda lisada"
    )
  }
  if (new Set(userIds).size !== userIds.length) {
    throw new TeamMemberAccountConflictError(
      "Sama kasutajakontot ei saa lisada võistkonda mitu korda"
    )
  }
  if (submittedEmails.length === 0 && userIds.length === 0) return resolved

  const conflict = await tx.teamMember.findFirst({
    where: {
      competitionId,
      ...(teamId ? { teamId: { not: teamId } } : {}),
      OR: [
        ...(submittedEmails.length > 0
          ? [{ email: { in: submittedEmails } }]
          : []),
        ...(userIds.length > 0 ? [{ userId: { in: userIds } }] : []),
      ],
    },
    select: {
      email: true,
      user: { select: { email: true } },
      team: { select: { name: true } },
    },
  })
  if (conflict) {
    throw new TeamMemberAccountConflictError(
      `E-post ${conflict.user?.email ?? conflict.email ?? ""} on sellel võistlusel juba võistkonna „${conflict.team.name}” juures kasutusel`
    )
  }

  return resolved
}

export async function linkPendingTeamMembersToUser(
  tx: TransactionClient,
  user: { id: string; email: string }
) {
  const email = normalizeEmail(user.email)
  if (!email) return 0

  const pendingMembers = await tx.teamMember.findMany({
    where: { email, userId: null },
    select: { id: true, competitionId: true },
  })
  const linkedCompetitionIds: string[] = []

  for (const pendingMember of pendingMembers) {
    const existingMembership = await tx.teamMember.findFirst({
      where: {
        competitionId: pendingMember.competitionId,
        userId: user.id,
      },
      select: { id: true },
    })
    if (existingMembership) continue

    await tx.teamMember.update({
      where: { id: pendingMember.id },
      data: { userId: user.id },
    })
    linkedCompetitionIds.push(pendingMember.competitionId)
  }

  for (const competitionId of new Set(linkedCompetitionIds)) {
    await ensureCompetitorRoles(tx, competitionId, [user.id])
  }

  return linkedCompetitionIds.length
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
