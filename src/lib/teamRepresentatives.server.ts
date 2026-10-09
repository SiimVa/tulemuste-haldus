import type { Prisma } from "@prisma/client"
import { parseStoredRoleInvitation, serializeRoleInvitationValues } from "./competitionRoleInvitations"
import { currentRepresentativeAnswers, teamRepresentativeIdentity, type RepresentativeIdentity } from "./representativeIdentity"
import { parseFormAnswer, serializeFormAnswer, REPRESENTATIVE_FORM_FIELD_KEYS, type FormAnswers } from "./registrationForm"
import { queueUserNotification } from "./notifications.server"

type Transaction = Prisma.TransactionClient

export class TeamRepresentativeChangedError extends Error {
  constructor() { super("Võistkonna andmed või esindaja on vahepeal muutunud. Laadi leht uuesti.") }
}

// Lock the row before writing a previously authorized form. An in-flight
// request from the former representative must not overwrite a later transfer.
export async function claimTeamWorkflow(tx: Transaction, team: {
  id: string; workflowUpdatedAt: Date; representative: { memberId: string } | null
}) {
  const updated = await tx.team.updateMany({
    where: {
      id: team.id,
      workflowUpdatedAt: team.workflowUpdatedAt,
      representative: team.representative ? { is: { memberId: team.representative.memberId } } : { is: null },
    },
    data: { workflowUpdatedAt: new Date(Math.max(Date.now(), team.workflowUpdatedAt.getTime() + 1)) },
  })
  if (!updated.count) throw new TeamRepresentativeChangedError()
}

export async function invalidateRepresentativeInvitations(tx: Transaction, competitionId: string, teamId: string, keepEmail?: string) {
  const invitations = await tx.competitionRoleInvitation.findMany({ where: { competitionId, acceptedAt: null, revokedAt: null, ...(keepEmail ? { email: { not: keepEmail } } : {}) } })
  for (const invitation of invitations) {
    const values = parseStoredRoleInvitation(invitation)
    if (!values?.teamIds.includes(teamId)) continue
    values.teamIds = values.teamIds.filter(id => id !== teamId)
    if (!values.teamIds.length) values.roles = values.roles.filter(role => role !== "REPRESENTATIVE")
    await tx.competitionRoleInvitation.update({ where: { id: invitation.id }, data: {
      ...serializeRoleInvitationValues(values), ...(values.roles.length ? {} : { revokedAt: new Date() }),
    } })
  }
}

export async function syncRepresentativeAnswers(tx: Transaction, target: { teamId: string } | { applicationId: string }, identity: RepresentativeIdentity | null, phone?: string) {
  const stored = "teamId" in target
    ? await tx.teamFormFieldValue.findMany({ where: target, include: { field: true } })
    : await tx.registrationApplicationFieldValue.findMany({ where: target, include: { field: true } })
  const answers: FormAnswers = {}
  for (const item of stored) {
    const value = parseFormAnswer(item.value)
    if (value !== undefined) answers[item.field.key] = value
  }
  const current = currentRepresentativeAnswers(answers, identity)
  if (phone !== undefined) current[REPRESENTATIVE_FORM_FIELD_KEYS.phone] = phone
  const owner = "teamId" in target
    ? await tx.team.findUniqueOrThrow({ where: { id: target.teamId }, select: { competitionId: true } })
    : await tx.registrationApplication.findUniqueOrThrow({ where: { id: target.applicationId }, select: { competitionId: true } })
  const fields = await tx.competitionFormField.findMany({ where: { competitionId: owner.competitionId, key: { in: Object.values(REPRESENTATIVE_FORM_FIELD_KEYS) } } })
  for (const field of fields) {
    const value = serializeFormAnswer(current[field.key] ?? "")
    if ("teamId" in target) await tx.teamFormFieldValue.upsert({
      where: { teamId_fieldId: { teamId: target.teamId, fieldId: field.id } },
      create: { teamId: target.teamId, fieldId: field.id, value }, update: { value },
    })
    else await tx.registrationApplicationFieldValue.upsert({
      where: { applicationId_fieldId: { applicationId: target.applicationId, fieldId: field.id } },
      create: { applicationId: target.applicationId, fieldId: field.id, value }, update: { value },
    })
  }
}

export async function notifyRepresentativeAssignment(tx: Transaction, competitionId: string, teamName: string, href: string, identity: RepresentativeIdentity | null) {
  // Cancel queued messages for previous representatives; sent history is retained.
  await tx.notification.updateMany({ where: { competitionId, href, emailStatus: { in: ["PENDING", "FAILED"] }, ...(identity ? { emailTo: { not: identity.email } } : {}) }, data: { emailStatus: "CANCELLED" } })
  if (!identity) return
  const competition = await tx.competition.findUniqueOrThrow({ where: { id: competitionId }, select: { name: true, organizer: { select: { email: true } } } })
  await queueUserNotification(tx, {
    userId: identity.id ?? null, competitionId, emailTo: identity.email, emailReplyTo: competition.organizer?.email,
    type: "REPRESENTATIVE_ASSIGNED", title: "Sind määrati võistkonna esindajaks",
    message: `Oled võistkonna „${teamName}” esindaja võistlusel „${competition.name}”. Võistkonna andmed leiad oma töölaualt.${identity.id ? "" : " Ligipääsu saamiseks logi sisse selle e-posti aadressiga."}`,
    href,
  })
}

