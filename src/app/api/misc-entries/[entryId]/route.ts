import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { canAccessMiscEntry } from "@/lib/competitionAccess"
import { recomputeElementScores } from "@/lib/recompute"

export async function PATCH(req: Request, { params }: { params: Promise<{ entryId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { entryId } = await params
  if (!await canAccessMiscEntry(entryId, { id: session.user.id, role: session.user.role })) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  }

  const body = await req.json()
  const data: { reason?: string | null; abandonElementId?: string | null; abandonTime?: string | null } = {}
  if ("reason" in body) data.reason = body.reason || null
  if ("abandonElementId" in body) data.abandonElementId = body.abandonElementId || null
  if ("abandonTime" in body) data.abandonTime = body.abandonTime || null

  const entry = await prisma.miscEntry.update({
    where: { id: entryId },
    data,
    include: { team: { select: { id: true, name: true, code: true } } },
  })
  return NextResponse.json(entry)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ entryId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { entryId } = await params
  if (!await canAccessMiscEntry(entryId, { id: session.user.id, role: session.user.role })) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  }

  const entry = await prisma.miscEntry.findUnique({
    where: { id: entryId },
    select: { elementId: true },
  })
  if (!entry) return NextResponse.json({ error: "Kirjet ei leitud" }, { status: 404 })
  await prisma.miscEntry.delete({ where: { id: entryId } })
  await recomputeElementScores(entry.elementId)
  return NextResponse.json({ ok: true })
}
