import { Prisma } from "@prisma/client"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { canAccessCompetition } from "@/lib/competitionAccess"
import { getCompetitionRegistrationStatus } from "@/lib/competitionPhases"
import { prisma } from "@/lib/prisma"
import { reindexWaitlistPositions } from "@/lib/registrationAllocation.server"
import {
  isFormFieldVisible,
  parseFormAnswer,
  serializeFormAnswer,
  toFormFieldDefinition,
  validateFormAnswers,
  type FormAnswers,
} from "@/lib/registrationForm"

const ACTION_STATUS = {
  CONFIRM: "CONFIRMED",
  WAITLIST: "WAITLISTED",
  REJECT: "REJECTED",
} as const

class RegistrationMemberUpdateError extends Error {}

async function updateApplicationMembers(
  competitionId: string,
  applicationId: string,
  actorId: string,
  rawAnswers: unknown
) {
  const submittedAnswers =
    rawAnswers && typeof rawAnswers === "object" && !Array.isArray(rawAnswers)
      ? (rawAnswers as Record<string, unknown>)
      : {}

  return prisma.$transaction(async (tx) => {
    const application = await tx.registrationApplication.findFirst({
      where: { id: applicationId, competitionId },
      include: {
        fieldValues: {
          include: { field: { select: { key: true } } },
        },
        competition: {
          select: {
            registrationFinalizedAt: true,
            registrationFormFields: {
              where: {
                isActive: true,
                showInRegistration: true,
                type: "MEMBER_LIST",
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
    })
    if (!application) throw new Error("Registreerimisavaldust ei leitud")
    if (application.competition.registrationFinalizedAt || application.teamId) {
      throw new Error(
        "Kinnitatud osalejate nimekirja liikmeid muuda võistkondade lehel"
      )
    }
    if (["WITHDRAWN", "REJECTED"].includes(application.status)) {
      throw new Error("Selle registreerimisavalduse osalejaid ei saa muuta")
    }

    const memberFields =
      application.competition.registrationFormFields.map(
        toFormFieldDefinition
      )
    if (memberFields.length === 0) {
      throw new RegistrationMemberUpdateError(
        "Registreerimisvormil ei ole osalejate välja"
      )
    }

    const existingAnswers: FormAnswers = {}
    const storedValuesByFieldId = new Map<string, string>()
    for (const fieldValue of application.fieldValues) {
      const answer = parseFormAnswer(fieldValue.value)
      if (answer !== undefined) {
        existingAnswers[fieldValue.field.key] = answer
      }
      storedValuesByFieldId.set(fieldValue.fieldId, fieldValue.value)
    }

    const mergedAnswers: Record<string, unknown> = { ...existingAnswers }
    let submittedMemberField = false
    for (const field of memberFields) {
      if (Object.hasOwn(submittedAnswers, field.key)) {
        mergedAnswers[field.key] = submittedAnswers[field.key]
        submittedMemberField = true
      }
    }
    if (!submittedMemberField) {
      throw new RegistrationMemberUpdateError("Osalejate andmed puuduvad")
    }

    const changes: { fieldId: string; label: string; value: string }[] = []
    for (const field of memberFields) {
      if (
        !Object.hasOwn(submittedAnswers, field.key) ||
        !isFormFieldVisible(field, mergedAnswers as FormAnswers)
      ) {
        continue
      }
      const validated = validateFormAnswers(
        [field],
        mergedAnswers,
        "REGISTRATION"
      )
      const validationError = validated.errors[field.key]
      if (validationError) {
        throw new RegistrationMemberUpdateError(
          `${field.label}: ${validationError}`
        )
      }
      const answer = validated.answers[field.key]
      if (answer === undefined) continue
      const value = serializeFormAnswer(answer)
      const previousValue = storedValuesByFieldId.get(field.id ?? "")
      if (previousValue !== value && field.id) {
        changes.push({ fieldId: field.id, label: field.label, value })
      }
    }

    if (changes.length === 0) return application

    for (const change of changes) {
      await tx.registrationApplicationFieldValue.upsert({
        where: {
          applicationId_fieldId: {
            applicationId: application.id,
            fieldId: change.fieldId,
          },
        },
        create: {
          applicationId: application.id,
          fieldId: change.fieldId,
          value: change.value,
        },
        update: { value: change.value },
      })
    }
    await tx.registrationApplicationEvent.create({
      data: {
        applicationId: application.id,
        fromStatus: application.status,
        toStatus: application.status,
        actorId,
        note: `Korraldaja muutis osalejaid: ${changes
          .map(({ label }) => label)
          .join(", ")}`,
      },
    })

    return tx.registrationApplication.findUniqueOrThrow({
      where: { id: application.id },
    })
  })
}

export async function PATCH(
  req: Request,
  {
    params,
  }: { params: Promise<{ id: string; applicationId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const actor = session.user

  const { id: competitionId, applicationId } = await params
  const allowed = await canAccessCompetition(competitionId, {
    id: actor.id,
    role: actor.role,
  })
  if (!allowed) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  }

  const body = await req.json()
  if (body.action === "UPDATE_MEMBERS") {
    try {
      return NextResponse.json(
        await updateApplicationMembers(
          competitionId,
          applicationId,
          actor.id,
          body.answers
        )
      )
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Osalejate muutmine ebaõnnestus"
      return NextResponse.json(
        { error: message },
        {
          status:
            error instanceof RegistrationMemberUpdateError ? 400 : 409,
        }
      )
    }
  }

  let action: keyof typeof ACTION_STATUS
  if (body.action === "CONFIRM") {
    action = "CONFIRM"
  } else if (body.action === "WAITLIST") {
    action = "WAITLIST"
  } else if (body.action === "REJECT") {
    action = "REJECT"
  } else {
    return NextResponse.json({ error: "Vigane otsus" }, { status: 400 })
  }
  const note = typeof body.note === "string" ? body.note.trim() : ""
  if (note.length > 2000) {
    return NextResponse.json({ error: "Märkus on liiga pikk" }, { status: 400 })
  }

  try {
    const updated = await prisma.$transaction(
      async (tx) => {
        const application = await tx.registrationApplication.findFirst({
          where: { id: applicationId, competitionId },
          include: {
            competition: {
              select: {
                registrationOverride: true,
                registrationOpensAt: true,
                registrationClosesAt: true,
                registrationFinalizedAt: true,
              },
            },
          },
        })
        if (!application) throw new Error("Registreerimisavaldust ei leitud")
        if (application.competition.registrationFinalizedAt) {
          throw new Error("Kinnitatud osalejate nimekirja ei saa muuta")
        }
        if (
          getCompetitionRegistrationStatus(application.competition) === "OPEN"
        ) {
          throw new Error(
            "Avatud registreerimise ajal määrab kohad automaatne jaotus"
          )
        }
        if (["WITHDRAWN", "REJECTED"].includes(application.status)) {
          throw new Error("Seda registreerimisavaldust ei saa enam muuta")
        }

        const nextStatus = ACTION_STATUS[action]
        if (application.status === nextStatus) return application

        const now = new Date()
        const result = await tx.registrationApplication.update({
          where: { id: application.id },
          data: {
            status: nextStatus,
            waitlistPosition: null,
            allocationReason:
              nextStatus === "CONFIRMED"
                ? note || "Korraldaja kinnitatud pärast registreerimise lõppu"
                : nextStatus === "WAITLISTED"
                  ? note || "Korraldaja jäetud ootenimekirja"
                  : null,
            decidedAt:
              nextStatus === "CONFIRMED" || nextStatus === "REJECTED"
                ? now
                : null,
            events: {
              create: {
                fromStatus: application.status,
                toStatus: nextStatus,
                actorId: actor.id,
                note: note || null,
              },
            },
          },
          include: {
            class: { select: { id: true, name: true } },
            submittedBy: { select: { id: true, name: true, email: true } },
            team: { select: { id: true, code: true } },
          },
        })

        await reindexWaitlistPositions(tx, competitionId)
        return result
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    )
    return NextResponse.json(updated)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Otsuse salvestamine ebaõnnestus"
    return NextResponse.json({ error: message }, { status: 409 })
  }
}
