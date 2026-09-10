import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import {
  copiedCompetitionName,
  copiedElementName,
  nextElementCopyCode,
  remapCompetitionAllocationValues,
} from "@/lib/competitionCopy"

const elementConfigurationInclude = {
  fields: {
    where: { sectionId: null },
    orderBy: { order: "asc" as const },
  },
  exceptions: { orderBy: { order: "asc" as const } },
  calcMethod: true,
  sections: {
    include: {
      fields: { orderBy: { order: "asc" as const } },
      calcMethod: true,
    },
    orderBy: { order: "asc" as const },
  },
} as const

export class CompetitionCopyError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message)
  }
}

export async function copyScoringElementConfiguration(
  tx: Prisma.TransactionClient,
  {
    sourceElementId,
    targetCompetitionId,
  }: {
    sourceElementId: string
    targetCompetitionId: string
  }
) {
  const [source, target, targetElements] = await Promise.all([
    tx.scoringElement.findUnique({
      where: { id: sourceElementId },
      include: elementConfigurationInclude,
    }),
    tx.competition.findUnique({
      where: { id: targetCompetitionId },
      select: { id: true },
    }),
    tx.scoringElement.findMany({
      where: { competitionId: targetCompetitionId },
      select: { code: true, order: true },
    }),
  ])
  if (!source) {
    throw new CompetitionCopyError("Hindamiselementi ei leitud", 404)
  }
  if (!target) {
    throw new CompetitionCopyError("Sihtvõistlust ei leitud", 404)
  }

  const sameCompetition = source.competitionId === targetCompetitionId
  const code = nextElementCopyCode(
    source.code,
    targetElements.map(({ code }) => code)
  )
  const order =
    targetElements.reduce(
      (highest, element) => Math.max(highest, element.order),
      -1
    ) + 1

  const created = await tx.scoringElement.create({
    data: {
      competitionId: targetCompetitionId,
      name: copiedElementName(source.name, sameCompetition),
      code,
      type: source.type,
      order,
      maxValue: source.maxValue,
      config: source.config,
      isCancelled: false,
      directPointsEntry: source.directPointsEntry,
      revealPointsToAthletes: source.revealPointsToAthletes,
      fields:
        source.fields.length > 0
          ? {
              create: source.fields.map((field) => ({
                name: field.name,
                label: field.label,
                type: field.type,
                order: field.order,
                isResultField: field.isResultField,
                rankingPriority: field.rankingPriority,
                formula: field.formula,
                meta: field.meta,
                validation: field.validation,
              })),
            }
          : undefined,
      exceptions:
        source.exceptions.length > 0
          ? {
              create: source.exceptions.map((exception) => ({
                label: exception.label,
                penalty: exception.penalty,
                order: exception.order,
              })),
            }
          : undefined,
      calcMethod: source.calcMethod
        ? {
            create: {
              type: source.calcMethod.type,
              params: source.calcMethod.params,
              customFormula: source.calcMethod.customFormula,
            },
          }
        : undefined,
    },
  })

  for (const section of source.sections) {
    await tx.elementSection.create({
      data: {
        elementId: created.id,
        name: section.name,
        order: section.order,
        maxValue: section.maxValue,
        fields:
          section.fields.length > 0
            ? {
                create: section.fields.map((field) => ({
                  elementId: created.id,
                  name: field.name,
                  label: field.label,
                  type: field.type,
                  order: field.order,
                  isResultField: field.isResultField,
                  rankingPriority: field.rankingPriority,
                  formula: field.formula,
                  meta: field.meta,
                  validation: field.validation,
                })),
              }
            : undefined,
        calcMethod: section.calcMethod
          ? {
              create: {
                type: section.calcMethod.type,
                params: section.calcMethod.params,
                customFormula: section.calcMethod.customFormula,
              },
            }
          : undefined,
      },
    })
  }

  return tx.scoringElement.findUniqueOrThrow({
    where: { id: created.id },
    include: elementConfigurationInclude,
  })
}

