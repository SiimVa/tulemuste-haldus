import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { canAccessCompetition } from "@/lib/competitionAccess"
import { withSecurityRoute } from "@/lib/securityRoute.server"
import {
  MapLocationError,
  loadMapEditorData,
  normalizeMarkers,
  saveMarkers,
  updateElementLocations,
} from "@/lib/competitionMap.server"

const coordinate = z.number().min(0).max(1).nullable().optional()
const bodySchema = z.object({
  elements: z.array(z.object({
    id: z.string().min(1).max(100),
    mapX: coordinate,
    mapY: coordinate,
    mgrs: z.string().max(60).nullable().optional(),
  }).strict()).max(1000).optional(),
  markers: z.array(z.unknown()).max(50).optional(),
}).strict()

async function handlePUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  if (!await canAccessCompetition(id, { id: session.user.id, role: session.user.role })) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Vigased asukohad" }, { status: 400 })
  try {
    const markers = parsed.data.markers ? normalizeMarkers(parsed.data.markers) : null
    await updateElementLocations(id, parsed.data.elements ?? [])
    if (markers) await saveMarkers(id, markers)
  } catch (error) {
    if (error instanceof MapLocationError) return NextResponse.json({ error: error.message }, { status: 400 })
    throw error
  }
  const data = await loadMapEditorData(id)
  return NextResponse.json({ elements: data.elements, markers: data.markers })
}

export const PUT = withSecurityRoute("/api/competitions/[id]/map/locations", handlePUT)
