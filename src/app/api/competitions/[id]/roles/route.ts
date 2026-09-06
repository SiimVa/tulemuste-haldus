import { withSecurityRoute } from "@/lib/securityRoute.server"
import { setSecurityTargets } from "@/lib/security.server"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import {
  canAccessCompetition,
  canManageCompetitionMembers,
} from "@/lib/competitionAccess"
import {
  parseCompetitionRoleManagementRequest,
} from "@/lib/competitionRoleManagement"
import {
  CompetitionRoleAssignmentError,
  competitionMemberRoleInclude,
  updateCompetitionMemberRoles,
} from "@/lib/competitionRoleAssignments.server"
import { prisma } from "@/lib/prisma"

function actorFromSession(session: {
  user: { id: string; role?: string | null }
}) {
  return { id: session.user.id, role: session.user.role }
}

async function authorizeRoleManager(competitionId: string) {
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
  const { session, allowed, canManageOrganizers } =
    await authorizeRoleManager(id)
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!allowed) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  }

  const competition = await prisma.competition.findUnique({
    where: { id },
    select: {
      organizerId: true,
      organizer: { select: { id: true, name: true, email: true } },
      members: {
        include: competitionMemberRoleInclude,
        orderBy: { addedAt: "asc" },
      },
    },
  })
  if (!competition) {
    return NextResponse.json({ error: "Võistlust ei leitud" }, { status: 404 })
  }

  const ownerMembership = competition.members.find(
    ({ userId }) => userId === competition.organizerId
  )
  const owner = ownerMembership ?? {
    id: `owner:${competition.organizerId}`,
    userId: competition.organizerId,
    user: competition.organizer,
    roles: [{ role: "OWNER", addedAt: new Date(0) }],
    judgedElements: [],
    representedTeams: [],
    competitionId: id,
    addedAt: new Date(0),
  }

  return NextResponse.json({
    canManageOrganizers,
    owner,
    members: competition.members.filter(
      ({ userId }) => userId !== competition.organizerId
    ),
  })
}

async function handlePUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { session, allowed, canManageOrganizers } =
    await authorizeRoleManager(id)
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

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  })
  if (!user) {
    return NextResponse.json(
      {
        error: "Selle e-postiga kasutajakontot ei leitud",
        code: "USER_NOT_FOUND",
      },
      { status: 404 }
    )
  }
  setSecurityTargets({ competitionId: id, userId: user.id })
  try {
    const member = await updateCompetitionMemberRoles({
      competitionId: id,
      userId: user.id,
      roles,
      elementIds,
      teamIds,
      canManageOrganizers,
    })
    await prisma.competitionRoleInvitation.updateMany({
      where: {
        competitionId: id,
        email,
        acceptedAt: null,
        revokedAt: null,
      },
      data: { acceptedAt: new Date(), acceptedById: user.id },
    })
    return NextResponse.json({ member })
  } catch (error) {
    if (error instanceof CompetitionRoleAssignmentError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      )
    }
    throw error
  }
}

export const GET = withSecurityRoute("/api/competitions/[id]/roles", handleGET)
export const PUT = withSecurityRoute("/api/competitions/[id]/roles", handlePUT)
