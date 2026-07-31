import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { canAccessCompetition } from "@/lib/competitionAccess"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id: competitionId } = await params
  if (!await canAccessCompetition(competitionId, { id: session.user.id, role: session.user.role })) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  }

  const body = await req.json()
  const { name, code, class: teamClass, members } = body

  const team = await prisma.team.create({
    data: {
      competitionId,
      name,
      code,
      class: teamClass,
      members: members
        ? {
            create: members.map((m: { name: string; role?: string }) => ({
              competitionId,
              name: m.name,
              role: m.role ?? "COMPETITOR",
            })),
          }
        : undefined,
    },
    include: { members: true },
  })
  return NextResponse.json(team)
}
