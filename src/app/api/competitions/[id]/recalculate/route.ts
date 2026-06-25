import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { calculateScores, withEffectiveHC } from "@/lib/calculators"

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id: competitionId } = await params

  const [elements, teams] = await Promise.all([
    prisma.scoringElement.findMany({
      where: { competitionId },
      include: {
        fields: true,
        exceptions: true,
        calcMethod: true,
        miscEntries: true,
        sections: {
          include: { fields: { orderBy: { order: "asc" } }, calcMethod: true },
          orderBy: { order: "asc" },
        },
        competition: {
          select: { scoringMode: true, defaultKPMaxValue: true, defaultPKMaxValue: true },
        },
      },
      orderBy: { order: "asc" },
    }),
    prisma.team.findMany({ where: { competitionId } }),
  ])

  const dnfTeams = new Map(
    teams.filter((t) => t.dnfFromElementOrder != null).map((t) => [t.id, t.dnfFromElementOrder!])
  )

  let total = 0

  for (const element of elements) {
    const config = {
      scoringMode: element.competition.scoringMode as "PENALTY" | "PLUS",
      defaultKPMaxValue: element.competition.defaultKPMaxValue,
      defaultPKMaxValue: element.competition.defaultPKMaxValue,
    }
    const isPlusMode = config.scoringMode === "PLUS"

    // Annuleeritud element: kõik tiimid saavad 0
    if (element.isCancelled) {
      const allTeams = await prisma.team.findMany({ where: { competitionId } })
      await prisma.$transaction(
        allTeams.map((t) =>
          prisma.computedScore.upsert({
            where: { elementId_teamId: { elementId: element.id, teamId: t.id } },
            create: { elementId: element.id, teamId: t.id, penaltyPoints: 0 },
            update: { penaltyPoints: 0, computedAt: new Date() },
          })
        )
      )
      total += allTeams.length
      continue
    }

    // Muu element: summeeri MiscEntry kirjed tiimi kohta
    if (element.type === "OTHER") {
      const entriesByTeam = new Map<string, number>()
      for (const entry of element.miscEntries) {
        entriesByTeam.set(entry.teamId, (entriesByTeam.get(entry.teamId) ?? 0) + entry.points)
      }
      if (entriesByTeam.size === 0) continue
      await prisma.$transaction(
        [...entriesByTeam.entries()].map(([teamId, pts]) =>
          prisma.computedScore.upsert({
            where: { elementId_teamId: { elementId: element.id, teamId } },
            create: { elementId: element.id, teamId, penaltyPoints: pts },
            update: { penaltyPoints: pts, computedAt: new Date() },
          })
        )
      )
      total += entriesByTeam.size
      continue
    }

    // Misc bonus/karistus (käsitsi kirjed): kehtib kõikidele mitte-OTHER elementidele
    const miscByTeam = new Map<string, number>()
    for (const entry of element.miscEntries) {
      miscByTeam.set(entry.teamId, (miscByTeam.get(entry.teamId) ?? 0) + entry.points)
    }

    // Kombineeritud hindamine: arvuta iga sektsiooni skoor eraldi ja summeeri
    if (element.sections.length > 0) {
      const results = await prisma.result.findMany({
        where: { elementId: element.id },
        include: { team: true },
      })
      if (results.length === 0 && miscByTeam.size === 0) continue

      // DNF filtreerimine
      const activeResults = results.filter((r) => {
        const dnfOrder = dnfTeams.get(r.teamId)
        return dnfOrder == null || element.order < dnfOrder
      })

      // Erandiga tiimid (exception) — neile kehtib erand kogu KP kohta
      const exceptionResults = activeResults.filter((r) => r.exceptionLabel)
      const normalResults = activeResults.filter((r) => !r.exceptionLabel)

      const teamScores = new Map<string, number>()

      // Erandiga tiimid saavad erandi karistuse otse
      for (const r of exceptionResults) {
        const magnitude = Math.abs(r.exceptionPenalty ?? 0)
        teamScores.set(r.teamId, isPlusMode ? -magnitude : magnitude)
      }

      // Iga sektsiooni arvutus tavalistele tiimidele
      for (const section of element.sections) {
        if (!section.calcMethod || section.fields.length === 0) continue

        const mockElement = {
          id: element.id,
          calcMethod: {
            id: section.calcMethod.id,
            elementId: element.id,
            type: section.calcMethod.type,
            params: section.calcMethod.params,
            customFormula: section.calcMethod.customFormula,
          },
          fields: section.fields,
          exceptions: [],
          maxValue: section.maxValue,
        }

        const sectionScored = calculateScores(mockElement, withEffectiveHC(normalResults, element.order), config)

        for (const s of sectionScored) {
          teamScores.set(s.teamId, Math.round(((teamScores.get(s.teamId) ?? 0) + s.penaltyPoints) * 1000) / 1000)
        }
      }

      // DNF tiimid saavad maksimumi / 0
      const dnfResults = results.filter((r) => {
        const dnfOrder = dnfTeams.get(r.teamId)
        return dnfOrder != null && element.order >= dnfOrder
      })
      for (const r of dnfResults) {
        const sectionMax = element.sections.reduce((s, sec) => s + (sec.maxValue ?? config.defaultKPMaxValue), 0)
        teamScores.set(r.teamId, isPlusMode ? 0 : sectionMax)
      }

      // Misc bonus peal
      for (const [teamId, bonus] of miscByTeam) {
        if (teamScores.has(teamId)) {
          teamScores.set(teamId, Math.round(((teamScores.get(teamId) ?? 0) + bonus) * 1000) / 1000)
        }
      }

      await prisma.$transaction(
        [...teamScores.entries()].map(([teamId, penaltyPoints]) =>
          prisma.computedScore.upsert({
            where: { elementId_teamId: { elementId: element.id, teamId } },
            create: { elementId: element.id, teamId, penaltyPoints },
            update: { penaltyPoints, computedAt: new Date() },
          })
        )
      )
      total += teamScores.size
      continue
    }

    // Tavaline element (ei ole sektsioonidega): arvuta skoorid, filtreeri KAT tiimid välja
    const results = await prisma.result.findMany({
      where: { elementId: element.id },
      include: { team: true },
    })
    if (results.length === 0 && miscByTeam.size === 0) continue

    const activeResults = results.filter((r) => {
      const dnfOrder = dnfTeams.get(r.teamId)
      return dnfOrder == null || element.order < dnfOrder
    })

    const scored = calculateScores(element, withEffectiveHC(activeResults, element.order), config)

    const dnfScores = results
      .filter((r) => {
        const dnfOrder = dnfTeams.get(r.teamId)
        return dnfOrder != null && element.order >= dnfOrder
      })
      .map((r) => ({ teamId: r.teamId, penaltyPoints: isPlusMode ? 0 : (element.maxValue ?? config.defaultKPMaxValue) }))

    // Misc bonus (F1: käsitsi kirjed) peal tavalisele arvutusele
    const allScored = [...scored, ...dnfScores].map((s) => ({
      teamId: s.teamId,
      penaltyPoints: Math.round((s.penaltyPoints + (miscByTeam.get(s.teamId) ?? 0)) * 1000) / 1000,
    }))

    await prisma.$transaction(
      allScored.map((s) =>
        prisma.computedScore.upsert({
          where: { elementId_teamId: { elementId: element.id, teamId: s.teamId } },
          create: { elementId: element.id, teamId: s.teamId, penaltyPoints: s.penaltyPoints },
          update: { penaltyPoints: s.penaltyPoints, computedAt: new Date() },
        })
      )
    )
    total += allScored.length
  }

  return NextResponse.json({ ok: true, recalculated: total })
}
