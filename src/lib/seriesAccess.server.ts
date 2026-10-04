import "server-only"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { loadSeriesView, type SeriesView } from "@/lib/seriesRanking.server"

// Üleriiklikku arvestust haldab ainult administraator.
export async function requireSeriesAdmin(params: Promise<{ id: string }>): Promise<
  { ok: true; id: string; userId: string } | { ok: false; response: NextResponse }
> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  if (session.user.role !== "ADMIN") return { ok: false, response: NextResponse.json({ error: "Keelatud" }, { status: 403 }) }
  const { id } = await params
  if (!await prisma.competitionSeries.findUnique({ where: { id }, select: { id: true } })) {
    return { ok: false, response: NextResponse.json({ error: "Arvestust ei leitud" }, { status: 404 }) }
  }
  return { ok: true, id, userId: session.user.id }
}

// Avalik vaade: avaldatud arvestus kõigile, avaldamata arvestus ainult
// administraatori eelvaatena. Avaldamist kontrollitakse enne andmete laadimist.
export async function loadPublicSeries(seriesId: string): Promise<{ view: SeriesView; preview: boolean } | null> {
  const series = await prisma.competitionSeries.findUnique({ where: { id: seriesId }, select: { isPublished: true } })
  if (!series) return null
  let preview = false
  if (!series.isPublished) {
    const session = await auth()
    if (session?.user?.role !== "ADMIN") return null
    preview = true
  }
  const view = await loadSeriesView(seriesId, "public")
  return view ? { view, preview } : null
}

export async function isAdminViewer() {
  const session = await auth()
  return session?.user?.role === "ADMIN"
}
