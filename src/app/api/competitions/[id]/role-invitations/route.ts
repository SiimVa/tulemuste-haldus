import { withSecurityRoute } from "@/lib/securityRoute.server"
import { randomBytes } from "node:crypto"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import {
  canAccessCompetition,
  canManageCompetitionMembers,
} from "@/lib/competitionAccess"
import {
  CompetitionRoleAssignmentError,
  validateCompetitionRoleTargets,
} from "@/lib/competitionRoleAssignments.server"
import {
  getRoleInvitationState,
  parseStoredRoleInvitation,
  roleInvitationExpiresAt,
  serializeRoleInvitationValues,
} from "@/lib/competitionRoleInvitations"
import { hashCompetitionRoleInvitationToken } from "@/lib/competitionRoleInvitations.server"
import { parseCompetitionRoleManagementRequest } from "@/lib/competitionRoleManagement"
import { prisma } from "@/lib/prisma"

function actorFromSession(session: {
  user: { id: string; role?: string | null }
}) {
  return { id: session.user.id, role: session.user.role }
}

async function authorizeInvitationManager(competitionId: string) {
  const session = await auth()
  if (!session?.user?.id) {
    return { session: null, allowed: false, canManageOrganizers: false }
  }
  const actor = actorFromSession(session)
  const [allowed, canManageOrganizers] = await Promise.all([
    canAccessCompetition(competitionId, actor),
    canManageCompetitionMembers(competitionId, actor),
  ])
  return { session, allowed, canManageOrganizers }
}

async function handleGET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { session, allowed } = await authorizeInvitationManager(id)
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!allowed) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  }

  const invitations = await prisma.competitionRoleInvitation.findMany({
    where: { competitionId: id, acceptedAt: null, revokedAt: null },
    select: {
      id: true,
      email: true,
      roles: true,
      elementIds: true,
      teamIds: true,
      expiresAt: true,
      createdAt: true,
      invitedBy: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  })

  return NextResponse.json(
    invitations.flatMap((invitation) => {
      const values = parseStoredRoleInvitation(invitation)
      if (!values) return []
      return [
        {
          id: invitation.id,
          email: invitation.email,
          ...values,
          state: getRoleInvitationState(invitation),
          expiresAt: invitation.expiresAt,
          createdAt: invitation.createdAt,
          invitedBy: invitation.invitedBy,
        },
      ]
    })
  )
}

async function handlePOST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { session, allowed, canManageOrganizers } =
    await authorizeInvitationManager(id)
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!allowed) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  }

  const parsed = parseCompetitionRoleManagementRequest(
    await req.json().catch(() => null)
  )
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  const { email, roles, elementIds, teamIds } = parsed.value
  if (roles.length === 0) {
    return NextResponse.json(
      { error: "Kutse jaoks tuleb valida vähemalt üks roll" },
      { status: 400 }
    )
  }
  if (roles.includes("ORGANIZER") && !canManageOrganizers) {
    return NextResponse.json(
      {
        error:
          "Korraldaja kutset saab luua ainult võistluse omanik või administraator",
      },
      { status: 403 }
    )
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  })
  if (existingUser) {
    return NextResponse.json(
      {
        error: "Selle e-postiga konto on juba olemas; määra roll otse",
        code: "USER_EXISTS",
      },
      { status: 409 }
    )
  }

  try {
    await validateCompetitionRoleTargets({
      competitionId: id,
      elementIds,
      teamIds,
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

  const token = randomBytes(32).toString("base64url")
  const stored = serializeRoleInvitationValues({ roles, elementIds, teamIds })
  const expiresAt = roleInvitationExpiresAt()
  const invitation = await prisma.competitionRoleInvitation.upsert({
    where: { competitionId_email: { competitionId: id, email } },
    create: {
      competitionId: id,
      email,
      tokenHash: hashCompetitionRoleInvitationToken(token),
      ...stored,
      invitedById: session.user.id,
      expiresAt,
    },
    update: {
      tokenHash: hashCompetitionRoleInvitationToken(token),
      ...stored,
      invitedById: session.user.id,
      expiresAt,
      acceptedAt: null,
      acceptedById: null,
      revokedAt: null,
    },
    select: {
      id: true,
      email: true,
      expiresAt: true,
      createdAt: true,
    },
  })

  return NextResponse.json(
    {
      invitation: { ...invitation, roles, elementIds, teamIds },
      invitationUrl: `/invitations/${token}`,
    },
    { status: 201 }
  )
}

async function handleDELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { session, allowed, canManageOrganizers } =
    await authorizeInvitationManager(id)
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!allowed) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const invitationId =
    typeof body.invitationId === "string" ? body.invitationId : ""
  if (!invitationId) {
    return NextResponse.json({ error: "Kutse ID puudub" }, { status: 400 })
  }

  const invitation = await prisma.competitionRoleInvitation.findFirst({
    where: { id: invitationId, competitionId: id },
    select: { roles: true, elementIds: true, teamIds: true },
  })
  if (!invitation) {
    return NextResponse.json({ error: "Kutset ei leitud" }, { status: 404 })
  }
  const values = parseStoredRoleInvitation(invitation)
  if (!values) {
    return NextResponse.json({ error: "Kutse andmed on vigased" }, { status: 409 })
  }
  if (values.roles.includes("ORGANIZER") && !canManageOrganizers) {
    return NextResponse.json(
      { error: "Korraldaja kutset saab tühistada ainult omanik või administraator" },
      { status: 403 }
    )
  }

  await prisma.competitionRoleInvitation.update({
    where: { id: invitationId },
    data: { revokedAt: new Date() },
  })
  return NextResponse.json({ ok: true })
}

export const GET = withSecurityRoute("/api/competitions/[id]/role-invitations", handleGET)
export const POST = withSecurityRoute("/api/competitions/[id]/role-invitations", handlePOST)
export const DELETE = withSecurityRoute("/api/competitions/[id]/role-invitations", handleDELETE)
