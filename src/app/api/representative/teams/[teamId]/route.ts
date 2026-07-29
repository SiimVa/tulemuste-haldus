import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { canManageTeamRegistration } from "@/lib/competitionAccess"
import { prisma } from "@/lib/prisma"
import {
  canEditMandate,
  canEditWorkflow,
  isTeamWorkflowPhase,
  isTeamWorkflowStatus,
} from "@/lib/teamWorkflow"

const teamInclude = {
  members: {
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" as const },
  },
  competition: {
    select: {
      id: true,
      name: true,
      date: true,
      endDate: true,
      location: true,
      status: true,
    },
  },
}

async function getAssignedTeam(
  teamId: string,
  actor: { id: string; role?: string | null }
) {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: teamInclude,
  })
  if (!team) return null

  const allowed = await canManageTeamRegistration(
    team.competitionId,
    team.id,
    actor
  )
  return allowed ? team : false
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { teamId } = await params
  const team = await getAssignedTeam(teamId, {
    id: session.user.id,
    role: session.user.role,
  })

  if (team === null) {
    return NextResponse.json({ error: "Võistkonda ei leitud" }, { status: 404 })
  }
  if (team === false) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  }

  return NextResponse.json(team)
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { teamId } = await params
  const actor = { id: session.user.id, role: session.user.role }
  const team = await getAssignedTeam(teamId, actor)

  if (team === null) {
    return NextResponse.json({ error: "Võistkonda ei leitud" }, { status: 404 })
  }
  if (team === false) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  }
  if (team.competition.status !== "SETUP") {
    return NextResponse.json(
      { error: "Aktiivse või lõppenud võistluse registreerimist ei saa muuta" },
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
    if (!canEditWorkflow(registrationStatus)) {
      return NextResponse.json(
        { error: "Esitatud või kinnitatud registreerimist ei saa muuta" },
        { status: 409 }
      )
    }

    const name = typeof body.name === "string" ? body.name.trim() : ""
    const teamClass =
      typeof body.class === "string" ? body.class.trim() : ""

    if (!name || name.length > 200 || teamClass.length > 100) {
      return NextResponse.json(
        { error: "Kontrolli võistkonna nime ja klassi" },
        { status: 400 }
      )
    }

    const updated = await prisma.team.update({
      where: { id: teamId },
      data: {
        name,
        class: teamClass || null,
      },
      include: teamInclude,
    })
    return NextResponse.json(updated)
  }

  if (!canEditMandate(registrationStatus, mandateStatus)) {
    return NextResponse.json(
      { error: "Mandaat avaneb pärast registreerimise kinnitamist" },
      { status: 409 }
    )
  }
  if (!Array.isArray(body.members) || body.members.length > 100) {
    return NextResponse.json(
      { error: "Liikmete nimekiri on vigane või liiga pikk" },
      { status: 400 }
    )
  }

  const members = body.members
    .map((member: unknown) => {
      const value = member as { name?: unknown; role?: unknown }
      const name =
        typeof value.name === "string" ? value.name.trim() : ""
      const role = value.role === "SUPPORT" ? "SUPPORT" : "COMPETITOR"
      return { name, role }
    })
    .filter((member: { name: string }) => member.name.length > 0)

  if (members.some((member: { name: string }) => member.name.length > 200)) {
    return NextResponse.json(
      { error: "Liikme nimi on liiga pikk" },
      { status: 400 }
    )
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.teamMember.deleteMany({ where: { teamId } })
    if (members.length > 0) {
      await tx.teamMember.createMany({
        data: members.map((member: { name: string; role: string }) => ({
          teamId,
          name: member.name,
          role: member.role,
        })),
      })
    }
    return tx.team.update({
      where: { id: teamId },
      data: { workflowUpdatedAt: new Date() },
      include: teamInclude,
    })
  })

  return NextResponse.json(updated)
}
