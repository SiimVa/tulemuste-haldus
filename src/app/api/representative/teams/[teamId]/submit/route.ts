import { NextResponse } from "next/server"
import {
  isApprovalMode,
  workflowStatusAfterSubmission,
} from "@/lib/approvalModes"
import { auth } from "@/lib/auth"
import { canManageTeamRegistration } from "@/lib/competitionAccess"
import { getCompetitionMandateStatus } from "@/lib/competitionPhases"
import { prisma } from "@/lib/prisma"
import {
  type FormAnswers,
  parseFormAnswer,
  toFormFieldDefinition,
  validateFormAnswers,
} from "@/lib/registrationForm"
import {
  canSubmitMandate,
  canSubmitRegistration,
  isTeamWorkflowPhase,
  isTeamWorkflowStatus,
} from "@/lib/teamWorkflow"
import {
  parseTeamMemberRoles,
  validateTeamComposition,
} from "@/lib/teamComposition"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { teamId } = await params
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      members: {
        select: { role: true, isCaptain: true, assignmentRole: true },
      },
      representative: { select: { id: true } },
      formValues: { select: { fieldId: true, value: true } },
      registrationApplication: { select: { id: true } },
      competition: {
        select: {
          status: true,
          registrationFinalizedAt: true,
          registrationApprovalMode: true,
          mandateOverride: true,
          mandateOpensAt: true,
          mandateClosesAt: true,
          mandateFinalizedAt: true,
          mandateApprovalMode: true,
          representativeRequired: true,
          captainRequired: true,
          teamMemberRoles: true,
          registrationFormFields: {
            where: { isActive: true },
            orderBy: [{ order: "asc" }, { createdAt: "asc" }],
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
              purgeAfterCompetition: true,
              order: true,
            },
          },
        },
      },
    },
  })
  if (!team) {
    return NextResponse.json({ error: "Võistkonda ei leitud" }, { status: 404 })
  }

  const allowed = await canManageTeamRegistration(
    team.competitionId,
    team.id,
    { id: session.user.id, role: session.user.role }
  )
  if (!allowed) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  }
  if (team.competition.status !== "SETUP") {
    return NextResponse.json(
      { error: "Aktiivse või lõppenud võistluse andmeid ei saa esitada" },
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
    if (!canSubmitRegistration(registrationStatus)) {
      return NextResponse.json(
        { error: "Registreerimist ei saa selles olekus esitada" },
        { status: 409 }
      )
    }

    const approvalMode = isApprovalMode(
      team.competition.registrationApprovalMode
    )
      ? team.competition.registrationApprovalMode
      : "AUTOMATIC"
    const nextStatus = workflowStatusAfterSubmission(approvalMode)
    const submittedAt = new Date()
    const updated = await prisma.team.update({
      where: { id: teamId },
      data: {
        registrationStatus: nextStatus,
        registrationSubmittedAt: submittedAt,
        registrationReviewedAt:
          approvalMode === "AUTOMATIC" ? submittedAt : null,
        registrationReviewNote: null,
      },
      include: { members: true, competition: true },
    })
    return NextResponse.json(updated)
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
  const fieldById = new Map(
    team.competition.registrationFormFields.map((field) => [field.id, field])
  )
  const formValues: FormAnswers = {}
  for (const storedValue of team.formValues) {
    const field = fieldById.get(storedValue.fieldId)
    const value = parseFormAnswer(storedValue.value)
    if (field && value !== undefined) formValues[field.key] = value
  }
  const validated = validateFormAnswers(formFields, formValues, "MANDATE")
  const firstError = Object.entries(validated.errors)[0]
  if (firstError) {
    const field = formFields.find(({ key }) => key === firstError[0])
    return NextResponse.json(
      { error: `${field?.label ?? "Vormiväli"}: ${firstError[1]}` },
      { status: 400 }
    )
  }

  const competitorCount = team.members.filter(
    (member) => member.role === "COMPETITOR"
  ).length
  if (
    !canSubmitMandate(
      registrationStatus,
      mandateStatus,
      competitorCount
    )
  ) {
    return NextResponse.json(
      {
        error:
          competitorCount === 0
            ? "Mandaadis peab olema vähemalt üks võistleja"
            : "Mandaati ei saa selles olekus esitada",
      },
      { status: 409 }
    )
  }

  const compositionError = validateTeamComposition(
    team.members,
    {
      representativeRequired: team.competition.representativeRequired,
      captainRequired: team.competition.captainRequired,
      memberRoles: parseTeamMemberRoles(team.competition.teamMemberRoles),
    },
    Boolean(team.representative)
  )
  if (compositionError) {
    return NextResponse.json({ error: compositionError }, { status: 409 })
  }

  const approvalMode = isApprovalMode(team.competition.mandateApprovalMode)
    ? team.competition.mandateApprovalMode
    : "MANUAL"
  const nextStatus = workflowStatusAfterSubmission(approvalMode)
  const submittedAt = new Date()
  const updated = await prisma.team.update({
    where: { id: teamId },
    data: {
      mandateStatus: nextStatus,
      mandateSubmittedAt: submittedAt,
      mandateReviewedAt:
        approvalMode === "AUTOMATIC" ? submittedAt : null,
      mandateReviewNote: null,
    },
    include: { members: true, competition: true },
  })
  return NextResponse.json(updated)
}
