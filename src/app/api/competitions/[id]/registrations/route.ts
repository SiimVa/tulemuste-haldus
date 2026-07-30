import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { canAccessCompetition } from "@/lib/competitionAccess"
import {
  getCompetitionMandateStatus,
  getCompetitionRegistrationStatus,
} from "@/lib/competitionPhases"
import { prisma } from "@/lib/prisma"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id: competitionId } = await params
  const allowed = await canAccessCompetition(competitionId, {
    id: session.user.id,
    role: session.user.role,
  })
  if (!allowed) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  }

  const [competition, teams, applications] = await Promise.all([
    prisma.competition.findUnique({
      where: { id: competitionId },
      select: {
        id: true,
        registrationOverride: true,
        registrationOpensAt: true,
        registrationClosesAt: true,
        registrationFinalizedAt: true,
        registrationCapacity: true,
        mandateOverride: true,
        mandateOpensAt: true,
        mandateClosesAt: true,
        mandateFinalizedAt: true,
      },
    }),
    prisma.team.findMany({
      where: { competitionId },
      include: {
        members: {
          select: { id: true, name: true, role: true },
          orderBy: { name: "asc" },
        },
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
      orderBy: { code: "asc" },
    }),
    prisma.registrationApplication.findMany({
      where: { competitionId },
      include: {
        class: { select: { id: true, name: true } },
        submittedBy: { select: { id: true, name: true, email: true } },
        team: { select: { id: true, code: true } },
      },
      orderBy: [{ submittedAt: "asc" }, { createdAt: "asc" }],
    }),
  ])

  if (!competition) {
    return NextResponse.json({ error: "Võistlust ei leitud" }, { status: 404 })
  }

  return NextResponse.json({
    competition: {
      ...competition,
      registrationStatus: getCompetitionRegistrationStatus(competition),
      mandateStatus: getCompetitionMandateStatus(competition),
    },
    applications,
    legacyTeams: teams,
  })
}
