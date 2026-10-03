import { Prisma } from "@prisma/client"
import { setTeamRepresentative } from "@/lib/teamRepresentatives.server"
import { archiveRegistrationStatistics } from "@/lib/registrationForecast.server"
import { withSecurityRoute } from "@/lib/securityRoute.server"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { canAccessCompetition } from "@/lib/competitionAccess"
import {
  getCompetitionMandateStatus,
  getCompetitionRegistrationStatus,
} from "@/lib/competitionPhases"
import { prisma } from "@/lib/prisma"
import {
  deliverPendingNotificationsSafely,
  queueMandateOpenedNotifications,
} from "@/lib/notifications.server"
import {
  type MemberAnswer,
  parseFormAnswer,
} from "@/lib/registrationForm"
import {
  ensureCompetitorRoles,
  resolveTeamMemberAccounts,
} from "@/lib/teamMemberAccounts.server"
import {
  analyzeFinalize,
  finalizeIssueKeys,
  type ApplicationIssues,
} from "@/lib/registrationFinalize"

function nextTeamCode(existing: Set<string>, sequence: number): string {
  let number = sequence
  while (true) {
    const code = `REG-${String(number).padStart(3, "0")}`
    if (!existing.has(code)) {
      existing.add(code)
      return code
    }
    number += 1
  }
}

const UNRESOLVED_LABELS: Record<string, string> = {
  WAITLISTED: "ootenimekirjas",
  PENDING_REVIEW: "ootab ülevaatamist",
  CHANGES_REQUESTED: "vajab täiendamist",
  DRAFT: "mustand",
}

class FinalizeBlockedError extends Error {
  constructor(public readonly blocking: string[]) {
    super(blocking.join(" "))
  }
}

class FinalizeIssuesError extends Error {
  constructor(public readonly issues: ApplicationIssues[]) {
    super("Kontrolli enne kinnitamist avalduste e-posti kordusi")
  }
}

type MemberInput = {
  name: string
  email?: string
  isCaptain: boolean
  assignmentRole?: string
}

// Kõik kinnitamist takistavad põhjused ja e-posti kordused korraga, et
// korraldaja saaks need ühe ülevaatusega lahendada.
async function prepareFinalize(tx: Prisma.TransactionClient, competitionId: string) {
  const competition = await tx.competition.findUnique({
    where: { id: competitionId },
    select: {
      registrationOverride: true,
      registrationOpensAt: true,
      registrationClosesAt: true,
      registrationFinalizedAt: true,
      mandateOverride: true,
      mandateOpensAt: true,
      mandateClosesAt: true,
      mandateFinalizedAt: true,
    },
  })
  if (!competition) throw new Error("Võistlust ei leitud")
  const blocking: string[] = []
  if (competition.registrationFinalizedAt) {
    blocking.push("Osalejate nimekiri on juba kinnitatud.")
  } else if (getCompetitionRegistrationStatus(competition) === "OPEN") {
    blocking.push("Sulge registreerimine enne nimekirja kinnitamist.")
  }

  const unresolved = await tx.registrationApplication.findMany({
    where: { competitionId, status: { in: Object.keys(UNRESOLVED_LABELS) } },
    select: { teamName: true, status: true },
    orderBy: [{ submittedAt: "asc" }, { createdAt: "asc" }],
  })
  if (unresolved.length > 0) {
    blocking.push(
      `Enne kinnitamist võta vastu või lükka tagasi kõik ootel avaldused: ${unresolved
        .map((application) => `${application.teamName} (${UNRESOLVED_LABELS[application.status]})`)
        .join(", ")}.`
    )
  }

  const applications = await tx.registrationApplication.findMany({
    where: { competitionId, status: "CONFIRMED", teamId: null },
    include: {
      class: { select: { name: true } },
      fieldValues: {
        include: {
          field: { select: { id: true, type: true, isActive: true } },
        },
      },
    },
    orderBy: [{ submittedAt: "asc" }, { createdAt: "asc" }],
  })
  const existingMembers = await tx.teamMember.findMany({
    where: { competitionId },
    select: { email: true, user: { select: { email: true } }, team: { select: { name: true } } },
  })
  const analysis = analyzeFinalize<MemberInput>(
    applications.map((application) => ({
      id: application.id,
      teamName: application.teamName,
      members: application.fieldValues.flatMap((fieldValue) => {
        if (!fieldValue.field.isActive || fieldValue.field.type !== "MEMBER_LIST") return []
        const value = parseFormAnswer(fieldValue.value)
        if (!Array.isArray(value)) return []
        return value
          .filter(
            (member): member is MemberAnswer =>
              typeof member === "object" &&
              member !== null &&
              typeof member.name === "string" &&
              Boolean(member.name.trim())
          )
          .map((member) => ({
            name: member.name.trim(),
            email: member.email,
            isCaptain: Boolean(member.isCaptain),
            assignmentRole: member.assignmentRole,
          }))
      }),
    })),
    existingMembers.map((member) => ({ email: member.email, userEmail: member.user?.email ?? null, teamName: member.team.name }))
  )
  return { competition, blocking, applications, analysis }
}

