import { Prisma } from "@prisma/client"
import { setTeamRepresentative } from "@/lib/teamRepresentatives.server"
import { deliverPendingNotificationsSafely } from "@/lib/notifications.server"
import { withSecurityRoute } from "@/lib/securityRoute.server"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { canAccessCompetition } from "@/lib/competitionAccess"

function actorFromSession(session: {
  user: { id: string; role?: string | null }
}) {
  return { id: session.user.id, role: session.user.role }
}

async function handleGET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  if (!await canAccessCompetition(id, actorFromSession(session))) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  }

  const representatives = await prisma.teamRepresentative.findMany({
    where: { competitionId: id },
    include: {
      team: { select: { id: true, code: true, name: true } },
      member: {
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
      },
    },
    orderBy: { team: { code: "asc" } },
  })

  return NextResponse.json(representatives)
}

async function handlePOST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  if (!await canAccessCompetition(id, actorFromSession(session))) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  }

  const body = await req.json()
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  const rawTeamIds: unknown[] = Array.isArray(body.teamIds)
    ? body.teamIds
    : []
  const teamIds: string[] = [
    ...new Set(
      rawTeamIds.filter(
        (teamId): teamId is string =>
          typeof teamId === "string" && teamId.length > 0
      )
    ),
  ]

  if (!email || teamIds.length === 0) {
    return NextResponse.json(
      { error: "E-post ja vähemalt üks võistkond on kohustuslikud" },
      { status: 400 }
    )
  }

  const [user, teams] = await Promise.all([
    prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true },
    }),
    prisma.team.findMany({
      where: { competitionId: id, id: { in: teamIds } },
      select: { id: true },
    }),
  ])

  if (!user) {
    return NextResponse.json({ error: "Kasutajat ei leitud" }, { status: 404 })
  }
  if (teams.length !== teamIds.length) {
    return NextResponse.json(
      { error: "Kõik võistkonnad peavad kuuluma samale võistlusele" },
      { status: 400 }
    )
  }

  const assignments = await prisma.$transaction(async (tx) => {
    for (const teamId of teamIds) await setTeamRepresentative(tx, id, teamId, user.id, { actorId: session.user.id })

    return tx.teamRepresentative.findMany({
      where: { competitionId: id, teamId: { in: teamIds } },
      include: {
        team: { select: { id: true, code: true, name: true } },
        member: {
          include: {
            user: { select: { id: true, email: true, name: true } },
          },
        },
      },
      orderBy: { team: { code: "asc" } },
    })
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  await deliverPendingNotificationsSafely()

  return NextResponse.json(assignments)
}

async function handleDELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  if (!await canAccessCompetition(id, actorFromSession(session))) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  }

  const body = await req.json()
  if (typeof body.teamId !== "string" || !body.teamId) {
    return NextResponse.json(
      { error: "Võistkonna id on kohustuslik" },
      { status: 400 }
    )
  }

  await prisma.$transaction(async (tx) => {
    const team = await tx.team.findFirst({ where: { id: body.teamId, competitionId: id } })
    if (team) await setTeamRepresentative(tx, id, team.id, null, { actorId: session.user.id })
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  return NextResponse.json({ ok: true })
}

export const GET = withSecurityRoute("/api/competitions/[id]/representatives", handleGET)
export const POST = withSecurityRoute("/api/competitions/[id]/representatives", handlePOST)
export const DELETE = withSecurityRoute("/api/competitions/[id]/representatives", handleDELETE)
