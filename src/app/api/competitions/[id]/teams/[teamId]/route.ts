import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import {
  canAccessCompetition,
  teamBelongsToCompetition,
} from "@/lib/competitionAccess"
import {
  cleanupCompetitorRoles,
  ensureCompetitorRoles,
  resolveTeamMemberAccounts,
  TeamMemberAccountConflictError,
} from "@/lib/teamMemberAccounts.server"

class TeamMemberInputError extends Error {}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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
          select: { id: true, email: true, userId: true },
        })
        const existingById = new Map(
          existingMembers.map((member) => [member.id, member])
        )
        const valid: {
          name: string
          role: string
          email: string | null
          userId: string | null
        }[] = body.members
          .map((member: unknown) => {
            if (typeof member === "string") {
              return {
                name: member.trim(),
                role: "COMPETITOR",
                email: null,
                userId: null,
              }
            }
            const value = member as {
              id?: unknown
              name?: unknown
              role?: unknown
              email?: unknown
            }
            const previous =
              typeof value.id === "string"
                ? existingById.get(value.id)
                : undefined
            const rawEmail =
              value.email === undefined ? previous?.email ?? "" : value.email
            if (rawEmail !== null && typeof rawEmail !== "string") {
              throw new TeamMemberInputError("Kontrolli liikme e-posti aadressi")
            }
            const email =
              typeof rawEmail === "string"
                ? rawEmail.trim().toLowerCase()
                : ""
            if (email.length > 320) {
              throw new TeamMemberInputError(
                "Liikme e-posti aadress on liiga pikk"
              )
            }
            if (email && !EMAIL_PATTERN.test(email)) {
              throw new TeamMemberInputError(
                "Kontrolli liikme e-posti aadressi"
              )
            }
            return {
              name: String(value.name ?? "").trim(),
              role: value.role === "SUPPORT" ? "SUPPORT" : "COMPETITOR",
              email: email || null,
              userId: previous?.userId ?? null,
            }
          })
          .filter((m: { name: string }) => m.name !== "")
        const resolvedMembers = await resolveTeamMemberAccounts(
          tx,
          competitionId,
          teamId,
          valid.map((member) => ({
            name: member.name,
            role: member.role,
            email: member.email ?? undefined,
          }))
        )
        const previousUserIds = existingMembers.flatMap(({ userId }) =>
          userId ? [userId] : []
        )
        await tx.teamMember.deleteMany({ where: { teamId } })
        if (resolvedMembers.length > 0) {
          await tx.teamMember.createMany({
            data: resolvedMembers.map((member) => ({
              teamId,
              competitionId,
              name: member.name,
              role: member.role,
              email: member.email,
              userId: member.userId,
            })),
          })
        }
        const nextUserIds = resolvedMembers.flatMap(({ userId }) =>
          userId ? [userId] : []
        )
        await ensureCompetitorRoles(tx, competitionId, nextUserIds)
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
    if (e instanceof TeamMemberInputError) {
      return NextResponse.json({ error: e.message }, { status: 400 })
    }
    if (e instanceof TeamMemberAccountConflictError) {
      return NextResponse.json({ error: e.message }, { status: 409 })
    }
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
