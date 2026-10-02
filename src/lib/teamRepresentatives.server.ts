import type { Prisma } from "@prisma/client"

type Transaction = Prisma.TransactionClient

export async function setTeamRepresentative(
  tx: Transaction,
  competitionId: string,
  teamId: string,
  userId: string | null,
) {
  const previous = await tx.teamRepresentative.findUnique({ where: { teamId } })
  if (userId) {
    const member = await tx.competitionMember.upsert({
      where: { competitionId_userId: { competitionId, userId } },
      create: { competitionId, userId }, update: {},
    })
    await tx.competitionMemberRole.upsert({
      where: { memberId_role: { memberId: member.id, role: "REPRESENTATIVE" } },
      create: { memberId: member.id, role: "REPRESENTATIVE" }, update: {},
    })
    await tx.teamRepresentative.upsert({
      where: { teamId },
      create: { competitionId, teamId, memberId: member.id },
      update: { memberId: member.id },
    })
  } else {
    await tx.teamRepresentative.deleteMany({ where: { competitionId, teamId } })
  }
  if (previous && !await tx.teamRepresentative.count({ where: { memberId: previous.memberId } })) {
    await tx.competitionMemberRole.deleteMany({ where: { memberId: previous.memberId, role: "REPRESENTATIVE" } })
    await tx.competitionMember.deleteMany({ where: {
      id: previous.memberId, roles: { none: {} }, representedTeams: { none: {} }, judgedElements: { none: {} },
    } })
  }
}

// Account identity is established by authentication (or administrator account
// creation). A pending email never grants access on its own.
export async function linkPendingRepresentativesToUser(
  tx: Transaction,
  user: { id: string; email: string },
) {
  const email = user.email.trim().toLowerCase()
  const applications = await tx.registrationApplication.findMany({ where: {
    pendingRepresentativeEmail: email, teamId: null,
    status: { notIn: ["REJECTED", "WITHDRAWN"] },
    competition: { personalDataPurgedAt: null },
  }, select: { id: true, status: true } })
  for (const application of applications) {
    const claimed = await tx.registrationApplication.updateMany({
      where: { id: application.id, pendingRepresentativeEmail: email, teamId: null },
      data: { submittedById: user.id, pendingRepresentativeEmail: null, pendingRepresentativeName: null },
    })
    if (claimed.count) await tx.registrationApplicationEvent.create({ data: {
      applicationId: application.id, actorId: user.id,
      fromStatus: application.status, toStatus: application.status,
      note: "Esindaja kasutajakonto seoti registreeringuga",
    } })
  }
  const teams = await tx.team.findMany({ where: {
    pendingRepresentativeEmail: email, representative: null,
    competition: { personalDataPurgedAt: null },
  }, select: { id: true, competitionId: true } })
  for (const team of teams) {
    const claimed = await tx.team.updateMany({
      where: { id: team.id, pendingRepresentativeEmail: email, representative: null },
      data: { pendingRepresentativeEmail: null, pendingRepresentativeName: null },
    })
    if (claimed.count) {
      await setTeamRepresentative(tx, team.competitionId, team.id, user.id)
      await tx.registrationApplication.updateMany({
        where: { teamId: team.id, pendingRepresentativeEmail: email },
        data: { submittedById: user.id, pendingRepresentativeEmail: null, pendingRepresentativeName: null },
      })
    }
  }
}
