import { Prisma } from "@prisma/client"
import { NextResponse } from "next/server"
import {
  applicationStatusAfterSubmission,
  isApprovalMode,
} from "@/lib/approvalModes"
import { auth } from "@/lib/auth"
import { getCompetitionRegistrationStatus } from "@/lib/competitionPhases"
import { prisma } from "@/lib/prisma"
import {
  recalculateRegistrationAllocation,
  reindexWaitlistPositions,
} from "@/lib/registrationAllocation.server"
import {
  canEditRegistration,
  canWithdrawRegistration,
} from "@/lib/registrationApplications"
import {
  RegistrationClassError,
  resolveRegistrationClass,
} from "@/lib/registrationClasses"
import {
  parseFormAnswer,
  serializeFormAnswer,
  toFormFieldDefinition,
  validateFormAnswers,
} from "@/lib/registrationForm"

class RegistrationUpdateValidationError extends Error {}

function comparableStoredAnswer(value: string | undefined) {
  if (value === undefined) return undefined
  const parsed = parseFormAnswer(value)
  return parsed === undefined ? undefined : serializeFormAnswer(parsed)
}

async function updateApplication(
  applicationId: string,
  userId: string,
  teamName: string,
  requestedClassId: string | null,
  rawAnswers: unknown
) {
  return prisma.$transaction(
    async (tx) => {
      const application = await tx.registrationApplication.findUnique({
        where: { id: applicationId },
        include: {
          fieldValues: {
            select: { fieldId: true, value: true },
          },
          competition: {
            select: {
              registrationOverride: true,
              registrationOpensAt: true,
              registrationClosesAt: true,
              registrationFinalizedAt: true,
              registrationApprovalMode: true,
              registrationClasses: {
                where: { isActive: true },
                orderBy: [{ order: "asc" }, { name: "asc" }],
                select: { id: true },
              },
              registrationFormFields: {
                where: { isActive: true, showInRegistration: true },
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
      if (!application || application.submittedById !== userId) {
        throw new Error("Registreerimisavaldust ei leitud")
      }
      if (
        getCompetitionRegistrationStatus(application.competition) !== "OPEN"
      ) {
        throw new Error("Pärast registreerimise sulgemist võta ühendust korraldajaga")
      }
      if (
        application.competition.registrationFinalizedAt ||
        application.teamId ||
        !canEditRegistration(application.status)
      ) {
        throw new Error("Seda registreerimisavaldust ei saa enam muuta")
      }

      const classId = resolveRegistrationClass(
        application.competition.registrationClasses.map(({ id }) => id),
        requestedClassId
      )
      const formFields =
        application.competition.registrationFormFields.map(
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
        throw new RegistrationUpdateValidationError(
          `${field?.label ?? "Vormiväli"}: ${firstError[1]}`
        )
      }

      const previousValues = new Map(
        application.fieldValues.map(({ fieldId, value }) => [fieldId, value])
      )
      const changedFields: string[] = []
      if (application.teamName !== teamName) {
        changedFields.push("Võistkonna nimi")
      }
      if (application.classId !== classId) {
        changedFields.push("Klass")
      }

      const values = Object.entries(validated.answers).map(([key, value]) => {
        const field = application.competition.registrationFormFields.find(
          (item) => item.key === key
        )
        if (!field) {
          throw new RegistrationUpdateValidationError(
            "Vorm sisaldab tundmatut välja"
          )
        }
        const serialized = serializeFormAnswer(value)
        if (comparableStoredAnswer(previousValues.get(field.id)) !== serialized) {
          changedFields.push(field.label)
        }
        previousValues.delete(field.id)
        return { fieldId: field.id, value: serialized }
      })
      for (const field of application.competition.registrationFormFields) {
        if (previousValues.has(field.id)) {
          changedFields.push(field.label)
        }
      }

      if (changedFields.length === 0) {
        return tx.registrationApplication.findUniqueOrThrow({
          where: { id: application.id },
          include: { class: { select: { id: true, name: true } } },
        })
      }

      const activeFieldIds =
        application.competition.registrationFormFields.map(({ id }) => id)
      if (activeFieldIds.length > 0) {
        await tx.registrationApplicationFieldValue.deleteMany({
          where: {
            applicationId: application.id,
            fieldId: { in: activeFieldIds },
          },
        })
      }
      if (values.length > 0) {
        await tx.registrationApplicationFieldValue.createMany({
          data: values.map((value) => ({
            applicationId: application.id,
            ...value,
          })),
        })
      }

      const approvalMode = isApprovalMode(
        application.competition.registrationApprovalMode
      )
        ? application.competition.registrationApprovalMode
        : "AUTOMATIC"
      const nextStatus = applicationStatusAfterSubmission(approvalMode)
      await tx.registrationApplication.update({
        where: { id: application.id },
        data: {
          teamName,
          classId,
          status: nextStatus,
          allocationReason: null,
          waitlistPosition: null,
          decidedAt: null,
          events: {
            create: {
              fromStatus: application.status,
              toStatus: nextStatus,
              actorId: userId,
              note: `Muudetud väljad: ${Array.from(
                new Set(changedFields)
              ).join(", ")}`,
            },
          },
        },
      })

      if (approvalMode === "AUTOMATIC") {
        await recalculateRegistrationAllocation(tx, application.competitionId, {
          actorId: userId,
          eventNote: "Registreeringu muutmise järel arvutatud koht",
        })
      } else {
        await reindexWaitlistPositions(tx, application.competitionId)
      }

      return tx.registrationApplication.findUniqueOrThrow({
        where: { id: application.id },
        include: { class: { select: { id: true, name: true } } },
      })
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  )
}

async function withdrawApplication(applicationId: string, userId: string) {
  return prisma.$transaction(
    async (tx) => {
      const application = await tx.registrationApplication.findUnique({
        where: { id: applicationId },
        include: {
          competition: {
            select: {
              registrationOverride: true,
              registrationOpensAt: true,
              registrationClosesAt: true,
              registrationFinalizedAt: true,
              registrationApprovalMode: true,
            },
          },
        },
      })
      if (!application || application.submittedById !== userId) {
        throw new Error("Registreerimisavaldust ei leitud")
      }
      if (getCompetitionRegistrationStatus(application.competition) !== "OPEN") {
        throw new Error("Pärast registreerimise sulgemist võta ühendust korraldajaga")
      }
      if (!canWithdrawRegistration(application.status)) {
        throw new Error("Sellest registreerimisavaldusest ei saa loobuda")
      }

      const now = new Date()
      const updated = await tx.registrationApplication.update({
        where: { id: application.id },
        data: {
          status: "WITHDRAWN",
          allocationReason: null,
          waitlistPosition: null,
          withdrawnAt: now,
          events: {
            create: {
              fromStatus: application.status,
              toStatus: "WITHDRAWN",
              actorId: userId,
            },
          },
        },
      })

      const approvalMode = isApprovalMode(
        application.competition.registrationApprovalMode
      )
        ? application.competition.registrationApprovalMode
        : "AUTOMATIC"
      let promotedId: string | null = null
      if (approvalMode === "AUTOMATIC") {
        const allocation = await recalculateRegistrationAllocation(
          tx,
          application.competitionId,
          {
            actorId: userId,
            eventNote: "Loobumise järel arvutatud koht",
          }
        )
        promotedId =
          allocation.transitions.find(
            ({ toStatus }) => toStatus === "CONFIRMED"
          )?.id ?? null
      } else {
        await reindexWaitlistPositions(tx, application.competitionId)
      }

      return { application: updated, promotedId }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  )
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { id } = await params

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return NextResponse.json(await withdrawApplication(id, session.user.id))
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034" &&
        attempt < 2
      ) {
        continue
      }
      const message =
        error instanceof Error ? error.message : "Loobumine ebaõnnestus"
      return NextResponse.json({ error: message }, { status: 409 })
    }
  }

  return NextResponse.json({ error: "Loobumine ebaõnnestus" }, { status: 409 })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
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
      const application = await updateApplication(
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
        error instanceof Error ? error.message : "Muutmine ebaõnnestus"
      return NextResponse.json(
        { error: message },
        {
          status:
            error instanceof RegistrationUpdateValidationError ||
            error instanceof RegistrationClassError
              ? 400
              : 409,
        }
      )
    }
  }

  return NextResponse.json(
    { error: "Muutmine ebaõnnestus, proovi uuesti" },
    { status: 409 }
  )
}
