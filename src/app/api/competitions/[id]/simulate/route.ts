import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { computeAllScores, type ComputeResult, type ComputeElement, type ComputeConfig } from "@/lib/scoreCompute"

const round3 = (n: number) => Math.round(n * 1000) / 1000

// Avalik dry-run: arvuta hüpoteetiline seis valitud võistkonnale (ei salvesta andmebaasi).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: competitionId } = await params
  const body = await req.json().catch(() => ({}))
  const teamId: string = body.teamId
  const overrides: Record<string, Record<string, string>> = body.overrides ?? {}
  if (!teamId) return NextResponse.json({ error: "teamId puudub" }, { status: 400 })

  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: { scoringMode: true, defaultKPMaxValue: true, defaultPKMaxValue: true },
  })
  if (!competition) return NextResponse.json({ error: "Ei leitud" }, { status: 404 })

  const [elements, allResults, teams, penalties] = await Promise.all([
    prisma.scoringElement.findMany({
      where: { competitionId },
      orderBy: { order: "asc" },
      include: {
        fields: true,
        calcMethod: true,
        miscEntries: { select: { teamId: true, points: true } },
        sections: { include: { fields: { orderBy: { order: "asc" } }, calcMethod: true }, orderBy: { order: "asc" } },
      },
    }),
    prisma.result.findMany({
      where: { element: { competitionId } },
      select: {
        elementId: true, teamId: true, values: true, exceptionLabel: true, exceptionPenalty: true,
        team: { select: { id: true, isHorsDeCompetition: true, hcFromElementOrder: true, dnfFromElementOrder: true } },
      },
    }),
    prisma.team.findMany({ where: { competitionId }, select: { id: true, class: true, isHorsDeCompetition: true, hcFromElementOrder: true, dnfFromElementOrder: true } }),
    prisma.manualPenalty.findMany({ where: { competitionId }, select: { teamId: true, points: true } }),
  ])

  const config: ComputeConfig = {
    scoringMode: competition.scoringMode as "PENALTY" | "PLUS",
    defaultKPMaxValue: competition.defaultKPMaxValue,
    defaultPKMaxValue: competition.defaultPKMaxValue,
  }
  const isPlus = config.scoringMode === "PLUS"

  // Tee koopia tulemustest ja rakenda valitud võistkonna muudatused
  const results: ComputeResult[] = allResults.map((r) => ({
    elementId: r.elementId, teamId: r.teamId, values: r.values,
    exceptionLabel: r.exceptionLabel, exceptionPenalty: r.exceptionPenalty, team: r.team,
  }))
  const teamMeta = teams.find((t) => t.id === teamId)
  const teamForResult = { id: teamId, isHorsDeCompetition: teamMeta?.isHorsDeCompetition ?? false, hcFromElementOrder: teamMeta?.hcFromElementOrder ?? null, dnfFromElementOrder: teamMeta?.dnfFromElementOrder ?? null }

  for (const [elementId, fieldVals] of Object.entries(overrides)) {
    const existing = results.find((r) => r.elementId === elementId && r.teamId === teamId)
    if (existing) {
      let v: Record<string, unknown> = {}
      try { v = JSON.parse(existing.values) } catch {}
      existing.values = JSON.stringify({ ...v, ...fieldVals })
      existing.exceptionLabel = null
      existing.exceptionPenalty = null
    } else {
      results.push({ elementId, teamId, values: JSON.stringify(fieldVals), exceptionLabel: null, exceptionPenalty: null, team: teamForResult })
    }
  }

  const byElement = computeAllScores(elements as unknown as ComputeElement[], results, config)

  // Kogusummad
  const totalByTeam = new Map<string, number>()
  for (const t of teams) totalByTeam.set(t.id, 0)
  for (const [, scores] of byElement) for (const [tid, sc] of scores) totalByTeam.set(tid, (totalByTeam.get(tid) ?? 0) + sc)
  for (const p of penalties) totalByTeam.set(p.teamId, (totalByTeam.get(p.teamId) ?? 0) + (isPlus ? -p.points : p.points))

  const inComp = teams.filter((t) => !t.isHorsDeCompetition && t.hcFromElementOrder == null)
  const ranked = inComp
    .map((t) => ({ id: t.id, class: t.class ?? "–", total: round3(totalByTeam.get(t.id) ?? 0) }))
    .sort((a, b) => (isPlus ? b.total - a.total : a.total - b.total))
  const myTotal = round3(totalByTeam.get(teamId) ?? 0)
  const rankIdx = ranked.findIndex((r) => r.id === teamId)
  const myClass = teamMeta?.class ?? "–"
  const classRanked = ranked.filter((r) => r.class === myClass)
  const classIdx = classRanked.findIndex((r) => r.id === teamId)

  // Per-element skoor + positsioon (%)
  const elementScores: Record<string, number | null> = {}
  const percentiles: number[] = []
  for (const el of elements) {
    const scores = byElement.get(el.id)
    const myScore = scores?.get(teamId)
    elementScores[el.id] = myScore ?? null
    if (myScore != null && scores) {
      const vals = [...scores.values()]
      const n = vals.length
      if (n > 1) {
        const beaten = vals.filter((v) => (isPlus ? v < myScore : v > myScore)).length
        percentiles.push(Math.round((beaten / (n - 1)) * 100))
      } else percentiles.push(100)
    }
  }
  const avgPercentile = percentiles.length ? Math.round(percentiles.reduce((a, b) => a + b, 0) / percentiles.length) : null

  return NextResponse.json({
    total: myTotal,
    rank: rankIdx >= 0 ? rankIdx + 1 : null,
    totalTeams: ranked.length,
    classRank: classIdx >= 0 ? classIdx + 1 : null,
    classTotal: classRanked.length,
    avgPercentile,
    elementScores,
  })
}
