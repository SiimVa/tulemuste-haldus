import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { canAccessCompetition, managedCompetitionsWhere } from "@/lib/competitionAccess"
import { prisma } from "@/lib/prisma"
import { withSecurityRoute } from "@/lib/securityRoute.server"
import { loadRegistrationStatistics } from "@/lib/registrationForecast.server"
import { getCompetitionRegistrationStatus } from "@/lib/competitionPhases"

async function handleGET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const actor = { id: session.user.id, role: session.user.role }
  if (!await canAccessCompetition(id, actor)) return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  const selected = [...new Set(new URL(req.url).searchParams.getAll("compare"))]
  if (selected.length > 20) return NextResponse.json({ error: "Vali kuni 20 võrdlusvõistlust." }, { status: 400 })
  const now = new Date()
  const candidates = await prisma.competition.findMany({
    where: { AND: [managedCompetitionsWhere(actor), { id: { not: id }, registrationClosesAt: { lt: now } }] },
    select: { id: true, name: true, registrationClosesAt: true, registrationOverride: true, registrationFinalizedAt: true },
    orderBy: { registrationClosesAt: "desc" },
  })
  const available = candidates.filter(c => c.registrationOverride !== "OPEN" || c.registrationFinalizedAt)
  if (selected.some(value => !available.some(c => c.id === value))) {
    return NextResponse.json({ error: "Võrdlusvõistlus pole kättesaadav või selle registreerimine pole lõppenud." }, { status: 403 })
  }
  const competition = await prisma.competition.findUniqueOrThrow({ where: { id }, select: {
    name: true, registrationOverride: true, registrationOpensAt: true, registrationClosesAt: true, registrationFinalizedAt: true,
  } })
  const [statistics, references] = await Promise.all([
    loadRegistrationStatistics(prisma, id, now),
    Promise.all(selected.map(async referenceId => ({ id: referenceId,
      name: available.find(c => c.id === referenceId)!.name,
      statistics: await loadRegistrationStatistics(prisma, referenceId, now) }))),
  ])
  return NextResponse.json({ now: now.toISOString(), name: competition.name,
    status: getCompetitionRegistrationStatus(competition, now), statistics,
    candidates: available.map(c => ({ id: c.id, name: c.name, closesAt: c.registrationClosesAt })), references,
  }, { headers: { "Cache-Control": "private, no-store" } })
}
export const GET = withSecurityRoute("/api/competitions/[id]/registration-forecast", handleGET)
