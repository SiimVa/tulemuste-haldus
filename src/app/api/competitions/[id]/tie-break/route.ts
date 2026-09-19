import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { canAccessCompetition } from "@/lib/competitionAccess"
import { prisma } from "@/lib/prisma"
import { parseTieBreakConfig, tieBreakSchema } from "@/lib/tieBreak"
import { withSecurityRoute } from "@/lib/securityRoute.server"

type Context = { params: Promise<{ id: string }> }
async function authorize(id: string) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Logi sisse." }, { status: 401 })
  if (!await canAccessCompetition(id, session.user)) return NextResponse.json({ error: "Keelatud." }, { status: 403 })
  return null
}
async function handleGET(_req: Request, { params }: Context) {
  const { id } = await params
  const denied = await authorize(id)
  if (denied) return denied
  const competition = await prisma.competition.findUnique({ where: { id }, select: {
    tieBreakConfig: true,
    elements: { orderBy: { order: "asc" }, select: { id: true, name: true, code: true, type: true, isCancelled: true } },
    teams: { orderBy: { code: "asc" }, select: { id: true, name: true, code: true, class: true } },
  } })
  if (!competition) return NextResponse.json({ error: "Ei leitud." }, { status: 404 })
  return NextResponse.json({ config: parseTieBreakConfig(competition.tieBreakConfig), elements: competition.elements, teams: competition.teams })
}
async function handlePUT(req: Request, { params }: Context) {
  const { id } = await params
  const denied = await authorize(id)
  if (denied) return denied
  const parsed = tieBreakSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Vigased seaded." }, { status: 400 })
  const config = parsed.data
  const saved = await prisma.$transaction(async tx => {
    const [elements, teams] = await Promise.all([
      tx.scoringElement.findMany({ where: { competitionId: id }, select: { id: true, isCancelled: true } }),
      tx.team.findMany({ where: { competitionId: id }, select: { id: true } }),
    ])
    const elementIds = new Set(elements.map(el => el.id))
    const teamIds = new Set(teams.map(team => team.id))
    if ((config.elementIds ?? []).some(elementId => !elementIds.has(elementId)) || config.rules.some(rule =>
      (rule.elementId && !elementIds.has(rule.elementId)) || (rule.teamOrder ?? []).some(teamId => !teamIds.has(teamId)))) return false
    await tx.competition.update({ where: { id }, data: { tieBreakConfig: JSON.stringify(config) } })
    return true
  })
  if (!saved) return NextResponse.json({ error: "Valitud element või võistkond ei kuulu sellele võistlusele. Värskenda lehte." }, { status: 400 })
  return NextResponse.json({ config })
}
export const GET = withSecurityRoute("/api/competitions/[id]/tie-break", handleGET)
export const PUT = withSecurityRoute("/api/competitions/[id]/tie-break", handlePUT)
