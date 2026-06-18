import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { calculateScores } from "@/lib/calculators"

async function checkAccess(competitionId: string, userId: string, role: string) {
  if (role === "ADMIN") return true
  const comp = await prisma.competition.findUnique({
    where: { id: competitionId },
    include: { members: { where: { userId }, select: { id: true } } },
  })
  return comp?.organizerId === userId || (comp?.members?.length ?? 0) > 0
}

// Elemendi tüüp → max väärtus seosed
const MAX_VALUE_TYPES = ["CHECKPOINT", "PENALTY_BOX"] as const

// Erandite sildid, mida automaatselt sobitame (väiketähed)
const EXCEPTION_MAP: Record<string, "defaultNotPassed" | "defaultPassedNotDone"> = {
  "ei läbinud": "defaultNotPassed",
  "läbis aga ei sooritanud": "defaultPassedNotDone",
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id: competitionId } = await params

  const ok = await checkAccess(competitionId, session.user.id, session.user.role ?? "")
  if (!ok) return NextResponse.json({ error: "Keelatud" }, { status: 403 })

  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    include: {
      elements: {
        include: {
          exceptions: true,
          calcMethod: true,
          fields: true,
        },
      },
    },
  })
  if (!competition) return NextResponse.json({ error: "Ei leitud" }, { status: 404 })

  let updatedMaxValues = 0
  let updatedExceptions = 0
  let updatedCalcMethods = 0

  for (const element of competition.elements) {
    // 1. maxValue: KP → defaultKPMaxValue, PK → defaultPKMaxValue
    if ((MAX_VALUE_TYPES as readonly string[]).includes(element.type)) {
      const newMax =
        element.type === "CHECKPOINT"
          ? competition.defaultKPMaxValue
          : competition.defaultPKMaxValue

      if (element.maxValue !== newMax) {
        await prisma.scoringElement.update({
          where: { id: element.id },
          data: { maxValue: newMax },
        })
        updatedMaxValues++
      }
    }

    // 2. Erandite karistused (kõigi elementide puhul, siltide järgi)
    for (const exc of element.exceptions) {
      const key = EXCEPTION_MAP[exc.label.toLowerCase().trim()]
      if (!key) continue
      const newPenalty = competition[key]
      if (exc.penalty !== newPenalty) {
        await prisma.elementException.update({
          where: { id: exc.id },
          data: { penalty: newPenalty },
        })
        updatedExceptions++
      }
    }

    // 3. Arvutusmeetod: ainult KP ja PK elementidel
    if (
      element.calcMethod &&
      (element.type === "CHECKPOINT" || element.type === "PENALTY_BOX") &&
      competition.defaultCalcType !== "CUSTOM"
    ) {
      const newType = competition.defaultCalcType
      const paramsObj: Record<string, unknown> = {}
      if (newType === "RELATIVE_RANKING" || newType === "VALUE_BASED") {
        paramsObj.higherIsBetter = competition.defaultHigherIsBetter
        paramsObj.minPoints = competition.defaultRankingMinPoints
      } else if (newType === "FIXED_RANKING") {
        paramsObj.higherIsBetter = competition.defaultHigherIsBetter
        paramsObj.minPoints = competition.defaultRankingMinPoints
        try { paramsObj.fixedPoints = JSON.parse(competition.defaultFixedRankingPoints ?? "[]") } catch { paramsObj.fixedPoints = [] }
      }

      await prisma.calcMethod.update({
        where: { id: element.calcMethod.id },
        data: {
          type: newType,
          params: JSON.stringify(paramsObj),
        },
      })
      updatedCalcMethods++
    }
  }

  // 4. Arvuta kõik skoorid ümber
  const freshElements = await prisma.scoringElement.findMany({
    where: { competitionId },
    include: { fields: true, exceptions: true, calcMethod: true, competition: { select: { scoringMode: true, defaultKPMaxValue: true, defaultPKMaxValue: true } } },
  })

  for (const element of freshElements) {
    const results = await prisma.result.findMany({
      where: { elementId: element.id },
      include: { team: true },
    })
    if (results.length === 0) continue

    const competitionConfig = {
      scoringMode: element.competition.scoringMode as "PENALTY" | "PLUS",
      defaultKPMaxValue: element.competition.defaultKPMaxValue,
      defaultPKMaxValue: element.competition.defaultPKMaxValue,
    }

    const scored = calculateScores(element, results, competitionConfig)
    await prisma.$transaction(
      scored.map((s) =>
        prisma.computedScore.upsert({
          where: { elementId_teamId: { elementId: element.id, teamId: s.teamId } },
          create: { elementId: element.id, teamId: s.teamId, penaltyPoints: s.penaltyPoints },
          update: { penaltyPoints: s.penaltyPoints, computedAt: new Date() },
        })
      )
    )
  }

  return NextResponse.json({
    ok: true,
    updated: {
      maxValues: updatedMaxValues,
      exceptions: updatedExceptions,
      calcMethods: updatedCalcMethods,
    },
  })
}
