import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { calculateScores, withEffectiveHC } from "@/lib/calculators"
import { isFailedResult } from "@/lib/exceptionKinds"
import { parseClassGroups, scopeKeyFor, TEAM_COUNT_SCOPES } from "@/lib/classGroups"
import { invalidatePublicSnapshots } from "@/lib/publicSnapshotCache"

const round3 = (n: number) => Math.round(n * 1000) / 1000

async function replaceComputedScores(
  tx: Prisma.TransactionClient,
  elementId: string,
  scores: { teamId: string; penaltyPoints: number }[]
): Promise<void> {
  const computedAt = new Date()
  await tx.computedScore.deleteMany({ where: { elementId } })
  if (scores.length > 0) {
    await tx.computedScore.createMany({
      data: scores.map((score) => ({ ...score, elementId, computedAt })),
    })
  }
}

// A PostgreSQL row lock coordinates every application instance. Acquire it
// before reading results: locking only the replacement would allow an older
// calculation to overwrite a newer one. READ COMMITTED sees the previous
// writer's committed results after waiting for this lock.
async function withElementScoreLock<T>(
  elementId: string,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const committed = await prisma.$transaction(async (tx) => {
    const [element] = await tx.$queryRaw<{ competitionId: string }[]>(Prisma.sql`SELECT "competitionId" FROM "ScoringElement" WHERE "id" = ${elementId} FOR UPDATE`)
    return { value: await work(tx), competitionId: element?.competitionId }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 10_000, timeout: 15_000 })
  if (committed.competitionId) invalidatePublicSnapshots(committed.competitionId)
  return committed.value
}

// Keep the source mutation and all affected teams' scores in the same commit.
// A calculation failure rolls back the input as well as the computed scores.
export async function withElementScoreTransaction<T>(
  elementId: string,
  mutation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return withElementScoreLock(elementId, async (tx) => {
    const value = await mutation(tx)
    await recomputeLockedElementScores(tx, elementId)
    return value
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// ÜKS tõesuse allikas skooride arvutamiseks. Kasutavad NII tulemuse salvestamine
// (POST /results) kui ka hulgi-ümberarvutus (/recalculate), et need ei saaks
// enam lahku minna. Käsitleb: tühistatud element, Muu/Katkestamine, kombineeritud
// hindamine, erandid, DNF (katkestanud) ja käsitsi lisapunktid (misc).
// ─────────────────────────────────────────────────────────────────────────────
export async function recomputeElementScores(elementId: string): Promise<number> {
  return withElementScoreLock(elementId, (tx) => recomputeLockedElementScores(tx, elementId))
}

async function recomputeLockedElementScores(tx: Prisma.TransactionClient, elementId: string): Promise<number> {
  const element = await tx.scoringElement.findUnique({
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
        select: { scoringMode: true, defaultKPMaxValue: true, defaultPKMaxValue: true, classGroups: true },
      },
    },
  })
  if (!element) return 0

  // Võistkondade arvust sõltuv fikseeritud pingerida vajab registreerunute arvu
  // skoopide kaupa. Loeme kõik võistluse võistkonnad, mitte ainult need, kellel
  // on selles elemendis tulemus — nii jääb punktiskaala kõigis elementides samaks.
  const classGroups = parseClassGroups(element.competition.classGroups)
  const allTeams = await tx.team.findMany({
    where: { competitionId: element.competitionId, isHorsDeCompetition: false },
    select: { class: true },
  })
  const registeredCounts = new Map<string, number>()
  for (const scope of TEAM_COUNT_SCOPES) {
    for (const t of allTeams) {
      const key = scopeKeyFor(scope, t.class, classGroups)
      registeredCounts.set(key, (registeredCounts.get(key) ?? 0) + 1)
    }
  }

  const config = {
    scoringMode: element.competition.scoringMode as "PENALTY" | "PLUS",
    defaultKPMaxValue: element.competition.defaultKPMaxValue,
    defaultPKMaxValue: element.competition.defaultPKMaxValue,
    registeredCounts,
    classGroups,
  }
  const isPlusMode = config.scoringMode === "PLUS"

  // Tühistatud element: kõik võistkonnad saavad 0
  if (element.isCancelled) {
    const teams = await tx.team.findMany({
      where: { competitionId: element.competitionId },
      select: { id: true },
    })
    await replaceComputedScores(tx, elementId, teams.map((team) => ({
      teamId: team.id,
      penaltyPoints: 0,
    })))
    return teams.length
  }

  // Muu / Katkestamine element: summeeri MiscEntry kirjed võistkonna kohta
  if (element.type === "OTHER" || element.type === "ABANDONMENT") {
    const byTeam = new Map<string, number>()
    for (const e of element.miscEntries) byTeam.set(e.teamId, (byTeam.get(e.teamId) ?? 0) + e.points)
    await replaceComputedScores(
      tx,
      elementId,
      [...byTeam.entries()].map(([teamId, penaltyPoints]) => ({ teamId, penaltyPoints }))
    )
    return byTeam.size
  }

  // Käsitsi lisapunktid (kehtib kõigile mitte-OTHER elementidele)
  const miscByTeam = new Map<string, number>()
  for (const e of element.miscEntries) miscByTeam.set(e.teamId, (miscByTeam.get(e.teamId) ?? 0) + e.points)

  // DNF: võistkonnad, kes katkestasid teatud elemendist alates
  const dnfList = await tx.team.findMany({
    where: { competitionId: element.competitionId, dnfFromElementOrder: { not: null } },
    select: { id: true, dnfFromElementOrder: true },
  })
  const dnfTeams = new Map(dnfList.map((t) => [t.id, t.dnfFromElementOrder!]))
  const isDnfHere = (teamId: string) => {
    const o = dnfTeams.get(teamId)
    return o != null && element.order >= o
  }

  const results = await tx.result.findMany({ where: { elementId }, include: { team: true } })
  if (results.length === 0 && miscByTeam.size === 0) {
    await replaceComputedScores(tx, elementId, [])
    return 0
  }

  const activeResults = results.filter((r) => !isDnfHere(r.teamId))

  let scored: { teamId: string; penaltyPoints: number }[]

  if (element.sections.length > 0) {
    // Kombineeritud hindamine: iga sektsiooni skoor eraldi ja summeeri
    // Ebaõnnestunud jäävad iga osa pingeritta viimaseks; teised erandid saavad kindla karistuse.
    const exceptionResults = activeResults.filter((r) => r.exceptionLabel && !isFailedResult(r, element.exceptions))
    const normalResults = activeResults.filter((r) => !r.exceptionLabel || isFailedResult(r, element.exceptions))
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
        exceptions: element.exceptions,
        maxValue: section.maxValue,
      }
      const sectionScored = calculateScores(mockElement, withEffectiveHC(normalResults, element.order), config, { failedWithoutRanking: "WORST" })
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

  await replaceComputedScores(tx, elementId, scored)
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
