import type { Prisma } from "@prisma/client"
import { canAccessCompetition } from "@/lib/competitionAccess"
import { queueUserNotification } from "@/lib/notifications.server"
import {
  buildOrganizerDigest,
  isDigestInterval,
  nextDigestAt,
  ORGANIZER_DIGEST_TYPE,
  type DigestInput,
  type DigestInterval,
} from "@/lib/organizerDigest"
import { prisma } from "@/lib/prisma"

type DigestSubscription = {
  id: string
  competitionId: string
  userId: string
  registration: boolean
  mandate: boolean
}

async function loadDigestInput(
  tx: Prisma.TransactionClient,
  subscription: DigestSubscription,
  competitionName: string,
  since: Date,
  until: Date
): Promise<DigestInput> {
  const competitionId = subscription.competitionId
  const window = { gt: since, lte: until }
  const applicationEvents = subscription.registration
    ? await tx.registrationApplicationEvent.findMany({
        where: { createdAt: window, application: { competitionId } },
        select: { applicationId: true, fromStatus: true, toStatus: true, actorId: true, createdAt: true, application: { select: { teamName: true } } },
      })
    : []
  const teamRegistrations = subscription.registration
    ? await tx.team.findMany({
        where: { competitionId, registrationApplication: { is: null }, registrationSubmittedAt: window },
        select: { name: true, registrationStatus: true, registrationSubmittedAt: true, registrationReviewedAt: true },
      })
    : []
  const mandateSubmissions = subscription.mandate
    ? await tx.team.findMany({
        where: { competitionId, mandateSubmittedAt: window },
        select: { name: true, mandateStatus: true, mandateSubmittedAt: true, mandateReviewedAt: true },
      })
    : []
  const applications = subscription.registration
    ? await tx.registrationApplication.findMany({ where: { competitionId }, select: { status: true } })
    : []
  const teams = subscription.mandate
    ? await tx.team.findMany({ where: { competitionId }, select: { mandateStatus: true } })
    : []

  // Automaatsel kinnitamisel on ülevaatuse aeg sama mis esitamise aeg.
  const automatic = (status: string, submittedAt: Date | null, reviewedAt: Date | null) =>
    status === "APPROVED" && submittedAt !== null && reviewedAt?.getTime() === submittedAt.getTime()

  return {
    competitionName,
    subscriberId: subscription.userId,
    registration: subscription.registration,
    mandate: subscription.mandate,
    applicationEvents: applicationEvents.map((event) => ({
      applicationId: event.applicationId,
      teamName: event.application.teamName,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      actorId: event.actorId,
      createdAt: event.createdAt,
    })),
    teamRegistrations: teamRegistrations.map((team) => ({
      teamName: team.name,
      status: team.registrationStatus,
      automatic: automatic(team.registrationStatus, team.registrationSubmittedAt, team.registrationReviewedAt),
    })),
    mandateSubmissions: mandateSubmissions.map((team) => ({
      teamName: team.name,
      status: team.mandateStatus,
      automatic: automatic(team.mandateStatus, team.mandateSubmittedAt, team.mandateReviewedAt),
    })),
    applicationStatuses: applications.map(({ status }) => status),
    teamMandateStatuses: teams.map(({ mandateStatus }) => mandateStatus),
  }
}

// Teavituste cron: koostab kokkuvõtted tellimustele, mille saatmisaeg on käes.
// Periood märgitakse hõlmatuks samas tehingus, kus teavitus lisatakse, nii et
// paralleelsed käivitused sama perioodi kaks korda ei saada.
export async function enqueueDueOrganizerDigests(now = new Date()) {
  const due = await prisma.organizerDigestSubscription.findMany({
    where: { nextSendAt: { lte: now } },
    include: {
      user: { select: { id: true, email: true, role: true } },
      competition: { select: { name: true } },
    },
    orderBy: { nextSendAt: "asc" },
    take: 200,
  })

  let queued = 0
  for (const subscription of due) {
    // Korraldaja õigused võivad olla vahepeal ära võetud.
    if (!await canAccessCompetition(subscription.competitionId, subscription.user)) {
      await prisma.organizerDigestSubscription.deleteMany({ where: { id: subscription.id } })
      continue
    }
    const interval: DigestInterval = isDigestInterval(subscription.interval) ? subscription.interval : "DAILY"
    queued += await prisma.$transaction(async (tx) => {
      const claimed = await tx.organizerDigestSubscription.updateMany({
        where: { id: subscription.id, coveredUntil: subscription.coveredUntil, nextSendAt: subscription.nextSendAt },
        data: { coveredUntil: now, nextSendAt: nextDigestAt(interval, now) },
      })
      if (claimed.count === 0) return 0
      const input = await loadDigestInput(tx, subscription, subscription.competition.name, subscription.coveredUntil, now)
      const content = buildOrganizerDigest(input)
      if (!content) return 0
      await queueUserNotification(tx, {
        type: ORGANIZER_DIGEST_TYPE,
        title: content.title,
        message: content.lines.join("\n"),
        userId: subscription.user.id,
        competitionId: subscription.competitionId,
        href: `/dashboard/competitions/${subscription.competitionId}/registrations`,
        emailTo: subscription.user.email,
        dedupeKey: `organizer-digest:${subscription.id}:${now.toISOString()}`,
      })
      return 1
    })
  }
  return queued
}

export async function enqueueDueOrganizerDigestsSafely() {
  try {
    return await enqueueDueOrganizerDigests()
  } catch (error) {
    console.error("Korraldaja kokkuvõtete koostamine ebaõnnestus:", error instanceof Error ? error.message : String(error))
    return 0
  }
}
