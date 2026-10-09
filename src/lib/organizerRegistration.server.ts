import { applicationRepresentativeIdentity, teamRepresentativeIdentity } from "./representativeIdentity"
import { REPRESENTATIVE_FORM_FIELD_KEYS } from "./registrationForm"
import { setTeamRepresentative, syncRepresentativeAnswers, notifyRepresentativeAssignment } from "./teamRepresentatives.server"
import { Prisma } from "@prisma/client"
import { prisma } from "./prisma"
import { getCompetitionRegistrationStatus } from "./competitionPhases"
import { organizerRegistrationFields } from "./organizerRegistration"
import { resolveRegistrationClass } from "./registrationClasses"
import { withRepresentativeIdentity, parseFormAnswer, serializeFormAnswer, toFormFieldDefinition, validateFormAnswers, type MemberAnswer } from "./registrationForm"
import { cleanupCompetitorRoles, ensureCompetitorRoles, resolveTeamMemberAccounts } from "./teamMemberAccounts.server"
import { recalculateRegistrationAllocation } from "./registrationAllocation.server"

export class OrganizerRegistrationError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

export async function saveOrganizerRegistration(competitionId: string, actorId: string, body: Record<string, unknown>) {
  const name = typeof body.teamName === "string" ? body.teamName.trim() : ""
  if (!name || name.length > 200) throw new OrganizerRegistrationError("Sisesta võistkonna nimi (kuni 200 tähemärki)")
  if (body.applicationId !== undefined && (typeof body.applicationId !== "string" || !body.applicationId)) throw new OrganizerRegistrationError("Vigane avaldus")
  if (body.teamId !== undefined && (typeof body.teamId !== "string" || !body.teamId)) throw new OrganizerRegistrationError("Vigane võistkond")
  if (body.applicationId && body.teamId) throw new OrganizerRegistrationError("Vali üks muudetav registreering")
  if (!body.answers || typeof body.answers !== "object" || Array.isArray(body.answers)) throw new OrganizerRegistrationError("Vormi vastused puuduvad")

  return prisma.$transaction(async (tx) => {
    const competition = await tx.competition.findUnique({
      where: { id: competitionId },
      include: { registrationFormFields: { where: { isActive: true } }, registrationClasses: { where: { isActive: true } } },
    })
    if (!competition) throw new OrganizerRegistrationError("Võistlust ei leitud", 404)
    const application = typeof body.applicationId === "string"
      ? await tx.registrationApplication.findFirst({ where: { id: body.applicationId, competitionId }, include: { fieldValues: true, submittedBy: true, representative: true } }) : null
    const team = typeof body.teamId === "string"
      ? await tx.team.findFirst({ where: { id: body.teamId, competitionId }, include: { formValues: true, members: true, representative: { include: { member: { include: { user: true } } } } } }) : null
    if ((body.applicationId && !application) || (body.teamId && !team)) throw new OrganizerRegistrationError("Registreeringut ei leitud", 404)
    if (application && (application.teamId || competition.registrationFinalizedAt)) throw new OrganizerRegistrationError("Muuda kinnitatud võistkonna andmeid mandaadi jaotises", 409)
    if (application && ["REJECTED", "WITHDRAWN"].includes(application.status)) throw new OrganizerRegistrationError("Seda avaldust ei saa enam muuta", 409)

    let representative: { name: string; email: string; userId: string | null } | undefined
    if (body.representative !== undefined) {
      const input = body.representative as { name?: unknown; email?: unknown } | null
      const email = typeof input?.email === "string" ? input.email.trim().toLowerCase() : ""
      const name = typeof input?.name === "string" ? input.name.trim() : ""
      if (!name || name.length > 200 || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new OrganizerRegistrationError("Sisesta esindaja nimi ja korrektne e-post")
      }
      const user = await tx.user.findUnique({ where: { email }, select: { id: true, name: true, email: true } })
      representative = { name: user?.name ?? name, email, userId: user?.id ?? null }
    }
    const pendingRepresentative = representative ? {
      pendingRepresentativeEmail: representative.userId ? null : representative.email,
      pendingRepresentativeName: representative.userId ? null : representative.name,
    } : {}

    const classId = resolveRegistrationClass(competition.registrationClasses.map((item) => item.id), typeof body.classId === "string" ? body.classId : null)
    const teamClass = competition.registrationClasses.find((item) => item.id === classId)?.name ?? (typeof body.className === "string" ? body.className.trim().slice(0, 200) || null : team?.class ?? null)
    const saveTeam = Boolean(team || (!application && competition.registrationFinalizedAt))
    const fields = organizerRegistrationFields(competition.registrationFormFields.map(toFormFieldDefinition), saveTeam)
    const currentIdentity = team ? teamRepresentativeIdentity(team) : application ? applicationRepresentativeIdentity(application) : null
    if (body.expectedRepresentativeEmail !== undefined && body.expectedRepresentativeEmail !== (currentIdentity?.email ?? "")) {
      throw new OrganizerRegistrationError("Esindaja on vahepeal muutunud. Ava võistkonna muutmisvorm uuesti.", 409)
    }
    const rawAnswers = body.answers as Record<string, unknown>
    const identityAnswers = representative ? withRepresentativeIdentity(rawAnswers, representative) : (team || application) ? withRepresentativeIdentity(rawAnswers, currentIdentity ?? { name: "", email: "" }) : rawAnswers
    const validated = validateFormAnswers(fields, identityAnswers, "REGISTRATION")
    if (Object.keys(validated.errors).length) throw new OrganizerRegistrationError(Object.entries(validated.errors).map(([key, error]) => `${fields.find((field) => field.key === key)?.label}: ${error}`).join("; "))
    const values = fields.filter((field) => field.id).map((field) => ({
      fieldId: field.id!,
      // Clear hidden answers so that they cannot affect allocation or exports.
      value: serializeFormAnswer(validated.answers[field.key] ?? (field.type === "MEMBER_LIST" || field.type === "MULTISELECT" ? [] : "")),
    }))

    if (!saveTeam) {
      const data = { teamName: name, classId, ...pendingRepresentative, ...(representative ? { representativeId: representative.userId } : {}) }
      const saved = application
        ? await tx.registrationApplication.update({ where: { id: application.id }, data })
        : await tx.registrationApplication.create({ data: {
            ...data, competitionId, submittedById: actorId, representativeId: representative?.userId ?? (representative ? null : actorId), status: "CONFIRMED", submittedAt: new Date(), decidedAt: new Date(), allocationReason: "Korraldaja lisatud",
          } })
      for (const value of values) {
        await tx.registrationApplicationFieldValue.upsert({
          where: { applicationId_fieldId: { applicationId: saved.id, fieldId: value.fieldId } },
          create: { applicationId: saved.id, ...value }, update: { value: value.value },
        })
      }
      await tx.registrationApplicationEvent.create({ data: {
        applicationId: saved.id, actorId, fromStatus: application?.status ?? null, toStatus: saved.status,
        note: representative ? `Esindaja määratud: ${representative.name}` : application ? "Korraldaja muutis registreeringut" : "Korraldaja lisas võistkonna",
      } })
      if (representative) {
        const identity = { ...representative, id: representative.userId ?? undefined }
        await syncRepresentativeAnswers(tx, { applicationId: saved.id }, identity, String(validated.answers[REPRESENTATIVE_FORM_FIELD_KEYS.phone] ?? ""))
        if (currentIdentity?.email !== identity.email) await notifyRepresentativeAssignment(tx, competitionId, saved.teamName, `/dashboard/registrations/${saved.id}`, identity)
      }
      if (competition.registrationApprovalMode === "AUTOMATIC" && getCompetitionRegistrationStatus(competition) === "OPEN") {
        await recalculateRegistrationAllocation(tx, competitionId, { actorId })
      }
      return { applicationId: saved.id, representativePending: Boolean(saved.pendingRepresentativeEmail) }
    }

    let savedTeam = team
    if (!savedTeam) {
      const codes = new Set((await tx.team.findMany({ where: { competitionId }, select: { code: true } })).map((item) => item.code))
      let sequence = 1
      while (codes.has(`REG-${String(sequence).padStart(3, "0")}`)) sequence++
      savedTeam = await tx.team.create({ data: {
        competitionId, name, class: teamClass, code: `REG-${String(sequence).padStart(3, "0")}`,
        registrationStatus: "APPROVED", registrationReviewedAt: new Date(),
      }, include: { formValues: true, members: true, representative: { include: { member: { include: { user: true } } } } } })
    } else {
      await tx.team.update({ where: { id: savedTeam.id }, data: { name, class: teamClass } })
    }
    const memberFieldIds = new Set(fields.filter((field) => field.type === "MEMBER_LIST").map((field) => field.id))
    const membersChanged = values.some((value) => memberFieldIds.has(value.fieldId) && value.value !== savedTeam.formValues.find((existing) => existing.fieldId === value.fieldId)?.value)
    if (membersChanged) {
      const members = values.filter((value) => memberFieldIds.has(value.fieldId)).flatMap((value) => {
        const parsed = parseFormAnswer(value.value)
        return Array.isArray(parsed) ? parsed as MemberAnswer[] : []
      })
      const resolved = await resolveTeamMemberAccounts(tx, competitionId, savedTeam.id, [
        ...members.map((member) => ({ ...member, role: "COMPETITOR" })),
        ...savedTeam.members.filter((member) => member.role === "SUPPORT").map((member) => ({ ...member, email: member.email ?? undefined, assignmentRole: member.assignmentRole ?? undefined })),
      ])
      await tx.teamMember.deleteMany({ where: { teamId: savedTeam.id } })
      if (resolved.length) await tx.teamMember.createMany({ data: resolved.map((member) => ({ ...member, teamId: savedTeam!.id, competitionId })) })
      await ensureCompetitorRoles(tx, competitionId, resolved.flatMap((member) => member.userId ? [member.userId] : []))
      await cleanupCompetitorRoles(tx, competitionId, savedTeam.members.flatMap((member) => member.userId ? [member.userId] : []))
    }
    for (const value of values) {
      await tx.teamFormFieldValue.upsert({
        where: { teamId_fieldId: { teamId: savedTeam.id, fieldId: value.fieldId } },
        create: { teamId: savedTeam.id, ...value }, update: { value: value.value },
      })
    }
    if (representative) await setTeamRepresentative(tx, competitionId, savedTeam.id, representative.userId, {
      pending: representative.userId ? undefined : representative, actorId,
      phone: String(validated.answers[REPRESENTATIVE_FORM_FIELD_KEYS.phone] ?? ""),
    })
    return { teamId: savedTeam.id, representativePending: representative ? !representative.userId : Boolean(savedTeam.pendingRepresentativeEmail) }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}
