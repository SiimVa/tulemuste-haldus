import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { canAccessCompetition } from "@/lib/competitionAccess"
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

  const teams = await prisma.team.findMany({
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
  })

  return NextResponse.json(teams)
}
