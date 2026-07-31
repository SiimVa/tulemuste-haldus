import { Prisma } from "@prisma/client"
import {
  type AllocationRuleDefinition,
  allocateRegistrationPlaces,
  isAllocationRuleSource,
  isAllocationRuleType,
  isClassBalanceMode,
} from "@/lib/registrationAllocation"
import { parseFormAnswer } from "@/lib/registrationForm"

type TransactionClient = Prisma.TransactionClient

function parseValues(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : []
  } catch {
    return []
  }
}

export async function recalculateRegistrationAllocation(
  tx: TransactionClient,
  competitionId: string,
  {
    actorId = null,
    eventNote = "Automaatne kohtade ümberarvutus",
  }: { actorId?: string | null; eventNote?: string } = {}
) {
  const competition = await tx.competition.findUnique({
    where: { id: competitionId },
    select: {
      registrationCapacity: true,
      registrationClassBalanceMode: true,
      registrationAllocationRules: {
        where: { isActive: true },
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          label: true,
          type: true,
          source: true,
          fieldId: true,
          values: true,
          quota: true,
          order: true,
        },
      },
      registrationApplications: {
        where: { status: { in: ["CONFIRMED", "WAITLISTED"] } },
        orderBy: [{ submittedAt: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          status: true,
          allocationReason: true,
          waitlistPosition: true,
          submittedAt: true,
          createdAt: true,
          classId: true,
          fieldValues: { select: { fieldId: true, value: true } },
        },
      },
    },
  })
  if (!competition) throw new Error("Võistlust ei leitud")

  const rules: AllocationRuleDefinition[] =
    competition.registrationAllocationRules.flatMap((rule) =>
      isAllocationRuleType(rule.type) &&
      isAllocationRuleSource(rule.source)
        ? [
            {
              ...rule,
              type: rule.type,
              source: rule.source,
              values: parseValues(rule.values),
            },
          ]
        : []
    )
  const classBalanceMode = isClassBalanceMode(
    competition.registrationClassBalanceMode
  )
    ? competition.registrationClassBalanceMode
    : "OFF"
  const applications = competition.registrationApplications
  const allocation = allocateRegistrationPlaces({
    candidates: applications.map((application) => ({
      id: application.id,
      submittedAt:
        application.submittedAt?.getTime() ?? application.createdAt.getTime(),
      createdAt: application.createdAt.getTime(),
      classId: application.classId,
      fieldValues: Object.fromEntries(
        application.fieldValues.flatMap(({ fieldId, value }) => {
          const parsed = parseFormAnswer(value)
          return typeof parsed === "string" ? [[fieldId, parsed]] : []
        })
      ),
    })),
    capacity: competition.registrationCapacity,
    rules,
    classBalanceMode,
  })
  const confirmed = new Set(allocation.confirmedIds)
  const waitlistPositions = new Map(
    allocation.waitlistedIds.map((id, index) => [id, index + 1])
  )
  const transitions: {
    id: string
    fromStatus: string
    toStatus: "CONFIRMED" | "WAITLISTED"
  }[] = []
  const now = new Date()

  for (const application of applications) {
    const nextStatus = confirmed.has(application.id)
      ? "CONFIRMED"
      : "WAITLISTED"
    const allocationReason = allocation.reasons[application.id] ?? null
    const waitlistPosition =
      nextStatus === "WAITLISTED"
        ? waitlistPositions.get(application.id) ?? null
        : null
    const statusChanged = application.status !== nextStatus
    if (
      !statusChanged &&
      application.allocationReason === allocationReason &&
      application.waitlistPosition === waitlistPosition
    ) {
      continue
    }
    await tx.registrationApplication.update({
      where: { id: application.id },
      data: {
        status: nextStatus,
        allocationReason,
        waitlistPosition,
        decidedAt: nextStatus === "CONFIRMED" ? now : null,
        ...(statusChanged
          ? {
              events: {
                create: {
                  fromStatus: application.status,
                  toStatus: nextStatus,
                  actorId,
                  note: `${eventNote}: ${allocationReason ?? nextStatus}`,
                },
              },
            }
          : {}),
      },
    })
    if (statusChanged) {
      transitions.push({
        id: application.id,
        fromStatus: application.status,
        toStatus: nextStatus,
      })
    }
  }

  return { allocation, transitions }
}

export async function reindexWaitlistPositions(
  tx: TransactionClient,
  competitionId: string
) {
  const applications = await tx.registrationApplication.findMany({
    where: { competitionId, status: "WAITLISTED" },
    select: {
      id: true,
      waitlistPosition: true,
      submittedAt: true,
      createdAt: true,
    },
  })
  applications.sort(
    (a, b) =>
      (a.waitlistPosition ?? Number.MAX_SAFE_INTEGER) -
        (b.waitlistPosition ?? Number.MAX_SAFE_INTEGER) ||
      (a.submittedAt?.getTime() ?? a.createdAt.getTime()) -
        (b.submittedAt?.getTime() ?? b.createdAt.getTime()) ||
      a.createdAt.getTime() - b.createdAt.getTime() ||
      a.id.localeCompare(b.id)
  )

  for (const [index, application] of applications.entries()) {
    const waitlistPosition = index + 1
    if (application.waitlistPosition === waitlistPosition) continue
    await tx.registrationApplication.update({
      where: { id: application.id },
      data: { waitlistPosition },
    })
  }
}
