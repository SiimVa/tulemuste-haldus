import { Prisma } from "@prisma/client"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { canManageTeamRegistration } from "@/lib/competitionAccess"
import { getCompetitionMandateStatus } from "@/lib/competitionPhases"
import { prisma } from "@/lib/prisma"
import {
  type FormAnswers,
  type MemberAnswer,
  parseFormAnswer,
  serializeFormAnswer,
  toFormFieldDefinition,
  validateFormAnswers,
} from "@/lib/registrationForm"
import {
  canEditMandate,
  canEditWorkflow,
  isTeamWorkflowPhase,
  isTeamWorkflowStatus,
} from "@/lib/teamWorkflow"
import {
  cleanupCompetitorRoles,
  ensureCompetitorRoles,
  resolveTeamMemberAccounts,
  TeamMemberAccountConflictError,
} from "@/lib/teamMemberAccounts.server"
import {
  parseTeamMemberRoles,
  validateTeamMemberAssignments,
} from "@/lib/teamComposition"

const teamInclude = {
  members: {
    select: {
      id: true,
      name: true,
      role: true,
      email: true,
      userId: true,
      isCaptain: true,
      assignmentRole: true,
      user: { select: { id: true, name: true } },
    },
    orderBy: { name: "asc" as const },
  },
  competition: {
    select: {
      id: true,
      name: true,
      date: true,
      endDate: true,
      location: true,
      status: true,
      registrationFinalizedAt: true,
      mandateOverride: true,
      mandateOpensAt: true,
      mandateClosesAt: true,
      mandateFinalizedAt: true,
      representativeRequired: true,
      captainRequired: true,
      teamMemberRoles: true,
      registrationFormFields: {
        where: { isActive: true },
        orderBy: [{ order: "asc" as const }, { createdAt: "asc" as const }],
        select: {
          id: true,
          key: true,
          label: true,
          helpText: true,
          type: true,
          semanticKey: true,
          options: true,
          memberFields: true,
          showInRegistration: true,
          requiredInRegistration: true,
          showInMandate: true,
          requiredInMandate: true,
          editableInMandate: true,
          conditionFieldKey: true,
          conditionOperator: true,
          conditionValue: true,
          order: true,
        },
      },
    },
  },
  formValues: {
    select: { fieldId: true, value: true },
  },
  representative: { select: { id: true } },
  registrationApplication: { select: { id: true } },
} satisfies Prisma.TeamInclude

type TeamWithForm = Prisma.TeamGetPayload<{ include: typeof teamInclude }>

function responseTeam(team: TeamWithForm) {
  const fields = team.competition.registrationFormFields.map(
    toFormFieldDefinition
  )
  const fieldById = new Map(
    team.competition.registrationFormFields.map((field) => [field.id, field])
  )
  const formValues: FormAnswers = {}
  for (const storedValue of team.formValues) {
    const field = fieldById.get(storedValue.fieldId)
    const value = parseFormAnswer(storedValue.value)
    if (field && value !== undefined) formValues[field.key] = value
  }
  const {
    registrationFormFields,
    teamMemberRoles,
    representativeRequired,
    captainRequired,
    ...competition
  } = team.competition
  void registrationFormFields
  return {
    ...team,
    competition,
    formFields: fields,
    formValues,
    composition: {
      representativeRequired,
      captainRequired,
      memberRoles: parseTeamMemberRoles(teamMemberRoles),
    },
    mandatePhaseStatus: getCompetitionMandateStatus(team.competition),
  }
}

