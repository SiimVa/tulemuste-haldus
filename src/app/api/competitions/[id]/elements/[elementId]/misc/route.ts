import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; elementId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { elementId } = await params

  const entries = await prisma.miscEntry.findMany({
    where: { elementId },
    include: { team: { select: { id: true, name: true, code: true } } },
    orderBy: { createdAt: "asc" },
  })
  return NextResponse.json(entries)
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string; elementId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { elementId } = await params

  const body = await req.json()
  const { teamId, points, description } = body
  if (!teamId || points == null || !description) {
    return NextResponse.json({ error: "Puudulikud andmed" }, { status: 400 })
  }

  const entry = await prisma.miscEntry.create({
    data: { elementId, teamId, points: Number(points), description },
    include: { team: { select: { id: true, name: true, code: true } } },
  })
  return NextResponse.json(entry)
}
