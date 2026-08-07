import { Prisma } from "@prisma/client"
import { NextResponse } from "next/server"
import {
  applicationStatusAfterSubmission,
  isApprovalMode,
} from "@/lib/approvalModes"
import { auth } from "@/lib/auth"
import { getCompetitionRegistrationStatus } from "@/lib/competitionPhases"
import { prisma } from "@/lib/prisma"
import { recalculateRegistrationAllocation } from "@/lib/registrationAllocation.server"
import {
  RegistrationClassError,
  resolveRegistrationClass,
} from "@/lib/registrationClasses"
import {
  serializeFormAnswer,
  toFormFieldDefinition,
  validateFormAnswers,
} from "@/lib/registrationForm"

class RegistrationValidationError extends Error {}

async function createApplication(
  competitionId: string,
  submittedById: string,
  teamName: string,
  requestedClassId: string | null,
  rawAnswers: unknown
) {
  return prisma.$transaction(
    async (tx) => {
      const competition = await tx.competition.findUnique({
        where: { id: competitionId },
        select: {
          id: true,
          isPublic: true,
          status: true,
          registrationOverride: true,
          registrationOpensAt: true,
          registrationClosesAt: true,
          registrationFinalizedAt: true,
          registrationCapacity: true,
          registrationApprovalMode: true,
          registrationClasses: {
            where: { isActive: true },
            orderBy: [{ order: "asc" }, { name: "asc" }],
            select: { id: true },
          },
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
      })
      if (
        !competition ||
        !competition.isPublic ||
        ["CANCELLED", "ARCHIVED", "FINISHED"].includes(competition.status)
      ) {
        throw new Error("Võistlus pole registreerimiseks saadaval")
      }
      if (getCompetitionRegistrationStatus(competition) !== "OPEN") {
        throw new Error("Registreerimine ei ole avatud")
      }
      const classId = resolveRegistrationClass(
        competition.registrationClasses.map(({ id }) => id),
        requestedClassId
      )

      const formFields = competition.registrationFormFields.map(
        toFormFieldDefinition
      )
      const validated = validateFormAnswers(
        formFields,
        rawAnswers,
        "REGISTRATION"
      )
      const firstError = Object.entries(validated.errors)[0]
      if (firstError) {
        const field = formFields.find(({ key }) => key === firstError[0])
        throw new RegistrationValidationError(
          `${field?.label ?? "Vormiväli"}: ${firstError[1]}`
        )
      }

      const now = new Date()
      const approvalMode = isApprovalMode(competition.registrationApprovalMode)
        ? competition.registrationApprovalMode
        : "AUTOMATIC"
      const initialStatus = applicationStatusAfterSubmission(approvalMode)
      const created = await tx.registrationApplication.create({
        data: {
          competitionId,
          submittedById,
          teamName,
          classId,
          status: initialStatus,
          submittedAt: now,
          decidedAt: null,
          fieldValues: {
            create: Object.entries(validated.answers).map(([key, value]) => {
              const field = competition.registrationFormFields.find(
                (item) => item.key === key
              )
              if (!field) {
                throw new RegistrationValidationError(
                  "Vorm sisaldab tundmatut välja"
                )
              }
              return {
                fieldId: field.id,
                value: serializeFormAnswer(value),
              }
            }),
          },
          events: {
            create: {
              toStatus: initialStatus,
              actorId: submittedById,
              note:
                approvalMode === "AUTOMATIC"
                  ? "Saadetud automaatsesse kohtade jaotusse"
                  : "Saadetud korraldajale kinnitamiseks",
            },
          },
        },
        select: { id: true },
      })
      if (approvalMode === "AUTOMATIC") {
        await recalculateRegistrationAllocation(tx, competitionId, {
          actorId: submittedById,
          eventNote: "Registreerimise järel arvutatud koht",
        })
      }
      return tx.registrationApplication.findUniqueOrThrow({
        where: { id: created.id },
        include: { class: { select: { id: true, name: true } } },
      })
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  )
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Registreerimiseks logi sisse" }, { status: 401 })
  }

  const { id } = await params
  const body = await req.json()
  const teamName = typeof body.teamName === "string" ? body.teamName.trim() : ""
  const classId =
    typeof body.classId === "string" && body.classId ? body.classId : null
  if (!teamName || teamName.length > 200) {
    return NextResponse.json(
      { error: "Võistkonna nimi on kohustuslik ja võib olla kuni 200 tähemärki" },
      { status: 400 }
    )
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const application = await createApplication(
        id,
        session.user.id,
        teamName,
        classId,
        body.answers
      )
      return NextResponse.json(application)
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034" &&
        attempt < 2
      ) {
        continue
      }
      const message =
        error instanceof Error ? error.message : "Registreerimine ebaõnnestus"
      return NextResponse.json(
        { error: message },
        {
          status:
            error instanceof RegistrationValidationError ||
            error instanceof RegistrationClassError
              ? 400
              : 409,
        }
      )
    }
  }

  return NextResponse.json(
    { error: "Registreerimine ebaõnnestus, proovi uuesti" },
    { status: 409 }
  )
}
