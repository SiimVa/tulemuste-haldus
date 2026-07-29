import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { canManageTeamRegistration } from "@/lib/competitionAccess"
import { prisma } from "@/lib/prisma"
import {
  canSubmitMandate,
  canSubmitRegistration,
  isTeamWorkflowPhase,
  isTeamWorkflowStatus,
} from "@/lib/teamWorkflow"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { teamId } = await params
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      members: { select: { role: true } },
      competition: { select: { status: true } },
    },
  })
  if (!team) {
    return NextResponse.json({ error: "Võistkonda ei leitud" }, { status: 404 })
  }

  const allowed = await canManageTeamRegistration(
    team.competitionId,
    team.id,
    { id: session.user.id, role: session.user.role }
  )
  if (!allowed) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  }
  if (team.competition.status !== "SETUP") {
    return NextResponse.json(
      { error: "Aktiivse või lõppenud võistluse andmeid ei saa esitada" },
      { status: 409 }
    )
  }

  const body = await req.json()
  if (!isTeamWorkflowPhase(body.phase)) {
    return NextResponse.json({ error: "Vigane töövoo etapp" }, { status: 400 })
  }

  const registrationStatus = isTeamWorkflowStatus(team.registrationStatus)
    ? team.registrationStatus
    : "DRAFT"
  const mandateStatus = isTeamWorkflowStatus(team.mandateStatus)
    ? team.mandateStatus
    : "DRAFT"

  if (body.phase === "REGISTRATION") {
    if (!canSubmitRegistration(registrationStatus)) {
      return NextResponse.json(
        { error: "Registreerimist ei saa selles olekus esitada" },
        { status: 409 }
      )
    }

    const updated = await prisma.team.update({
      where: { id: teamId },
      data: {
        registrationStatus: "SUBMITTED",
        registrationSubmittedAt: new Date(),
        registrationReviewedAt: null,
        registrationReviewNote: null,
      },
      include: { members: true, competition: true },
    })
    return NextResponse.json(updated)
  }

  const competitorCount = team.members.filter(
    (member) => member.role === "COMPETITOR"
  ).length
  if (
    !canSubmitMandate(
      registrationStatus,
      mandateStatus,
      competitorCount
    )
  ) {
    return NextResponse.json(
      {
        error:
          competitorCount === 0
            ? "Mandaadis peab olema vähemalt üks võistleja"
            : "Mandaati ei saa selles olekus esitada",
      },
      { status: 409 }
    )
  }

  const updated = await prisma.team.update({
    where: { id: teamId },
    data: {
      mandateStatus: "SUBMITTED",
      mandateSubmittedAt: new Date(),
      mandateReviewedAt: null,
      mandateReviewNote: null,
    },
    include: { members: true, competition: true },
  })
  return NextResponse.json(updated)
}
