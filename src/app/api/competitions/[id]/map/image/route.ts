import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { canAccessCompetition } from "@/lib/competitionAccess"
import { withSecurityRoute } from "@/lib/securityRoute.server"
import { mapImageResponse } from "@/lib/mapImage.server"

async function handleGET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  if (!await canAccessCompetition(id, { id: session.user.id, role: session.user.role })) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  }
  return mapImageResponse(id, "private, max-age=300")
}

export const GET = withSecurityRoute("/api/competitions/[id]/map/image", handleGET)
