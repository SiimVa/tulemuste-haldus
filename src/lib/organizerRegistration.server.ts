import { Prisma } from "@prisma/client"
import { prisma } from "./prisma"
import { getCompetitionRegistrationStatus } from "./competitionPhases"
import { organizerRegistrationFields } from "./organizerRegistration"
import { resolveRegistrationClass } from "./registrationClasses"
import { parseFormAnswer, serializeFormAnswer, toFormFieldDefinition, validateFormAnswers, type MemberAnswer } from "./registrationForm"
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
      ? await tx.registrationApplication.findFirst({ where: { id: body.applicationId, competitionId }, include: { fieldValues: true } }) : null
    const team = typeof body.teamId === "string"
      ? await tx.team.findFirst({ where: { id: body.teamId, competitionId }, include: { formValues: true, members: true } }) : null
    if ((body.applicationId && !application) || (body.teamId && !team)) throw new OrganizerRegistrationError("Registreeringut ei leitud", 404)
    if (application && (application.teamId || competition.registrationFinalizedAt)) throw new OrganizerRegistrationError("Muuda kinnitatud võistkonna andmeid mandaadi jaotises", 409)
    if (application && ["REJECTED", "WITHDRAWN"].includes(application.status)) throw new OrganizerRegistrationError("Seda avaldust ei saa enam muuta", 409)

    const classId = resolveRegistrationClass(competition.registrationClasses.map((item) => item.id), typeof body.classId === "string" ? body.classId : null)
    const teamClass = competition.registrationClasses.find((item) => item.id === classId)?.name ?? (typeof body.className === "string" ? body.className.trim().slice(0, 200) || null : team?.class ?? null)
    const saveTeam = Boolean(team || (!application && competition.registrationFinalizedAt))
    const fields = organizerRegistrationFields(competition.registrationFormFields.map(toFormFieldDefinition), saveTeam)
    const validated = validateFormAnswers(fields, body.answers, "REGISTRATION")
    if (Object.keys(validated.errors).length) throw new OrganizerRegistrationError(Object.entries(validated.errors).map(([key, error]) => `${fields.find((field) => field.key === key)?.label}: ${error}`).join("; "))
    const values = fields.filter((field) => field.id).map((field) => ({
      fieldId: field.id!,
      // Clear hidden answers so that they cannot affect allocation or exports.
      value: serializeFormAnswer(validated.answers[field.key] ?? (field.type === "MEMBER_LIST" || field.type === "MULTISELECT" ? [] : "")),
    }))

    if (!saveTeam) {
      const data = { teamName: name, classId }
      const saved = application
        ? await tx.registrationApplication.update({ where: { id: application.id }, data })
        : await tx.registrationApplication.create({ data: {
            ...data, competitionId, submittedById: actorId, status: "CONFIRMED", submittedAt: new Date(), decidedAt: new Date(), allocationReason: "Korraldaja lisatud",
          } })
      for (const value of values) {
        await tx.registrationApplicationFieldValue.upsert({
          where: { applicationId_fieldId: { applicationId: saved.id, fieldId: value.fieldId } },
          create: { applicationId: saved.id, ...value }, update: { value: value.value },
        })
      }
      await tx.registrationApplicationEvent.create({ data: {
        applicationId: saved.id, actorId, fromStatus: application?.status ?? null, toStatus: saved.status,
        note: application ? "Korraldaja muutis registreeringut" : "Korraldaja lisas võistkonna",
      } })
      if (competition.registrationApprovalMode === "AUTOMATIC" && getCompetitionRegistrationStatus(competition) === "OPEN") {
        await recalculateRegistrationAllocation(tx, competitionId, { actorId })
      }
      return { applicationId: saved.id }
    }

    let savedTeam = team
    if (!savedTeam) {
      const codes = new Set((await tx.team.findMany({ where: { competitionId }, select: { code: true } })).map((item) => item.code))
      let sequence = 1
      while (codes.has(`REG-${String(sequence).padStart(3, "0")}`)) sequence++
      savedTeam = await tx.team.create({ data: {
        competitionId, name, class: teamClass, code: `REG-${String(sequence).padStart(3, "0")}`,
        registrationStatus: "APPROVED", registrationReviewedAt: new Date(),
      }, include: { formValues: true, members: true } })
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
    return { teamId: savedTeam.id }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}
