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

export async function GET(
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
        mandateOverride: true,
        mandateOpensAt: true,
        mandateClosesAt: true,
        mandateFinalizedAt: true,
      },
    }),
    prisma.team.findMany({
      where: { competitionId },
      include: {
        members: {
          select: {
            id: true,
            name: true,
            role: true,
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
      },
      orderBy: [{ submittedAt: "asc" }, { createdAt: "asc" }],
    }),
  ])

  if (!competition) {
    return NextResponse.json({ error: "Võistlust ei leitud" }, { status: 404 })
  }

  return NextResponse.json({
    competition: {
      ...competition,
      registrationStatus: getCompetitionRegistrationStatus(competition),
      mandateStatus: getCompetitionMandateStatus(competition),
    },
    applications: applications.map(({ fieldValues, ...application }) => ({
      ...application,
      details: fieldValues
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
    legacyTeams: teams.map(({ formValues, ...team }) => ({
      ...team,
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
