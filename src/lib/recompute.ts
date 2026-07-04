import { prisma } from "@/lib/prisma"
import { calculateScores, withEffectiveHC } from "@/lib/calculators"

const round3 = (n: number) => Math.round(n * 1000) / 1000

// ─────────────────────────────────────────────────────────────────────────────
// ÜKS tõesuse allikas skooride arvutamiseks. Kasutavad NII tulemuse salvestamine
// (POST /results) kui ka hulgi-ümberarvutus (/recalculate), et need ei saaks
// enam lahku minna. Käsitleb: tühistatud element, Muu/Katkestamine, kombineeritud
// hindamine, erandid, DNF (katkestanud) ja käsitsi lisapunktid (misc).
// ─────────────────────────────────────────────────────────────────────────────
export async function recomputeElementScores(elementId: string): Promise<number> {
  const element = await prisma.scoringElement.findUnique({
    where: { id: elementId },
    include: {
      // NB: ainult ülemise taseme väljad (mitte sektsiooniväljad) → õige tulemusväli
      fields: { where: { sectionId: null }, orderBy: { order: "asc" } },
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
  })
  if (!element) return 0

  const config = {
    scoringMode: element.competition.scoringMode as "PENALTY" | "PLUS",
    defaultKPMaxValue: element.competition.defaultKPMaxValue,
    defaultPKMaxValue: element.competition.defaultPKMaxValue,
  }
  const isPlusMode = config.scoringMode === "PLUS"

  // Tühistatud element: kõik võistkonnad saavad 0
  if (element.isCancelled) {
    const teams = await prisma.team.findMany({
      where: { competitionId: element.competitionId },
      select: { id: true },
    })
    await prisma.$transaction(
      teams.map((t) =>
        prisma.computedScore.upsert({
          where: { elementId_teamId: { elementId, teamId: t.id } },
          create: { elementId, teamId: t.id, penaltyPoints: 0 },
          update: { penaltyPoints: 0, computedAt: new Date() },
        })
      )
    )
    return teams.length
  }

  // Muu / Katkestamine element: summeeri MiscEntry kirjed võistkonna kohta
  if (element.type === "OTHER" || element.type === "ABANDONMENT") {
    const byTeam = new Map<string, number>()
    for (const e of element.miscEntries) byTeam.set(e.teamId, (byTeam.get(e.teamId) ?? 0) + e.points)
    if (byTeam.size === 0) return 0
    await prisma.$transaction(
      [...byTeam.entries()].map(([teamId, pts]) =>
        prisma.computedScore.upsert({
          where: { elementId_teamId: { elementId, teamId } },
          create: { elementId, teamId, penaltyPoints: pts },
          update: { penaltyPoints: pts, computedAt: new Date() },
        })
      )
    )
    return byTeam.size
  }

  // Käsitsi lisapunktid (kehtib kõigile mitte-OTHER elementidele)
  const miscByTeam = new Map<string, number>()
  for (const e of element.miscEntries) miscByTeam.set(e.teamId, (miscByTeam.get(e.teamId) ?? 0) + e.points)

  // DNF: võistkonnad, kes katkestasid teatud elemendist alates
  const dnfList = await prisma.team.findMany({
    where: { competitionId: element.competitionId, dnfFromElementOrder: { not: null } },
    select: { id: true, dnfFromElementOrder: true },
  })
  const dnfTeams = new Map(dnfList.map((t) => [t.id, t.dnfFromElementOrder!]))
  const isDnfHere = (teamId: string) => {
    const o = dnfTeams.get(teamId)
    return o != null && element.order >= o
  }

  const results = await prisma.result.findMany({ where: { elementId }, include: { team: true } })
  if (results.length === 0 && miscByTeam.size === 0) return 0

  const activeResults = results.filter((r) => !isDnfHere(r.teamId))

  let scored: { teamId: string; penaltyPoints: number }[]

  if (element.sections.length > 0) {
    // Kombineeritud hindamine: iga sektsiooni skoor eraldi ja summeeri
    const exceptionResults = activeResults.filter((r) => r.exceptionLabel)
    const normalResults = activeResults.filter((r) => !r.exceptionLabel)
    const teamScores = new Map<string, number>()

    for (const r of exceptionResults) {
      const magnitude = Math.abs(r.exceptionPenalty ?? 0)
      teamScores.set(r.teamId, isPlusMode ? -magnitude : magnitude)
    }

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
        exceptions: [] as { label: string; penalty: number }[],
        maxValue: section.maxValue,
      }
      const sectionScored = calculateScores(mockElement, withEffectiveHC(normalResults, element.order), config)
      for (const s of sectionScored) {
        teamScores.set(s.teamId, round3((teamScores.get(s.teamId) ?? 0) + s.penaltyPoints))
      }
    }

    // DNF võistkonnad → sektsioonide max (PENALTY) / 0 (PLUS)
    for (const r of results.filter((r) => isDnfHere(r.teamId))) {
      const sectionMax = element.sections.reduce((s, sec) => s + (sec.maxValue ?? config.defaultKPMaxValue), 0)
      teamScores.set(r.teamId, isPlusMode ? 0 : sectionMax)
    }

    for (const [teamId, bonus] of miscByTeam) {
      if (teamScores.has(teamId)) teamScores.set(teamId, round3((teamScores.get(teamId) ?? 0) + bonus))
    }

    scored = [...teamScores.entries()].map(([teamId, penaltyPoints]) => ({ teamId, penaltyPoints }))
  } else {
    // Tavaline element
    const calcScored = calculateScores(element, withEffectiveHC(activeResults, element.order), config)
    const dnfScores = results
      .filter((r) => isDnfHere(r.teamId))
      .map((r) => ({ teamId: r.teamId, penaltyPoints: isPlusMode ? 0 : (element.maxValue ?? config.defaultKPMaxValue) }))
    scored = [...calcScored, ...dnfScores].map((s) => ({
      teamId: s.teamId,
      penaltyPoints: round3(s.penaltyPoints + (miscByTeam.get(s.teamId) ?? 0)),
    }))
  }

  if (scored.length === 0) return 0

  await prisma.$transaction(
    scored.map((s) =>
      prisma.computedScore.upsert({
        where: { elementId_teamId: { elementId, teamId: s.teamId } },
        create: { elementId, teamId: s.teamId, penaltyPoints: s.penaltyPoints },
        update: { penaltyPoints: s.penaltyPoints, computedAt: new Date() },
      })
    )
  )
  return scored.length
}

// Arvuta terve võistluse kõik elemendid ümber (kasutab jagatud per-element loogikat).
export async function recomputeCompetitionScores(competitionId: string): Promise<number> {
  const elements = await prisma.scoringElement.findMany({
    where: { competitionId },
    select: { id: true },
    orderBy: { order: "asc" },
  })
  let total = 0
  for (const el of elements) total += await recomputeElementScores(el.id)
  return total
}
