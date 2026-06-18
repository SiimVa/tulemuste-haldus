import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

async function isOwnerOrAdmin(competitionId: string, userId: string, role: string) {
  if (role === "ADMIN") return true
  const comp = await prisma.competition.findUnique({ where: { id: competitionId }, select: { organizerId: true } })
  return comp?.organizerId === userId
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params

  const members = await prisma.competitionMember.findMany({
    where: { competitionId: id },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { addedAt: "asc" },
  })
  return NextResponse.json(members)
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params

  const ok = await isOwnerOrAdmin(id, session.user.id, session.user.role ?? "")
  if (!ok) return NextResponse.json({ error: "Keelatud" }, { status: 403 })

  const { email } = await req.json()
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, email: true } })
  if (!user) return NextResponse.json({ error: "Kasutajat ei leitud" }, { status: 404 })

  const comp = await prisma.competition.findUnique({ where: { id }, select: { organizerId: true } })
  if (comp?.organizerId === user.id) return NextResponse.json({ error: "Kasutaja on juba peakorraldaja" }, { status: 400 })

  const member = await prisma.competitionMember.upsert({
    where: { competitionId_userId: { competitionId: id, userId: user.id } },
    create: { competitionId: id, userId: user.id },
    update: {},
    include: { user: { select: { id: true, name: true, email: true } } },
  })
  return NextResponse.json(member)
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params

  const ok = await isOwnerOrAdmin(id, session.user.id, session.user.role ?? "")
  if (!ok) return NextResponse.json({ error: "Keelatud" }, { status: 403 })

  const { userId } = await req.json()
  await prisma.competitionMember.deleteMany({ where: { competitionId: id, userId } })
  return NextResponse.json({ ok: true })
}
