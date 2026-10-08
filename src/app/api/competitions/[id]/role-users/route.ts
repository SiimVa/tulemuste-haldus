import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { canAccessCompetition } from "@/lib/competitionAccess"
import { prisma } from "@/lib/prisma"
import { withSecurityRoute } from "@/lib/securityRoute.server"

async function handleGET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  if (!await canAccessCompetition(id, session.user)) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  }
  const query = new URL(req.url).searchParams.get("q")?.trim() ?? ""
  if (query.length < 2 || query.length > 100) return NextResponse.json([])
  const users = await prisma.user.findMany({
    where: { OR: [
      { name: { contains: query, mode: "insensitive" } },
      { email: { contains: query, mode: "insensitive" } },
    ] },
    select: { id: true, name: true, email: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: 8,
  })
  return NextResponse.json(users, { headers: { "Cache-Control": "no-store" } })
}

export const GET = withSecurityRoute("/api/competitions/[id]/role-users", handleGET)