// Eelkontroll: mis takistab kinnitamist ja millised e-posti kordused leiti.
async function handleGET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { id: competitionId } = await params
  if (!await canAccessCompetition(competitionId, { id: session.user.id, role: session.user.role })) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  }
  try {
    const { blocking, applications, analysis } = await prisma.$transaction((tx) => prepareFinalize(tx, competitionId))
    return NextResponse.json(
      { blocking, issues: analysis.issues, applicationCount: applications.length },
      { headers: { "Cache-Control": "private, no-store" } }
    )
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Kontroll ebaõnnestus" }, { status: 409 })
  }
}

async function handlePOST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const actor = session.user
  const { id: competitionId } = await params
  const allowed = await canAccessCompetition(competitionId, {
    id: actor.id,
    role: actor.role,
  })
  if (!allowed) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  }

  // Korraldaja kinnitab, et näidatud kordused on lubatud; uued kordused vajavad uut ülevaatust.
  const body = await req.json().catch(() => ({}))
  const accepted = new Set(
    Array.isArray(body?.acceptedIssueKeys)
      ? body.acceptedIssueKeys.filter((key: unknown): key is string => typeof key === "string").slice(0, 5000)
      : []
  )

  try {
    const result = await prisma.$transaction(async (tx) => {
      const { competition, blocking, applications, analysis } = await prepareFinalize(tx, competitionId)
      if (blocking.length > 0) throw new FinalizeBlockedError(blocking)
      if (finalizeIssueKeys(analysis.issues).some((key) => !accepted.has(key))) {
        throw new FinalizeIssuesError(analysis.issues)
      }
      const existingTeams = await tx.team.findMany({
        where: { competitionId },
        select: { code: true },
      })
      const codes = new Set(existingTeams.map(({ code }) => code))
      let createdTeams = 0

      for (const application of applications) {
        // Kordunud e-post on eelkontrollis eemaldatud: see jääb esimesele liikmele.
        const members = analysis.members.get(application.id) ?? []
        const resolvedMembers = await resolveTeamMemberAccounts(
          tx,
          competitionId,
          null,
          members.map((member) => ({
            name: member.name,
            role: "COMPETITOR",
            email: member.email,
            isCaptain: member.isCaptain,
            assignmentRole: member.assignmentRole,
          }))
        )
        const team = await tx.team.create({
          data: {
            competitionId,
            name: application.teamName,
            class: application.class?.name ?? null,
            code: nextTeamCode(codes, createdTeams + 1),
            registrationStatus: "APPROVED",
            pendingRepresentativeEmail: application.pendingRepresentativeEmail,
            pendingRepresentativeName: application.pendingRepresentativeName,
            formValues: {
              create: application.fieldValues.map((fieldValue) => ({
                fieldId: fieldValue.fieldId,
                value: fieldValue.value,
              })),
            },
            members: {
              create: resolvedMembers.map((member) => ({
                name: member.name,
                role: member.role,
                email: member.email,
                userId: member.userId,
                isCaptain: member.isCaptain,
                assignmentRole: member.assignmentRole,
              })),
            },
          },
        })
        await ensureCompetitorRoles(
          tx,
          competitionId,
          resolvedMembers.flatMap(({ userId }) => (userId ? [userId] : []))
        )
        if (!application.pendingRepresentativeEmail) {
          await setTeamRepresentative(tx, competitionId, team.id, application.submittedById)
        }
        await tx.registrationApplication.update({
          where: { id: application.id },
          data: { teamId: team.id },
        })
        createdTeams += 1
      }

      const finalizedAt = new Date()
      await tx.competition.update({
        where: { id: competitionId },
        data: {
          registrationFinalizedAt: finalizedAt,
          registrationOverride: "CLOSED",
        },
      })
      await tx.competitionPhaseEvent.create({
        data: {
          competitionId,
          phase: "REGISTRATION",
          action: "FINALIZED",
          actorId: actor.id,
        },
      })

      if (
        getCompetitionMandateStatus({
          ...competition,
          registrationFinalizedAt: finalizedAt,
        }) === "OPEN"
      ) {
        await queueMandateOpenedNotifications(tx, competitionId)
      }

      await archiveRegistrationStatistics(tx, competitionId, finalizedAt, true)
      return { finalizedAt, createdTeams }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

    await deliverPendingNotificationsSafely()
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof FinalizeBlockedError) {
      return NextResponse.json({ error: error.message, blocking: error.blocking }, { status: 409 })
    }
    if (error instanceof FinalizeIssuesError) {
      return NextResponse.json({ error: error.message, issues: error.issues }, { status: 409 })
    }
    const message =
      error instanceof Error ? error.message : "Nimekirja kinnitamine ebaõnnestus"
    return NextResponse.json({ error: message }, { status: 409 })
  }
}

export const GET = withSecurityRoute("/api/competitions/[id]/registration-applications/finalize", handleGET)
export const POST = withSecurityRoute("/api/competitions/[id]/registration-applications/finalize", handlePOST)
