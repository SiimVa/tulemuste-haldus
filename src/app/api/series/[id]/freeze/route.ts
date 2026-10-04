import { NextResponse } from "next/server"
import { z } from "zod"
import { withSecurityRoute } from "@/lib/securityRoute.server"
import { prisma } from "@/lib/prisma"
import { requireSeriesAdmin } from "@/lib/seriesAccess.server"
import { revealSeries, setSeriesFreeze } from "@/lib/seriesRanking.server"

const bodySchema = z.union([
  z.object({ now: z.literal(true) }).strict(),
  z.object({ freezeAt: z.string().max(40) }).strict(),
])

async function stateJson(id: string) {
  const series = await prisma.competitionSeries.findUnique({ where: { id }, select: { freezeAt: true } })
  const freezeAt = series?.freezeAt ?? null
  return { freezeAt: freezeAt?.toISOString() ?? null, frozen: freezeAt !== null && freezeAt <= new Date() }
}

// Määrab avalike vaadete külmutamise aja või külmutab kohe.
async function handlePUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireSeriesAdmin(params)
  if (!access.ok) return access.response
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Vigane külmutamise aeg" }, { status: 400 })
  const now = new Date()
  const freezeAt = "now" in parsed.data ? now : new Date(parsed.data.freezeAt)
  if (Number.isNaN(freezeAt.getTime())) return NextResponse.json({ error: "Vigane külmutamise aeg" }, { status: 400 })
  if (freezeAt.getTime() > now.getTime() + 366 * 24 * 60 * 60 * 1000) {
    return NextResponse.json({ error: "Külmutamise aeg on liiga kaugel tulevikus" }, { status: 400 })
  }
  // Möödunud aeg peidaks tagasiulatuvalt hiljem sisestatut; külmutame siis kohe.
  await setSeriesFreeze(access.id, freezeAt < now ? now : freezeAt, now)
  return NextResponse.json(await stateJson(access.id))
}

// Avalikustab: avalikud vaated näitavad taas jooksvat seisu.
async function handleDELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireSeriesAdmin(params)
  if (!access.ok) return access.response
  await revealSeries(access.id)
  return NextResponse.json(await stateJson(access.id))
}

export const PUT = withSecurityRoute("/api/series/[id]/freeze", handlePUT)
export const DELETE = withSecurityRoute("/api/series/[id]/freeze", handleDELETE)