async function getAssignedTeam(
  teamId: string,
  actor: { id: string; role?: string | null }
) {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: teamInclude,
  })
  if (!team) return null

  const allowed = await canManageTeamRegistration(
    team.competitionId,
    team.id,
    actor
  )
  return allowed ? team : false
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { teamId } = await params
  const team = await getAssignedTeam(teamId, {
    id: session.user.id,
    role: session.user.role,
  })

  if (team === null) {
    return NextResponse.json({ error: "Võistkonda ei leitud" }, { status: 404 })
  }
  if (team === false) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  }

  return NextResponse.json(responseTeam(team))
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { teamId } = await params
  const actor = { id: session.user.id, role: session.user.role }
  const team = await getAssignedTeam(teamId, actor)

  if (team === null) {
    return NextResponse.json({ error: "Võistkonda ei leitud" }, { status: 404 })
  }
  if (team === false) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  }
  if (team.competition.status !== "SETUP") {
    return NextResponse.json(
      { error: "Aktiivse või lõppenud võistluse registreerimist ei saa muuta" },
      { status: 409 }
    )
  }

  const body = await req.json()
  if (!isTeamWorkflowPhase(body.phase)) {
    return NextResponse.json({ error: "Vigane töövoo etapp" }, { status: 400 })
  }

  const registrationStatus = isTeamWorkflowStatus(team.registrationStatus)
    ? team.registrationStatus
    : "DRAFT"
  const mandateStatus = isTeamWorkflowStatus(team.mandateStatus)
    ? team.mandateStatus
    : "DRAFT"

  if (body.phase === "REGISTRATION") {
    if (!canEditWorkflow(registrationStatus)) {
      return NextResponse.json(
        { error: "Esitatud või kinnitatud registreerimist ei saa muuta" },
        { status: 409 }
      )
    }

    const name = typeof body.name === "string" ? body.name.trim() : ""
    const teamClass =
      typeof body.class === "string" ? body.class.trim() : ""

    if (!name || name.length > 200 || teamClass.length > 100) {
      return NextResponse.json(
        { error: "Kontrolli võistkonna nime ja klassi" },
        { status: 400 }
      )
    }

    const updated = await prisma.team.update({
      where: { id: teamId },
      data: {
        name,
        class: teamClass || null,
      },
      include: teamInclude,
    })
    return NextResponse.json(responseTeam(updated))
  }

  if (!canEditMandate(registrationStatus, mandateStatus)) {
    return NextResponse.json(
      { error: "Mandaat avaneb pärast registreerimise kinnitamist" },
      { status: 409 }
    )
  }
  if (
    team.registrationApplication &&
    getCompetitionMandateStatus(team.competition) !== "OPEN"
  ) {
    return NextResponse.json(
      { error: "Mandaat ei ole praegu avatud" },
      { status: 409 }
    )
  }

  const formFields = team.competition.registrationFormFields.map(
    toFormFieldDefinition
  )
  const existingAnswers: FormAnswers = {}
  const fieldById = new Map(
    team.competition.registrationFormFields.map((field) => [field.id, field])
  )
  for (const storedValue of team.formValues) {
    const field = fieldById.get(storedValue.fieldId)
    const value = parseFormAnswer(storedValue.value)
    if (field && value !== undefined) existingAnswers[field.key] = value
  }
  const submittedAnswers =
    body.formValues && typeof body.formValues === "object"
      ? (body.formValues as FormAnswers)
      : {}
  const answersForValidation = { ...submittedAnswers }
  for (const field of formFields) {
    if (
      !field.editableInMandate &&
      existingAnswers[field.key] !== undefined
    ) {
      answersForValidation[field.key] = existingAnswers[field.key]
    }
  }
  const validated = validateFormAnswers(
    formFields,
    answersForValidation,
    "MANDATE"
  )
  const firstError = Object.entries(validated.errors)[0]
  if (firstError) {
    const field = formFields.find(({ key }) => key === firstError[0])
    return NextResponse.json(
      { error: `${field?.label ?? "Vormiväli"}: ${firstError[1]}` },
      { status: 400 }
    )
  }

  const memberFieldAnswers = formFields.flatMap((field) => {
    if (field.type !== "MEMBER_LIST") return []
    const value = validated.answers[field.key]
    return Array.isArray(value)
      ? value.filter(
          (member): member is MemberAnswer =>
            typeof member === "object" &&
            member !== null &&
            typeof member.name === "string"
        )
      : []
  })
  const hasMemberField = formFields.some(
    (field) => field.type === "MEMBER_LIST" && field.showInMandate
  )

  if (!Array.isArray(body.members) || body.members.length > 100) {
    if (!hasMemberField) {
      return NextResponse.json(
        { error: "Liikmete nimekiri on vigane või liiga pikk" },
        { status: 400 }
      )
    }
  }

  const legacyMembers = Array.isArray(body.members) ? body.members : []
  const members: {
    name: string
    role: string
    isCaptain: boolean
    assignmentRole: string | undefined
  }[] = legacyMembers
    .map((member: unknown) => {
      const value = member as {
        name?: unknown
        role?: unknown
        isCaptain?: unknown
        assignmentRole?: unknown
      }
      const name =
        typeof value.name === "string" ? value.name.trim() : ""
      const role = value.role === "SUPPORT" ? "SUPPORT" : "COMPETITOR"
      const assignmentRole =
        typeof value.assignmentRole === "string" && value.assignmentRole.trim()
          ? value.assignmentRole.trim()
          : undefined
      return {
        name,
        role,
        isCaptain: Boolean(value.isCaptain),
        assignmentRole,
      }
    })
    .filter((member: { name: string }) => member.name.length > 0)
  const savedMembers = hasMemberField
    ? memberFieldAnswers.map((member) => ({
        name: member.name.trim(),
        role: "COMPETITOR",
        email: member.email,
        isCaptain: Boolean(member.isCaptain),
        assignmentRole: member.assignmentRole,
      }))
    : members.map((member) => ({ ...member, email: undefined }))

  if (
    savedMembers.some((member: { name: string }) => member.name.length > 200)
  ) {
    return NextResponse.json(
      { error: "Liikme nimi on liiga pikk" },
      { status: 400 }
    )
  }

  const composition = {
    representativeRequired: team.competition.representativeRequired,
    captainRequired: team.competition.captainRequired,
    memberRoles: parseTeamMemberRoles(team.competition.teamMemberRoles),
  }
  const assignmentError = validateTeamMemberAssignments(
    savedMembers,
    composition
  )
  if (assignmentError) {
    return NextResponse.json({ error: assignmentError }, { status: 400 })
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const resolvedMembers = await resolveTeamMemberAccounts(
        tx,
        team.competitionId,
        team.id,
        savedMembers
      )
      const previousUserIds = team.members.flatMap(({ userId }) =>
        userId ? [userId] : []
      )
      await tx.teamMember.deleteMany({ where: { teamId } })
      if (resolvedMembers.length > 0) {
        await tx.teamMember.createMany({
          data: resolvedMembers.map((member) => ({
            teamId,
            competitionId: team.competitionId,
            name: member.name,
            role: member.role,
            email: member.email,
            userId: member.userId,
            isCaptain: member.isCaptain,
            assignmentRole: member.assignmentRole,
          })),
        })
      }
      const nextUserIds = resolvedMembers.flatMap(({ userId }) =>
        userId ? [userId] : []
      )
      await ensureCompetitorRoles(tx, team.competitionId, nextUserIds)
      await cleanupCompetitorRoles(
        tx,
        team.competitionId,
        previousUserIds.filter((userId) => !nextUserIds.includes(userId))
      )

      const activeFieldIds = new Map(
        team.competition.registrationFormFields.map((field) => [
          field.key,
          field.id,
        ])
      )
      for (const [key, value] of Object.entries(validated.answers)) {
        const fieldId = activeFieldIds.get(key)
        if (!fieldId) continue
        await tx.teamFormFieldValue.upsert({
          where: { teamId_fieldId: { teamId, fieldId } },
          create: {
            teamId,
            fieldId,
            value: serializeFormAnswer(value),
          },
          update: { value: serializeFormAnswer(value) },
        })
      }
      const retainedFieldIds = Object.keys(validated.answers)
        .map((key) => activeFieldIds.get(key))
        .filter((fieldId): fieldId is string => Boolean(fieldId))
      await tx.teamFormFieldValue.deleteMany({
        where: {
          teamId,
          fieldId: {
            in: team.competition.registrationFormFields
              .map(({ id }) => id)
              .filter((id) => !retainedFieldIds.includes(id)),
          },
        },
      })

      return tx.team.update({
        where: { id: teamId },
        data: { workflowUpdatedAt: new Date() },
        include: teamInclude,
      })
    })

    return NextResponse.json(responseTeam(updated))
  } catch (error) {
    if (error instanceof TeamMemberAccountConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    throw error
  }
}
