import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

async function checkAccess(competitionId: string, userId: string, role: string) {
  if (role === "ADMIN") return true
  const comp = await prisma.competition.findUnique({
    where: { id: competitionId },
    include: { members: { where: { userId }, select: { id: true } } },
  })
  return comp?.organizerId === userId || (comp?.members?.length ?? 0) > 0
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; teamId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id: competitionId, teamId } = await params

  const ok = await checkAccess(competitionId, session.user.id, session.user.role ?? "")
  if (!ok) return NextResponse.json({ error: "Keelatud" }, { status: 403 })

  try {
    const body = await req.json()
    const team = await prisma.team.update({
      where: { id: teamId },
      data: {
        name: body.name !== undefined ? body.name : undefined,
        code: body.code !== undefined ? body.code : undefined,
        class: body.class !== undefined ? (body.class || null) : undefined,
        isHorsDeCompetition: body.isHorsDeCompetition !== undefined ? body.isHorsDeCompetition : undefined,
        dnfFromElementOrder: body.dnfFromElementOrder !== undefined ? (body.dnfFromElementOrder === null ? null : Number(body.dnfFromElementOrder)) : undefined,
        dnfReason: body.dnfReason !== undefined ? (body.dnfReason || null) : undefined,
      },
      include: { members: true },
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

  const ok = await checkAccess(competitionId, session.user.id, session.user.role ?? "")
  if (!ok) return NextResponse.json({ error: "Keelatud" }, { status: 403 })

  await prisma.team.delete({ where: { id: teamId } })
  return NextResponse.json({ ok: true })
}
