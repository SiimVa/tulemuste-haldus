import { withSecurityRoute } from "@/lib/securityRoute.server"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import {
  canAccessCompetition,
  canManageCompetitionMembers,
} from "@/lib/competitionAccess"
import {
  CompetitionRoleAssignmentError,
  updateCompetitionMemberRoles,
} from "@/lib/competitionRoleAssignments.server"
import {
  getRoleInvitationState,
  mergeCompetitionRoleInvitation,
  parseStoredRoleInvitation,
} from "@/lib/competitionRoleInvitations"
import { findCompetitionRoleInvitationByToken } from "@/lib/competitionRoleInvitations.server"
import { prisma } from "@/lib/prisma"

async function handlePOST(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const session = await auth()
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { token } = await params
  const invitation = await findCompetitionRoleInvitationByToken(token)
  if (!invitation) {
    return NextResponse.json({ error: "Kutset ei leitud" }, { status: 404 })
  }

  const state = getRoleInvitationState(invitation)
  if (state === "ACCEPTED" && invitation.acceptedById === session.user.id) {
    return NextResponse.json({ ok: true, alreadyAccepted: true })
  }
  if (state !== "PENDING") {
    return NextResponse.json(
      {
        error:
          state === "EXPIRED"
            ? "Kutse on aegunud"
            : state === "REVOKED"
              ? "Kutse on tühistatud"
              : "Kutse on juba kasutatud",
      },
      { status: 410 }
    )
  }

  if (
    session.user.email.trim().toLowerCase() !==
    invitation.email.trim().toLowerCase()
  ) {
    return NextResponse.json(
      { error: "Logi sisse kutsele määratud e-postiga" },
      { status: 403 }
    )
  }

  const values = parseStoredRoleInvitation(invitation)
  if (!values) {
    return NextResponse.json(
      { error: "Kutse andmed on vigased" },
      { status: 409 }
    )
  }

  const inviter = {
    id: invitation.invitedBy.id,
    role: invitation.invitedBy.role,
  }
  const [inviterMayManage, inviterMayManageOrganizers] = await Promise.all([
    canAccessCompetition(invitation.competitionId, inviter),
    values.roles.includes("ORGANIZER")
      ? canManageCompetitionMembers(invitation.competitionId, inviter)
      : Promise.resolve(false),
  ])
  if (
    !inviterMayManage ||
    (values.roles.includes("ORGANIZER") && !inviterMayManageOrganizers)
  ) {
    return NextResponse.json(
      { error: "Kutse andjal ei ole enam nende õiguste määramise luba" },
      { status: 403 }
    )
  }

  const existingMembership = await prisma.competitionMember.findUnique({
    where: {
      competitionId_userId: {
        competitionId: invitation.competitionId,
        userId: session.user.id,
      },
    },
    select: {
      roles: { select: { role: true } },
      judgedElements: { select: { elementId: true } },
      representedTeams: { select: { teamId: true } },
    },
  })
  const mergedValues = mergeCompetitionRoleInvitation(
    {
      roles: existingMembership?.roles.map(({ role }) => role) ?? [],
      elementIds:
        existingMembership?.judgedElements.map(({ elementId }) => elementId) ??
        [],
      teamIds:
        existingMembership?.representedTeams.map(({ teamId }) => teamId) ?? [],
    },
    values
  )

  try {
    await updateCompetitionMemberRoles({
      competitionId: invitation.competitionId,
      userId: session.user.id,
      ...mergedValues,
      canManageOrganizers: inviterMayManageOrganizers,
    })
  } catch (error) {
    if (error instanceof CompetitionRoleAssignmentError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      )
    }
    throw error
  }

  await prisma.competitionRoleInvitation.updateMany({
    where: {
      id: invitation.id,
      acceptedAt: null,
      revokedAt: null,
    },
    data: { acceptedAt: new Date(), acceptedById: session.user.id },
  })

  return NextResponse.json({
    ok: true,
    competitionId: invitation.competitionId,
  })
}

export const POST = withSecurityRoute("/api/invitations/[token]/accept", handlePOST)
