import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// Loo juurdepääsu token (kohtunik / võistleja)
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const { type, name, competitionId, elementId, teamId } = body

  const token = await prisma.accessToken.create({
    data: {
      type,
      name,
      competitionId,
      elementId: elementId || null,
      teamId: teamId || null,
    },
    include: {
      element: { select: { name: true } },
      team: { select: { name: true } },
    },
  })
  return NextResponse.json(token)
}

// Kustuta token
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await req.json()
  await prisma.accessToken.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
