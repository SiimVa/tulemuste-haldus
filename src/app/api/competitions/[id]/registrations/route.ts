import { setSecurityTargets } from "@/lib/security.server"
import { organizerTeamAnswers } from "@/lib/organizerRegistration"
import { saveOrganizerRegistration, OrganizerRegistrationError } from "@/lib/organizerRegistration.server"
import { RegistrationClassError } from "@/lib/registrationClasses"
import { TeamMemberAccountConflictError } from "@/lib/teamMemberAccounts.server"
import { deliverPendingNotificationsSafely } from "@/lib/notifications.server"
import { parseTeamMemberRoles } from "@/lib/teamComposition"
import { withSecurityRoute } from "@/lib/securityRoute.server"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { canAccessCompetition } from "@/lib/competitionAccess"
import {
  getCompetitionMandateStatus,
  getCompetitionRegistrationStatus,
} from "@/lib/competitionPhases"
import { prisma } from "@/lib/prisma"
import {
  formatFormAnswer,
  parseFormAnswer,
  toFormFieldDefinition,
} from "@/lib/registrationForm"

async function handleGET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id: competitionId } = await params
  const allowed = await canAccessCompetition(competitionId, {
    id: session.user.id,
    role: session.user.role,
  })
  if (!allowed) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  }

  const [competition, teams, applications] = await Promise.all([
    prisma.competition.findUnique({
      where: { id: competitionId },
      select: {
        id: true,
        registrationOverride: true,
        registrationOpensAt: true,
        registrationClosesAt: true,
        registrationFinalizedAt: true,
        registrationCapacity: true,
        registrationApprovalMode: true,
        mandateOverride: true,
        mandateOpensAt: true,
        mandateClosesAt: true,
        mandateFinalizedAt: true,
        mandateApprovalMode: true,
        captainRequired: true,
        representativeRequired: true,
        teamMemberRoles: true,
        registrationClasses: { where: { isActive: true }, orderBy: { order: "asc" }, select: { id: true, name: true } },
        registrationFormFields: {
          where: {
            isActive: true,

          },
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
            memberMinCount: true,
            memberMaxCount: true,
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
    }),
    prisma.team.findMany({
      where: { competitionId },
      include: {
        members: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isCaptain: true,
            assignmentRole: true,
            user: { select: { id: true, name: true } },
          },
          orderBy: { name: "asc" },
        },
        representative: {
          include: {
            member: {
              include: {
                user: { select: { id: true, name: true, email: true } },
              },
            },
          },
        },
        formValues: {
          include: {
            field: {
              select: {
                id: true,
                key: true,
                label: true,
                helpText: true,
                type: true,
                semanticKey: true,
                options: true,
                memberFields: true,
                memberMinCount: true,
                memberMaxCount: true,
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
      orderBy: { code: "asc" },
    }),
    prisma.registrationApplication.findMany({
      where: { competitionId },
      include: {
        class: { select: { id: true, name: true } },
        submittedBy: { select: { id: true, name: true, email: true } },
        team: { select: { id: true, code: true } },
        events: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            fromStatus: true,
            toStatus: true,
            note: true,
            createdAt: true,
            actor: { select: { name: true } },
          },
        },
        fieldValues: {
          include: {
            field: {
              select: {
                id: true,
                key: true,
                label: true,
                helpText: true,
                type: true,
                semanticKey: true,
                options: true,
                memberFields: true,
                memberMinCount: true,
                memberMaxCount: true,
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
      orderBy: [{ submittedAt: "asc" }, { createdAt: "asc" }],
    }),
  ])

  if (!competition) {
    return NextResponse.json({ error: "Võistlust ei leitud" }, { status: 404 })
  }

  const { registrationFormFields, ...competitionData } = competition

  return NextResponse.json({
    competition: {
      ...competitionData,
      registrationStatus: getCompetitionRegistrationStatus(competition),
      mandateStatus: getCompetitionMandateStatus(competition),
    },
    formFields: registrationFormFields.map(toFormFieldDefinition),
    teamComposition: { representativeRequired: competition.representativeRequired, captainRequired: competition.captainRequired, memberRoles: parseTeamMemberRoles(competition.teamMemberRoles) },
    memberFormFields: registrationFormFields.filter((field) => field.showInRegistration && field.type === "MEMBER_LIST").map(toFormFieldDefinition),
    applications: applications.map(({ fieldValues, ...application }) => {
      const sortedValues = fieldValues.sort(
        (a, b) => a.field.order - b.field.order
      )
      return {
        ...application,
        answers: Object.fromEntries(
          sortedValues.flatMap(({ field, value }) => {
            const answer = parseFormAnswer(value)
            return answer === undefined ? [] : [[field.key, answer]]
          })
        ),
        details: sortedValues.map(({ field, value }) => {
          const definition = toFormFieldDefinition(field)
          return {
            fieldId: field.id,
            label: field.label,
            value: formatFormAnswer(definition, parseFormAnswer(value)),
          }
        }),
      }
    }),
    legacyTeams: teams.map(({ formValues, ...team }) => ({
      ...team,
      answers: organizerTeamAnswers(registrationFormFields.map(toFormFieldDefinition), Object.fromEntries(formValues.flatMap(({ field, value }) => {
        const answer = parseFormAnswer(value)
        return answer === undefined ? [] : [[field.key, answer]]
      })), team.members),
      details: formValues
        .sort((a, b) => a.field.order - b.field.order)
        .map(({ field, value }) => {
          const definition = toFormFieldDefinition(field)
          return {
            fieldId: field.id,
            label: field.label,
            value: formatFormAnswer(
              definition,
              parseFormAnswer(value)
            ),
          }
        }),
    })),
  })
}

export const GET = withSecurityRoute("/api/competitions/[id]/registrations", handleGET)


export const POST = withSecurityRoute("/api/competitions/[id]/registrations", async (request, { params }) => {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  if (!await canAccessCompetition(id, { id: session.user.id, role: session.user.role })) return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  try {
    const body = await request.json()
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Vigased andmed" }, { status: 400 })
    const result = await saveOrganizerRegistration(id, session.user.id, body)
    setSecurityTargets(result)
    await deliverPendingNotificationsSafely()
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof OrganizerRegistrationError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof RegistrationClassError || error instanceof TeamMemberAccountConflictError) return NextResponse.json({ error: error.message }, { status: 400 })
    throw error
  }
})
