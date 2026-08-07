import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import {
  getPersonalDataPurgeDueAt,
  isPersonalDataPurgeDue,
  scrubMemberListPersonalData,
} from "@/lib/personalDataRetention"
import { requiresPersonalDataPurge } from "@/lib/registrationForm"

export class PersonalDataRetentionError extends Error {}

export type PersonalDataPurgeResult = {
  competitionId: string
  purgedAt: Date
  deletedFieldValues: number
  scrubbedMemberLists: number
  clearedMemberEmails: number
  alreadyPurged: boolean
}

export async function purgeCompetitionPersonalData(
  tx: Prisma.TransactionClient,
  competitionId: string,
  options: { now?: Date; requireDue?: boolean } = {}
): Promise<PersonalDataPurgeResult> {
  const now = options.now ?? new Date()
  const competition = await tx.competition.findUnique({
    where: { id: competitionId },
    select: {
      id: true,
      endDate: true,
      personalDataRetentionDays: true,
      personalDataPurgedAt: true,
    },
  })
  if (!competition) {
    throw new PersonalDataRetentionError("Võistlust ei leitud")
  }
  if (competition.personalDataPurgedAt) {
    return {
      competitionId,
      purgedAt: competition.personalDataPurgedAt,
      deletedFieldValues: 0,
      scrubbedMemberLists: 0,
      clearedMemberEmails: 0,
      alreadyPurged: true,
    }
  }
  const dueAt = getPersonalDataPurgeDueAt(
    competition.endDate,
    competition.personalDataRetentionDays
  )
  if (!dueAt) {
    throw new PersonalDataRetentionError(
      "Isikuandmete kustutamiseks peab võistlusel olema lõppkuupäev"
    )
  }
  if (options.requireDue !== false && dueAt.getTime() > now.getTime()) {
    throw new PersonalDataRetentionError(
      "Isikuandmete säilitustähtaeg ei ole veel saabunud"
    )
  }

  const fields = await tx.competitionFormField.findMany({
    where: { competitionId },
    select: {
      id: true,
      type: true,
      memberFields: true,
      purgeAfterCompetition: true,
    },
  })
  const genericFieldIds = fields.flatMap((field) =>
    field.type !== "MEMBER_LIST" && field.purgeAfterCompetition
      ? [field.id]
      : []
  )
  const memberListFieldIds = fields.flatMap((field) => {
    let memberFields: string[] = []
    try {
      const parsed: unknown = JSON.parse(field.memberFields)
      memberFields = Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === "string")
        : []
    } catch {
      memberFields = []
    }
    return field.type === "MEMBER_LIST" &&
      (field.purgeAfterCompetition ||
        requiresPersonalDataPurge({
          type: "MEMBER_LIST",
          memberFields: memberFields as ("name" | "email" | "phone" | "birthDate")[],
        }))
      ? [field.id]
      : []
  })

  const [deletedApplicationValues, deletedTeamValues] =
    genericFieldIds.length > 0
      ? await Promise.all([
          tx.registrationApplicationFieldValue.deleteMany({
            where: {
              fieldId: { in: genericFieldIds },
              application: { competitionId },
            },
          }),
          tx.teamFormFieldValue.deleteMany({
            where: {
              fieldId: { in: genericFieldIds },
              team: { competitionId },
            },
          }),
        ])
      : [{ count: 0 }, { count: 0 }]

  let scrubbedMemberLists = 0
  if (memberListFieldIds.length > 0) {
    const [applicationValues, teamValues] = await Promise.all([
      tx.registrationApplicationFieldValue.findMany({
        where: {
          fieldId: { in: memberListFieldIds },
          application: { competitionId },
        },
        select: { id: true, value: true },
      }),
      tx.teamFormFieldValue.findMany({
        where: {
          fieldId: { in: memberListFieldIds },
          team: { competitionId },
        },
        select: { id: true, value: true },
      }),
    ])
    for (const stored of applicationValues) {
      const value = scrubMemberListPersonalData(stored.value)
      if (value === null) {
        await tx.registrationApplicationFieldValue.delete({
          where: { id: stored.id },
        })
      } else {
        await tx.registrationApplicationFieldValue.update({
          where: { id: stored.id },
          data: { value },
        })
      }
      scrubbedMemberLists += 1
    }
    for (const stored of teamValues) {
      const value = scrubMemberListPersonalData(stored.value)
      if (value === null) {
        await tx.teamFormFieldValue.delete({ where: { id: stored.id } })
      } else {
        await tx.teamFormFieldValue.update({
          where: { id: stored.id },
          data: { value },
        })
      }
      scrubbedMemberLists += 1
    }
  }

  const clearedMemberEmails = await tx.teamMember.updateMany({
    where: { competitionId, email: { not: null } },
    data: { email: null },
  })
  await tx.competition.update({
    where: { id: competitionId },
    data: { personalDataPurgedAt: now },
  })

  return {
    competitionId,
    purgedAt: now,
    deletedFieldValues:
      deletedApplicationValues.count + deletedTeamValues.count,
    scrubbedMemberLists,
    clearedMemberEmails: clearedMemberEmails.count,
    alreadyPurged: false,
  }
}

export async function purgeExpiredPersonalData(now = new Date()) {
  const candidates = await prisma.competition.findMany({
    where: { endDate: { not: null }, personalDataPurgedAt: null },
    select: {
      id: true,
      endDate: true,
      personalDataRetentionDays: true,
    },
  })
  const due = candidates.filter((competition) =>
    isPersonalDataPurgeDue(
      competition.endDate,
      competition.personalDataRetentionDays,
      now
    )
  )
  const results: PersonalDataPurgeResult[] = []
  for (const competition of due) {
    results.push(
      await prisma.$transaction((tx) =>
        purgeCompetitionPersonalData(tx, competition.id, { now })
      )
    )
  }
  return results
}