export async function copyCompetitionConfiguration({
  sourceCompetitionId,
  organizerId,
  name,
  includeElements = true,
}: {
  sourceCompetitionId: string
  organizerId: string
  name?: string
  includeElements?: boolean
}) {
  return prisma.$transaction(
    async (tx) => {
      const source = await tx.competition.findUnique({
        where: { id: sourceCompetitionId },
        include: {
          registrationClasses: {
            where: { isActive: true },
            orderBy: { order: "asc" },
          },
          registrationFormFields: {
            where: { isActive: true },
            orderBy: { order: "asc" },
          },
          registrationAllocationRules: {
            where: { isActive: true },
            orderBy: { order: "asc" },
          },
          elements: {
            where: { isCancelled: false },
            orderBy: { order: "asc" },
            select: { id: true },
          },
        },
      })
      if (!source) {
        throw new CompetitionCopyError("Võistlust ei leitud", 404)
      }

      const copyName = name?.trim() || copiedCompetitionName(source.name)
      if (!copyName || copyName.length > 200) {
        throw new CompetitionCopyError(
          "Võistluse nimi peab olema 1–200 tähemärki",
          400
        )
      }

      const created = await tx.competition.create({
        data: {
          name: copyName,
          date: null,
          endDate: null,
          location: source.location,
          status: "SETUP",
          isPublic: false,
          organizerId,
          scoringMode: source.scoringMode,
          defaultKPMaxValue: source.defaultKPMaxValue,
          defaultNotPassed: source.defaultNotPassed,
          defaultPassedNotDone: source.defaultPassedNotDone,
          defaultPKMaxValue: source.defaultPKMaxValue,
          defaultVastutegevusPenaltyPerLife:
            source.defaultVastutegevusPenaltyPerLife,
          defaultVarustusPenaltyPerItem:
            source.defaultVarustusPenaltyPerItem,
          defaultHilinemineMode: source.defaultHilinemineMode,
          defaultHilinemineIntervalMinutes:
            source.defaultHilinemineIntervalMinutes,
          defaultHilineminePenaltyPerInterval:
            source.defaultHilineminePenaltyPerInterval,
          defaultHilinemineMaxPenalty: source.defaultHilinemineMaxPenalty,
          defaultCalcType: source.defaultCalcType,
          defaultHigherIsBetter: source.defaultHigherIsBetter,
          defaultRankingMinPoints: source.defaultRankingMinPoints,
          defaultFixedRankingPoints: source.defaultFixedRankingPoints,
          defaultFixedRankingMode: source.defaultFixedRankingMode,
          defaultTeamCountScope: source.defaultTeamCountScope,
          defaultTeamCountBase: source.defaultTeamCountBase,
          defaultTeamCountStep: source.defaultTeamCountStep,
          classGroups: source.classGroups,
          athletePointsMode: source.athletePointsMode,
          athletePointsRanges: source.athletePointsRanges,
          athleteShowTotal: source.athleteShowTotal,
          athleteShowRank: source.athleteShowRank,
          registrationOpensAt: null,
          registrationClosesAt: null,
          registrationOverride: "AUTO",
          registrationFinalizedAt: null,
          registrationCapacity: source.registrationCapacity,
          registrationClassBalanceMode:
            source.registrationClassBalanceMode,
          registrationApprovalMode: source.registrationApprovalMode,
          mandateOpensAt: null,
          mandateClosesAt: null,
          mandateOverride: "AUTO",
          mandateFinalizedAt: null,
          mandateApprovalMode: source.mandateApprovalMode,
          personalDataRetentionDays: source.personalDataRetentionDays,
          personalDataPurgedAt: null,
          representativeRequired: source.representativeRequired,
          captainRequired: source.captainRequired,
          teamMemberRoles: source.teamMemberRoles,
          members: {
            create: {
              userId: organizerId,
              roles: { create: { role: "OWNER" } },
            },
          },
        },
      })

      const classIdMap = new Map<string, string>()
      for (const sourceClass of source.registrationClasses) {
        const saved = await tx.competitionClass.create({
          data: {
            competitionId: created.id,
            name: sourceClass.name,
            order: sourceClass.order,
            isActive: true,
          },
        })
        classIdMap.set(sourceClass.id, saved.id)
      }

      const fieldIdMap = new Map<string, string>()
      for (const field of source.registrationFormFields) {
        const saved = await tx.competitionFormField.create({
          data: {
            competitionId: created.id,
            key: field.key,
            label: field.label,
            helpText: field.helpText,
            type: field.type,
            semanticKey: field.semanticKey,
            options: field.options,
            memberFields: field.memberFields,
            memberMinCount: field.memberMinCount,
            memberMaxCount: field.memberMaxCount,
            showInRegistration: field.showInRegistration,
            requiredInRegistration: field.requiredInRegistration,
            showInMandate: field.showInMandate,
            requiredInMandate: field.requiredInMandate,
            editableInMandate: field.editableInMandate,
            conditionFieldKey: field.conditionFieldKey,
            conditionOperator: field.conditionOperator,
            conditionValue: field.conditionValue,
            purgeAfterCompetition: field.purgeAfterCompetition,
            order: field.order,
            isActive: true,
          },
        })
        fieldIdMap.set(field.id, saved.id)
      }

      for (const rule of source.registrationAllocationRules) {
        await tx.registrationAllocationRule.create({
          data: {
            competitionId: created.id,
            fieldId: rule.fieldId ? fieldIdMap.get(rule.fieldId) ?? null : null,
            label: rule.label,
            type: rule.type,
            source: rule.source,
            values: remapCompetitionAllocationValues(
              rule.source,
              rule.values,
              classIdMap
            ),
            quota: rule.quota,
            order: rule.order,
            isActive: true,
          },
        })
      }

      if (includeElements) {
        for (const element of source.elements) {
          await copyScoringElementConfiguration(tx, {
            sourceElementId: element.id,
            targetCompetitionId: created.id,
          })
        }
      }

      return tx.competition.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          _count: {
            select: {
              elements: true,
              teams: true,
              accessTokens: true,
              members: true,
            },
          },
        },
      })
    },
    { maxWait: 5_000, timeout: 30_000 }
  )
}
