import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import {
  canAccessCompetition,
  teamBelongsToCompetition,
} from "@/lib/competitionAccess"
import { cleanupCompetitorRoles } from "@/lib/teamMemberAccounts.server"

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; teamId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id: competitionId, teamId } = await params

  const ok = await canAccessCompetition(competitionId, {
    id: session.user.id,
    role: session.user.role,
  })
  if (!ok) return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  if (!await teamBelongsToCompetition(teamId, competitionId)) {
    return NextResponse.json({ error: "Võistkonda ei leitud" }, { status: 404 })
  }

  try {
    const body = await req.json()
    const team = await prisma.$transaction(async (tx) => {
      await tx.team.update({
        where: { id: teamId },
        data: {
          name: body.name !== undefined ? body.name : undefined,
          code: body.code !== undefined ? body.code : undefined,
          class: body.class !== undefined ? (body.class || null) : undefined,
          isHorsDeCompetition: body.isHorsDeCompetition !== undefined ? body.isHorsDeCompetition : undefined,
          dnfFromElementOrder: body.dnfFromElementOrder !== undefined ? (body.dnfFromElementOrder === null ? null : Number(body.dnfFromElementOrder)) : undefined,
          dnfReason: body.dnfReason !== undefined ? (body.dnfReason || null) : undefined,
          hcFromElementOrder: body.hcFromElementOrder !== undefined ? (body.hcFromElementOrder === null ? null : Number(body.hcFromElementOrder)) : undefined,
          dqFromElementOrder: body.dqFromElementOrder !== undefined ? (body.dqFromElementOrder === null ? null : Number(body.dqFromElementOrder)) : undefined,
          dnsFlag: body.dnsFlag !== undefined ? Boolean(body.dnsFlag) : undefined,
        },
      })

      // Liikmete asendamine (kui body.members on antud massiivina)
      if (Array.isArray(body.members)) {
        const existingMembers = await tx.teamMember.findMany({
          where: { teamId },
          select: { id: true, userId: true },
        })
        const existingById = new Map(
          existingMembers.map((member) => [member.id, member])
        )
        const valid: {
          name: string
          role: string
          userId: string | null
        }[] = body.members
          .map((member: unknown) => {
            if (typeof member === "string") {
              return {
                name: member.trim(),
                role: "COMPETITOR",
                userId: null,
              }
            }
            const value = member as {
              id?: unknown
              name?: unknown
              role?: unknown
            }
            const previous =
              typeof value.id === "string"
                ? existingById.get(value.id)
                : undefined
            return {
              name: String(value.name ?? "").trim(),
              role: value.role === "SUPPORT" ? "SUPPORT" : "COMPETITOR",
              userId: previous?.userId ?? null,
            }
          })
          .filter((m: { name: string }) => m.name !== "")
        const previousUserIds = existingMembers.flatMap(({ userId }) =>
          userId ? [userId] : []
        )
        await tx.teamMember.deleteMany({ where: { teamId } })
        if (valid.length > 0) {
          await tx.teamMember.createMany({
            data: valid.map((member) => ({
              teamId,
              competitionId,
              name: member.name,
              role: member.role,
              userId: member.userId,
            })),
          })
        }
        const nextUserIds = valid.flatMap(({ userId }) =>
          userId ? [userId] : []
        )
        await cleanupCompetitorRoles(
          tx,
          competitionId,
          previousUserIds.filter((userId) => !nextUserIds.includes(userId))
        )
      }

      return tx.team.findUnique({ where: { id: teamId }, include: { members: true } })
    })
    return NextResponse.json(team)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; teamId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id: competitionId, teamId } = await params

  const ok = await canAccessCompetition(competitionId, {
    id: session.user.id,
    role: session.user.role,
  })
  if (!ok) return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  if (!await teamBelongsToCompetition(teamId, competitionId)) {
    return NextResponse.json({ error: "Võistkonda ei leitud" }, { status: 404 })
  }

  await prisma.$transaction(async (tx) => {
    const linkedUserIds = await tx.teamMember.findMany({
      where: { teamId, userId: { not: null } },
      select: { userId: true },
    })
    await tx.team.delete({ where: { id: teamId } })
    await cleanupCompetitorRoles(
      tx,
      competitionId,
      linkedUserIds.flatMap(({ userId }) => (userId ? [userId] : []))
    )
  })
  return NextResponse.json({ ok: true })
}
