import { NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { canAccessCompetition } from "@/lib/competitionAccess"
import { withSecurityRoute } from "@/lib/securityRoute.server"
import { readImageInfo } from "@/lib/imageSize"
import { MAX_MAP_IMAGE_BYTES } from "@/lib/competitionMap.server"
import { parseMapMarkers } from "@/lib/dashboard/mapData"

type Access = { ok: false; response: Response } | { ok: true; id: string; userId: string }

async function authorize(params: Promise<{ id: string }>): Promise<Access> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  const { id } = await params
  if (!await canAccessCompetition(id, { id: session.user.id, role: session.user.role })) {
    return { ok: false, response: NextResponse.json({ error: "Keelatud" }, { status: 403 }) }
  }
  return { ok: true, id, userId: session.user.id }
}

async function handlePOST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await authorize(params)
  if (!access.ok) return access.response
  const declared = Number(req.headers.get("content-length") ?? 0)
  if (declared > MAX_MAP_IMAGE_BYTES + 64 * 1024) {
    return NextResponse.json({ error: "Kaardipilt võib olla kuni 10 MB." }, { status: 413 })
  }
  const form = await req.formData().catch(() => null)
  const file = form?.get("file")
  if (!file || typeof file === "string") return NextResponse.json({ error: "Fail puudub" }, { status: 400 })
  if (file.size > MAX_MAP_IMAGE_BYTES) return NextResponse.json({ error: "Kaardipilt võib olla kuni 10 MB." }, { status: 413 })
  const bytes = new Uint8Array(await file.arrayBuffer())
  const info = readImageInfo(bytes)
  if (!info) return NextResponse.json({ error: "Kaart peab olema PNG-, JPEG- või WebP-pilt." }, { status: 400 })

  const now = new Date()
  const name = (file.name || "kaart").split(/[\\/]/).pop()!.replace(/[\u0000-\u001f]/g, "").slice(0, 120)
  const image = {
    image: Buffer.from(bytes),
    imageType: info.type,
    imageWidth: info.width,
    imageHeight: info.height,
    imageName: name,
    imageUpdatedAt: now,
  }
  await prisma.competitionMap.upsert({
    where: { competitionId: access.id },
    create: { competitionId: access.id, ...image },
    update: image,
  })
  return NextResponse.json({ width: info.width, height: info.height, name, updatedAt: now.toISOString() })
}

// Pildi eemaldamisel kaotavad tähenduse ka sellele pildile märgitud kohad.
async function handleDELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await authorize(params)
  if (!access.ok) return access.response
  await prisma.$transaction(async (tx) => {
    const map = await tx.competitionMap.findUnique({ where: { competitionId: access.id }, select: { markers: true } })
    if (!map) return
    const markers = parseMapMarkers(map.markers).map((marker) => ({ ...marker, mapX: null, mapY: null }))
    await tx.competitionMap.update({
      where: { competitionId: access.id },
      data: { image: null, imageType: null, imageWidth: null, imageHeight: null, imageName: null, imageUpdatedAt: null, markers: markers as unknown as Prisma.InputJsonValue },
    })
    await tx.scoringElement.updateMany({ where: { competitionId: access.id }, data: { mapX: null, mapY: null } })
  })
  return NextResponse.json({ ok: true })
}

export const POST = withSecurityRoute("/api/competitions/[id]/map", handlePOST)
export const DELETE = withSecurityRoute("/api/competitions/[id]/map", handleDELETE)