export async function setTeamRepresentative(tx: Transaction, competitionId: string, teamId: string, userId: string | null,
  options: { pending?: { name: string; email: string }; phone?: string; actorId?: string; notify?: boolean; cleanup?: boolean } = {},
) {
  const team = await tx.team.findFirstOrThrow({ where: { id: teamId, competitionId }, include: {
    representative: { include: { member: { include: { user: true } } } }, registrationApplication: true,
  } })
  const previous = team.representative
  const oldIdentity = teamRepresentativeIdentity(team)
  const identity = userId ? await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, name: true, email: true } }) : options.pending ?? null
  const changed = (oldIdentity?.id ?? null) !== (identity && "id" in identity ? identity.id : null) || oldIdentity?.email !== identity?.email
  // Explicit assignments supersede old invitations, including a re-confirmation.
  await invalidateRepresentativeInvitations(tx, competitionId, teamId, identity?.email)
  await tx.team.update({ where: { id: teamId }, data: { pendingRepresentativeEmail: options.pending?.email ?? null, pendingRepresentativeName: options.pending?.name ?? null } })
  if (userId) {
    const member = await tx.competitionMember.upsert({ where: { competitionId_userId: { competitionId, userId } }, create: { competitionId, userId }, update: {} })
    await tx.competitionMemberRole.upsert({ where: { memberId_role: { memberId: member.id, role: "REPRESENTATIVE" } }, create: { memberId: member.id, role: "REPRESENTATIVE" }, update: {} })
    await tx.teamRepresentative.upsert({ where: { teamId }, create: { competitionId, teamId, memberId: member.id }, update: { memberId: member.id } })
  } else await tx.teamRepresentative.deleteMany({ where: { competitionId, teamId } })
  if (options.cleanup !== false && previous && !await tx.teamRepresentative.count({ where: { memberId: previous.memberId } })) {
    await tx.competitionMemberRole.deleteMany({ where: { memberId: previous.memberId, role: "REPRESENTATIVE" } })
    await tx.competitionMember.deleteMany({ where: { id: previous.memberId, roles: { none: {} }, representedTeams: { none: {} }, judgedElements: { none: {} } } })
  }
  await syncRepresentativeAnswers(tx, { teamId }, identity, options.phone)
  if (team.registrationApplication) {
    await tx.registrationApplication.update({ where: { id: team.registrationApplication.id }, data: {
      representativeId: userId, pendingRepresentativeEmail: options.pending?.email ?? null, pendingRepresentativeName: options.pending?.name ?? null,
    } })
    if (changed) await tx.notification.updateMany({ where: {
      competitionId, href: `/dashboard/registrations/${team.registrationApplication.id}`,
      emailStatus: { in: ["PENDING", "FAILED"] }, ...(identity ? { emailTo: { not: identity.email } } : {}),
    }, data: { emailStatus: "CANCELLED" } })
    if (changed) await tx.registrationApplicationEvent.create({ data: {
      applicationId: team.registrationApplication.id, actorId: options.actorId ?? null,
      fromStatus: team.registrationApplication.status, toStatus: team.registrationApplication.status,
      note: `Esindaja muudetud: ${oldIdentity?.name ?? "määramata"} → ${identity?.name ?? "määramata"}`,
    } })
  }
  if (changed && options.notify !== false) await notifyRepresentativeAssignment(tx, competitionId, team.name, `/dashboard/representative/teams/${teamId}`, identity)
}

// Pending email alone never grants access: authentication establishes identity.
export async function linkPendingRepresentativesToUser(tx: Transaction, user: { id: string; email: string }) {
  const email = user.email.trim().toLowerCase()
  const identity = await tx.user.findUniqueOrThrow({ where: { id: user.id }, select: { id: true, name: true, email: true } })
  const applications = await tx.registrationApplication.findMany({ where: { pendingRepresentativeEmail: email, teamId: null, status: { notIn: ["REJECTED", "WITHDRAWN"] }, competition: { personalDataPurgedAt: null } } })
  for (const application of applications) {
    const claimed = await tx.registrationApplication.updateMany({ where: { id: application.id, pendingRepresentativeEmail: email, teamId: null }, data: { representativeId: user.id, pendingRepresentativeEmail: null, pendingRepresentativeName: null } })
    if (!claimed.count) continue
    await syncRepresentativeAnswers(tx, { applicationId: application.id }, identity)
    await tx.registrationApplicationEvent.create({ data: { applicationId: application.id, actorId: user.id, fromStatus: application.status, toStatus: application.status, note: "Esindaja kasutajakonto seoti registreeringuga" } })
    await notifyRepresentativeAssignment(tx, application.competitionId, application.teamName, `/dashboard/registrations/${application.id}`, identity)
  }
  const teams = await tx.team.findMany({ where: { pendingRepresentativeEmail: email, representative: null, competition: { personalDataPurgedAt: null } }, select: { id: true, competitionId: true } })
  for (const team of teams) {
    const claimed = await tx.team.updateMany({ where: { id: team.id, pendingRepresentativeEmail: email, representative: null }, data: { workflowUpdatedAt: new Date() } })
    if (claimed.count) await setTeamRepresentative(tx, team.competitionId, team.id, user.id, { actorId: user.id })
  }
}
