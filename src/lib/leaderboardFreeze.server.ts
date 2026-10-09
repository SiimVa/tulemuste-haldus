import "server-only"

import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { invalidatePublicSnapshots } from "@/lib/publicSnapshotCache"
import { parseFreezeSnapshot, type FreezeSnapshot, type PublicFreeze } from "@/lib/leaderboardFreeze"

type Tx = Prisma.TransactionClient

async function createFreezeSnapshot(tx: Tx, competitionId: string, takenAt: Date): Promise<FreezeSnapshot> {
  const [scores, penalties, miscEntries, teams, elements] = await Promise.all([
    tx.computedScore.findMany({ where: { element: { competitionId } }, select: { elementId: true, teamId: true, penaltyPoints: true } }),
    tx.manualPenalty.findMany({ where: { competitionId }, select: { teamId: true, points: true, description: true, enteredAt: true } }),
    tx.miscEntry.findMany({
      where: { element: { competitionId, type: { in: ["OTHER", "ABANDONMENT"] } } },
      select: { elementId: true, teamId: true, points: true, description: true, element: { select: { type: true } } },
    }),
    tx.team.findMany({
      where: { competitionId },
      select: { id: true, isHorsDeCompetition: true, hcFromElementOrder: true, dnfFromElementOrder: true, dnfReason: true, dqFromElementOrder: true, dnsFlag: true },
    }),
    tx.scoringElement.findMany({ where: { competitionId }, select: { id: true, isCancelled: true } }),
  ])
  return {
    version: 1,
    takenAt: takenAt.toISOString(),
    scores: scores.map((score) => ({ elementId: score.elementId, teamId: score.teamId, points: score.penaltyPoints })),
    penalties: penalties.map((penalty) => ({ ...penalty, enteredAt: penalty.enteredAt.toISOString() })),
    miscEntries: miscEntries.map((entry) => ({ elementId: entry.elementId, teamId: entry.teamId, points: entry.points, description: entry.description, elementType: entry.element.type })),
    teams,
    elements,
  }
}

// Võtab snapshot'i, kui külmutamise aeg on käes ja seda veel pole. Samaaegsed
// päringud ei kirjuta üksteise snapshot'i üle.
async function ensureSnapshot(competitionId: string, now: Date): Promise<PublicFreeze | null> {
  const result = await prisma.$transaction(async (tx) => {
    const freeze = await tx.leaderboardFreeze.findUnique({ where: { competitionId } })
    if (!freeze || freeze.freezeAt > now) return null
    if (freeze.snapshot) return { freezeAt: freeze.freezeAt, snapshot: parseFreezeSnapshot(freeze.snapshot, freeze.freezeAt) }
    const snapshot = await createFreezeSnapshot(tx, competitionId, now)
    const updated = await tx.leaderboardFreeze.updateMany({
      where: { competitionId, snapshotAt: null },
      data: { snapshot: snapshot as unknown as Prisma.InputJsonValue, snapshotAt: now },
    })
    if (updated.count === 1) return { freezeAt: freeze.freezeAt, snapshot }
    const stored = await tx.leaderboardFreeze.findUnique({ where: { competitionId } })
    return stored ? { freezeAt: stored.freezeAt, snapshot: parseFreezeSnapshot(stored.snapshot, stored.freezeAt) } : null
  }, { maxWait: 5_000, timeout: 20_000 })
  if (result) invalidatePublicSnapshots(competitionId)
  return result
}

// Avalike vaadete seis: null = jooksvad tulemused, muidu külmutatud snapshot.
export async function getPublicFreeze(competitionId: string, now = new Date()): Promise<PublicFreeze | null> {
  const freeze = await prisma.leaderboardFreeze.findUnique({
    where: { competitionId },
    select: { freezeAt: true, snapshot: true },
  })
  if (!freeze || freeze.freezeAt > now) return null
  if (freeze.snapshot) return { freezeAt: freeze.freezeAt, snapshot: parseFreezeSnapshot(freeze.snapshot, freeze.freezeAt) }
  return ensureSnapshot(competitionId, now)
}

export type FreezeState = { freezeAt: Date; frozen: boolean; snapshotAt: Date | null } | null

export async function getFreezeState(competitionId: string, now = new Date()): Promise<FreezeState> {
  const freeze = await prisma.leaderboardFreeze.findUnique({ where: { competitionId }, select: { freezeAt: true, snapshotAt: true } })
  return freeze ? { freezeAt: freeze.freezeAt, frozen: freeze.freezeAt <= now, snapshotAt: freeze.snapshotAt } : null
}

// Määrab külmutamise aja. Möödunud või praegune aeg külmutab kohe.
export async function setLeaderboardFreeze(competitionId: string, freezeAt: Date, userId: string, now = new Date()) {
  await prisma.leaderboardFreeze.upsert({
    where: { competitionId },
    create: { competitionId, freezeAt, createdById: userId },
    update: { freezeAt, snapshot: Prisma.DbNull, snapshotAt: null, createdById: userId },
  })
  invalidatePublicSnapshots(competitionId)
  if (freezeAt <= now) await ensureSnapshot(competitionId, now)
}

export async function revealLeaderboard(competitionId: string) {
  await prisma.leaderboardFreeze.deleteMany({ where: { competitionId } })
  invalidatePublicSnapshots(competitionId)
}

// Cron: ajastatud külmutused saavad snapshot'i ka siis, kui keegi avalikku
// vaadet parajasti ei ava.
export async function processDueLeaderboardFreezes(now = new Date()) {
  const due = await prisma.leaderboardFreeze.findMany({
    where: { snapshotAt: null, freezeAt: { lte: now } },
    select: { competitionId: true },
    take: 50,
  })
  let taken = 0
  for (const { competitionId } of due) {
    if (await ensureSnapshot(competitionId, now)) taken++
  }
  return { taken }
}

export async function processDueLeaderboardFreezesSafely(now = new Date()) {
  try {
    return await processDueLeaderboardFreezes(now)
  } catch (error) {
    console.error("Leaderboard freeze processing failed:", error instanceof Error ? error.message : error)
    return { taken: 0, failed: true }
  }
}
