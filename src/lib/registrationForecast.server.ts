import type { Prisma } from "@prisma/client"
import { buildRegistrationStatistics, parseRegistrationStatistics } from "./registrationForecast"

export async function loadRegistrationStatistics(tx: Prisma.TransactionClient, competitionId: string, now = new Date(), fresh = false) {
  const competition = await tx.competition.findUniqueOrThrow({
    where: { id: competitionId },
    select: { registrationStatistics: true, registrationOpensAt: true, registrationClosesAt: true,
      registrationCapacity: true, registrationFinalizedAt: true, personalDataPurgedAt: true },
  })
  const stored = parseRegistrationStatistics(competition.registrationStatistics)
  if (!fresh && stored && (competition.registrationFinalizedAt || competition.personalDataPurgedAt)) return stored
  const [applications, undatedTeams] = await Promise.all([
    tx.registrationApplication.findMany({
      where: { competitionId, submittedAt: { not: null } },
      select: { submittedAt: true, status: true,
        events: { select: { createdAt: true, toStatus: true, fromStatus: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
    }),
    // Legacy/manual teams have no complete application event history. Do not invent dates.
    tx.team.count({ where: { competitionId, registrationApplication: null } }),
  ])
  return buildRegistrationStatistics({ applications, undatedTeams,
    opensAt: competition.registrationOpensAt, closesAt: competition.registrationFinalizedAt && (!competition.registrationClosesAt || competition.registrationFinalizedAt < competition.registrationClosesAt)
      ? competition.registrationFinalizedAt : competition.registrationClosesAt,
    capacity: competition.registrationCapacity }, now)
}

export async function archiveRegistrationStatistics(tx: Prisma.TransactionClient, competitionId: string, now = new Date(), fresh = false) {
  const statistics = await loadRegistrationStatistics(tx, competitionId, now, fresh)
  await tx.competition.update({ where: { id: competitionId }, data: { registrationStatistics: JSON.stringify(statistics) } })
}
