import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import {
  canAccessCompetition,
  teamBelongsToCompetition,
} from "@/lib/competitionAccess"
import { prisma } from "@/lib/prisma"
import {
  canReviewWorkflow,
  isTeamWorkflowDecision,
  isTeamWorkflowPhase,
  isTeamWorkflowStatus,
} from "@/lib/teamWorkflow"
import {
  parseTeamMemberRoles,
  validateTeamComposition,
} from "@/lib/teamComposition"

export async function POST(
  req: Request,
  {
    params,
  }: { params: Promise<{ id: string; teamId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id: competitionId, teamId } = await params
  const allowed = await canAccessCompetition(competitionId, {
    id: session.user.id,
    role: session.user.role,
  })
  if (!allowed) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  }
  if (!await teamBelongsToCompetition(teamId, competitionId)) {
    return NextResponse.json({ error: "Võistkonda ei leitud" }, { status: 404 })
  }

  const body = await req.json()
  if (
    !isTeamWorkflowPhase(body.phase) ||
    !isTeamWorkflowDecision(body.decision)
  ) {
    return NextResponse.json(
      { error: "Vigane etapp või otsus" },
      { status: 400 }
    )
  }

  const note = typeof body.note === "string" ? body.note.trim() : ""
  if (note.length > 2000) {
    return NextResponse.json(
      { error: "Märkus on liiga pikk" },
      { status: 400 }
    )
  }
  if (body.decision === "REQUEST_CHANGES" && !note) {
    return NextResponse.json(
      { error: "Parandamisele saatmisel lisa märkus" },
      { status: 400 }
    )
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      members: {
        select: { role: true, isCaptain: true, assignmentRole: true },
      },
      representative: { select: { id: true } },
      competition: {
        select: {
          status: true,
          representativeRequired: true,
          captainRequired: true,
          teamMemberRoles: true,
        },
      },
    },
  })
  if (!team) {
    return NextResponse.json({ error: "Võistkonda ei leitud" }, { status: 404 })
  }
  if (team.competition.status !== "SETUP") {
    return NextResponse.json(
      { error: "Aktiivse või lõppenud võistluse töövoogu ei saa muuta" },
      { status: 409 }
    )
  }

  const currentStatus =
    body.phase === "REGISTRATION"
      ? team.registrationStatus
      : team.mandateStatus
  if (
    !isTeamWorkflowStatus(currentStatus) ||
    !canReviewWorkflow(currentStatus)
  ) {
    return NextResponse.json(
      { error: "Läbi saab vaadata ainult esitatud etappi" },
      { status: 409 }
    )
  }

  if (
    body.phase === "MANDATE" &&
    body.decision === "APPROVE" &&
    !team.members.some((member) => member.role === "COMPETITOR")
  ) {
    return NextResponse.json(
      { error: "Mandaadis peab olema vähemalt üks võistleja" },
      { status: 409 }
    )
  }
  if (body.phase === "MANDATE" && body.decision === "APPROVE") {
    const compositionError = validateTeamComposition(
      team.members,
      {
        representativeRequired: team.competition.representativeRequired,
        captainRequired: team.competition.captainRequired,
        memberRoles: parseTeamMemberRoles(team.competition.teamMemberRoles),
      },
      Boolean(team.representative)
    )
    if (compositionError) {
      return NextResponse.json({ error: compositionError }, { status: 409 })
    }
  }

  const status =
    body.decision === "APPROVE" ? "APPROVED" : "CHANGES_REQUESTED"
  const reviewedAt = new Date()
  const updated = await prisma.team.update({
    where: { id: teamId },
    data:
      body.phase === "REGISTRATION"
        ? {
            registrationStatus: status,
            registrationReviewedAt: reviewedAt,
            registrationReviewNote: note || null,
          }
        : {
            mandateStatus: status,
            mandateReviewedAt: reviewedAt,
            mandateReviewNote: note || null,
          },
    include: {
      members: true,
      representative: {
        include: {
          member: {
            include: {
              user: { select: { id: true, name: true, email: true } },
            },
          },
        },
      },
    },
  })

  return NextResponse.json(updated)
}
