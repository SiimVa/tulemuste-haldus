import { prisma } from "@/lib/prisma"
import { toFormFieldDefinition, type FormPhase } from "./registrationForm"
import { buildRegistrationReport } from "./registrationReport"

export async function getRegistrationReport(competitionId: string, phase: FormPhase) {
  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: { name: true, registrationFormFields: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] } },
  })
  if (!competition) return null
  const [applications, teams] = await Promise.all([
    prisma.registrationApplication.findMany({
      where: { competitionId }, orderBy: [{ submittedAt: "asc" }, { createdAt: "asc" }],
      select: {
        pendingRepresentativeName: true, pendingRepresentativeEmail: true,
        id: true, teamName: true, status: true, teamId: true, submittedAt: true, waitlistPosition: true, allocationReason: true,
        class: { select: { name: true } }, team: { select: { code: true } },
        representative: { select: { name: true, email: true } },
        submittedBy: { select: { name: true, email: true } }, fieldValues: { select: { fieldId: true, value: true } },
      },
    }),
    prisma.team.findMany({
      where: { competitionId }, orderBy: { code: "asc" },
      select: {
        pendingRepresentativeName: true, pendingRepresentativeEmail: true,
        id: true, code: true, name: true, class: true,
        registrationStatus: true, registrationSubmittedAt: true, registrationReviewNote: true,
        mandateStatus: true, mandateSubmittedAt: true, mandateReviewNote: true,
        representative: { select: { member: { select: { user: { select: { name: true, email: true } } } } } },
        formValues: { select: { fieldId: true, value: true } },
        members: { orderBy: { name: "asc" }, select: { name: true, email: true, role: true, isCaptain: true, assignmentRole: true } },
      },
    }),
  ])
  return buildRegistrationReport({ name: competition.name, phase, fields: competition.registrationFormFields.map(toFormFieldDefinition), applications, teams })
}
