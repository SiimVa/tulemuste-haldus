import { withSecurityRoute } from "@/lib/securityRoute.server"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import {
  isTeamCountScope,
  parseClassGroups,
  syncClassGroupsWithRegistrationClasses,
} from "@/lib/classGroups"
import { isFixedRankingMode, nonNegativeFiniteNumber, parseFixedPointValues } from "@/lib/fixedRanking"
import { naturalCompare } from "@/lib/utils"
import { canAccessCompetition } from "@/lib/competitionAccess"
import { parseTeamMemberRoles } from "@/lib/teamComposition"
import { ensureCompetitionAccessTokens } from "@/lib/accessTokens.server"
import {
  deliverPendingNotificationsSafely,
  queueCompetitionStartedNotifications,
} from "@/lib/notifications.server"

async function handleGET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params

  const ok = await canAccessCompetition(id, {
    id: session.user.id,
    role: session.user.role,
  })
  if (!ok) return NextResponse.json({ error: "Keelatud" }, { status: 403 })

  const competition = await prisma.competition.findUnique({
    where: { id },
    include: {
      organizer: { select: { name: true, email: true } },
      elements: {
        orderBy: { order: "asc" },
        include: {
          fields: { orderBy: { order: "asc" } },
          exceptions: { orderBy: { order: "asc" } },
          calcMethod: true,
          _count: { select: { results: true } },
        },
      },
      teams: {
        orderBy: { code: "asc" },
        include: { members: true },
      },
      registrationClasses: {
        where: { isActive: true },
        orderBy: [{ order: "asc" }, { name: "asc" }],
        select: { id: true, name: true },
      },
      _count: { select: { teams: true, elements: true } },
    },
  })

  if (!competition) return NextResponse.json({ error: "Ei leitud" }, { status: 404 })
  competition.teams.sort((a, b) => naturalCompare(a.code, b.code))
  return NextResponse.json({
    ...competition,
    teamMemberRoles: parseTeamMemberRoles(competition.teamMemberRoles),
  })
}

async function handlePATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params

  try {
    const body = await req.json()
    const ok = await canAccessCompetition(id, {
      id: session.user.id,
      role: session.user.role,
    })
    if (!ok) return NextResponse.json({ error: "Keelatud" }, { status: 403 })
    if (
      body.status !== undefined &&
      !["SETUP", "ACTIVE", "FINISHED", "CANCELLED", "ARCHIVED"].includes(
        body.status
      )
    ) {
      return NextResponse.json({ error: "Vigane võistluse staatus" }, { status: 400 })
    }

    const updated = await prisma.$transaction(async (tx) => {
      const previous = await tx.competition.findUnique({
        where: { id },
        select: {
          status: true,
          registrationClasses: {
            where: { isActive: true },
            select: { id: true, name: true },
          },
        },
      })
      const competition = await tx.competition.update({
        where: { id },
        data: {
          name: body.name,
          date: body.date
            ? new Date(body.date)
            : body.date === null
              ? null
              : undefined,
          endDate: body.endDate
            ? new Date(body.endDate)
            : body.endDate === null
              ? null
              : undefined,
          location: body.location ?? null,
          status: body.status,
          scoringMode: body.scoringMode,
          defaultKPMaxValue: Number(body.defaultKPMaxValue),
          defaultPKMaxValue: Number(body.defaultPKMaxValue),
          defaultNotPassed: Number(body.defaultNotPassed),
          defaultPassedNotDone: Number(body.defaultPassedNotDone),
          defaultVastutegevusPenaltyPerLife: Number(
            body.defaultVastutegevusPenaltyPerLife
          ),
          defaultVarustusPenaltyPerItem: Number(
            body.defaultVarustusPenaltyPerItem
          ),
          defaultHilinemineMode: body.defaultHilinemineMode,
          defaultHilinemineIntervalMinutes:
            body.defaultHilinemineIntervalMinutes != null
              ? Math.round(Number(body.defaultHilinemineIntervalMinutes))
              : undefined,
          defaultHilineminePenaltyPerInterval: Number(
            body.defaultHilineminePenaltyPerInterval
          ),
          defaultHilinemineMaxPenalty: Number(
            body.defaultHilinemineMaxPenalty
          ),
          defaultCalcType: body.defaultCalcType,
          defaultHigherIsBetter: body.defaultHigherIsBetter,
          defaultRankingMinPoints:
            body.defaultRankingMinPoints != null
              ? Number(body.defaultRankingMinPoints)
              : undefined,
          defaultFixedRankingPoints: Array.isArray(
            body.defaultFixedRankingPoints
          )
            ? JSON.stringify(parseFixedPointValues(body.defaultFixedRankingPoints))
            : undefined,
          defaultFixedRankingMode: isFixedRankingMode(body.defaultFixedRankingMode)
            ? body.defaultFixedRankingMode
            : undefined,
          defaultTeamCountScope: isTeamCountScope(body.defaultTeamCountScope)
            ? body.defaultTeamCountScope
            : undefined,
          defaultTeamCountBase: body.defaultTeamCountBase != null
            ? nonNegativeFiniteNumber(body.defaultTeamCountBase, 0)
            : undefined,
          defaultTeamCountStep: body.defaultTeamCountStep != null
            ? nonNegativeFiniteNumber(body.defaultTeamCountStep, 1)
            : undefined,
          classGroups: Array.isArray(body.classGroups)
            ? JSON.stringify(
                syncClassGroupsWithRegistrationClasses(
                  parseClassGroups(JSON.stringify(body.classGroups)),
                  previous?.registrationClasses ?? [],
                  previous?.registrationClasses ?? []
                )
              )
            : undefined,
        },
      })
      if (body.status === "ACTIVE") {
        await ensureCompetitionAccessTokens(tx, id)
        if (previous?.status !== "ACTIVE") {
          await queueCompetitionStartedNotifications(tx, id)
        }
      }
      return competition
    })
    await deliverPendingNotificationsSafely()
    return NextResponse.json(updated)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("Competition PATCH viga:", msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

async function handleDELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params

  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Keelatud" }, { status: 403 })

  await prisma.competition.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

export const GET = withSecurityRoute("/api/competitions/[id]", handleGET)
export const PATCH = withSecurityRoute("/api/competitions/[id]", handlePATCH)
export const DELETE = withSecurityRoute("/api/competitions/[id]", handleDELETE)
