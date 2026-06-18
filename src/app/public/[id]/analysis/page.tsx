import { prisma } from "@/lib/prisma"
import { naturalCompare } from "@/lib/utils"
import { notFound } from "next/navigation"
import AnalysisView, { AnalysisTeam, AnalysisElement, TeamElementStat, ElementStat } from "@/components/public/AnalysisView"
import { parseTimeToSeconds } from "@/lib/calculators"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const comp = await prisma.competition.findUnique({ where: { id }, select: { name: true } })
  return { title: comp ? `${comp.name} – Analüüs` : "Analüüs" }
}

export default async function PublicAnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const competition = await prisma.competition.findUnique({ where: { id } })
  if (!competition) notFound()

  const scoringMode = competition.scoringMode as "PENALTY" | "PLUS"
  const isPlusMode = scoringMode === "PLUS"

  const [teams, elements, allScores, penalties, results] = await Promise.all([
    prisma.team.findMany({ where: { competitionId: id } }).then(t => t.sort((a, b) => naturalCompare(a.code, b.code))),
    prisma.scoringElement.findMany({
      where: { competitionId: id },
      orderBy: { order: "asc" },
      include: { fields: { orderBy: { order: "asc" } } },
    }),
    prisma.computedScore.findMany({ where: { element: { competitionId: id } } }),
    prisma.manualPenalty.findMany({ where: { competitionId: id } }),
    prisma.result.findMany({
      where: { element: { competitionId: id } },
      select: { teamId: true, elementId: true, exceptionLabel: true, values: true },
    }),
  ])

  // ── Total scores per team ──────────────────────────────────────────────
  const teamTotals = teams.map((team) => {
    const teamScores = allScores.filter((s) => s.teamId === team.id)
    const teamPenalties = penalties.filter((p) => p.teamId === team.id)
    const kpTotal = teamScores.reduce((s, x) => s + x.penaltyPoints, 0)
    const manualTotal = teamPenalties.reduce((s, x) => s + x.points, 0)
    const total = Math.round((isPlusMode ? kpTotal - manualTotal : kpTotal + manualTotal) * 1000) / 1000
    return { teamId: team.id, total, isHC: team.isHorsDeCompetition }
  })

  // Overall rank (in-competition only)
  const inCompTotals = teamTotals
    .filter((t) => !t.isHC)
    .sort((a, b) => (isPlusMode ? b.total - a.total : a.total - b.total))
  const overallRankMap = new Map<string, number>()
  inCompTotals.forEach((t, i) => overallRankMap.set(t.teamId, i + 1))
  const totalInComp = inCompTotals.length

  // Class rank (in-competition only)
  const classRankMap = new Map<string, number>()
  const classCountMap = new Map<string, number>()  // teamId → how many in their class
  const classCounts: Record<string, number> = {}
  inCompTotals.forEach((t) => {
    const cls = teams.find((x) => x.id === t.teamId)?.class ?? "–"
    classCounts[cls] = (classCounts[cls] ?? 0) + 1
    classRankMap.set(t.teamId, classCounts[cls])
  })
  // Count total per class
  const classTotals: Record<string, number> = {}
  teams.forEach((t) => {
    if (t.isHorsDeCompetition) return
    const cls = t.class ?? "–"
    classTotals[cls] = (classTotals[cls] ?? 0) + 1
  })
  teams.forEach((t) => {
    classCountMap.set(t.id, classTotals[t.class ?? "–"] ?? 0)
  })

  // ── Per-element rankings ───────────────────────────────────────────────
  const teamElementStats: TeamElementStat[] = []
  const elementStats: ElementStat[] = []

  for (const el of elements) {
    const elScores = allScores.filter((s) => s.elementId === el.id)
    const resultField = el.fields.find((f) => f.isResultField)

    // Overall rank in element
    const sorted = [...elScores].sort((a, b) =>
      isPlusMode ? b.penaltyPoints - a.penaltyPoints : a.penaltyPoints - b.penaltyPoints
    )
    const rankMap = new Map<string, number>()
    let rank = 1
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0 && sorted[i].penaltyPoints !== sorted[i - 1].penaltyPoints) rank = i + 1
      rankMap.set(sorted[i].teamId, rank)
    }

    // Class rank in element (in-comp teams only)
    const classRankInElMap = new Map<string, number>()
    const classOutOfMap = new Map<string, number>()
    const classes = [...new Set(teams.filter(t => !t.isHorsDeCompetition).map(t => t.class ?? "–"))]
    for (const cls of classes) {
      const classTeamIds = new Set(
        teams.filter(t => !t.isHorsDeCompetition && (t.class ?? "–") === cls).map(t => t.id)
      )
      const classScores = elScores.filter(s => classTeamIds.has(s.teamId))
      const classSorted = [...classScores].sort((a, b) =>
        isPlusMode ? b.penaltyPoints - a.penaltyPoints : a.penaltyPoints - b.penaltyPoints
      )
      let cr = 1
      for (let i = 0; i < classSorted.length; i++) {
        if (i > 0 && classSorted[i].penaltyPoints !== classSorted[i - 1].penaltyPoints) cr = i + 1
        classRankInElMap.set(classSorted[i].teamId, cr)
        classOutOfMap.set(classSorted[i].teamId, classScores.length)
      }
    }

    // Raw value averages (result field only)
    const rawNumbers: number[] = []
    for (const r of results.filter(r => r.elementId === el.id && !r.exceptionLabel)) {
      if (!resultField) continue
      let vals: Record<string, unknown> = {}
      try { vals = JSON.parse(r.values ?? "{}") } catch {}
      const raw = vals[resultField.name]
      if (raw === undefined || raw === null || raw === "") continue
      const num = resultField.type === "TIME"
        ? parseTimeToSeconds(String(raw))
        : parseFloat(String(raw))
      if (!isNaN(num)) rawNumbers.push(num)
    }
    const avgRaw = rawNumbers.length > 0
      ? Math.round((rawNumbers.reduce((a, b) => a + b, 0) / rawNumbers.length) * 100) / 100
      : null
    const bestRaw = rawNumbers.length > 0
      ? (isPlusMode || resultField?.type === "TIME" ? Math.max(...rawNumbers) : Math.min(...rawNumbers))
      : null
    const worstRaw = rawNumbers.length > 0
      ? (isPlusMode || resultField?.type === "TIME" ? Math.min(...rawNumbers) : Math.max(...rawNumbers))
      : null

    elementStats.push({
      elementId: el.id,
      avgRawValue: avgRaw,
      bestRawValue: bestRaw,
      worstRawValue: worstRaw,
      resultFieldType: resultField?.type ?? null,
    })

    // Per-team stats for this element
    for (const team of teams) {
      const scoreEntry = elScores.find((s) => s.teamId === team.id)
      const resultEntry = results.find((r) => r.teamId === team.id && r.elementId === el.id)
      let rawValues: Record<string, unknown> = {}
      try { rawValues = JSON.parse(resultEntry?.values ?? "{}") } catch {}

      // Extract result field raw value for display
      let rawResultValue: string | number | null = null
      if (resultField && !resultEntry?.exceptionLabel) {
        const v = rawValues[resultField.name]
        if (v !== undefined && v !== null && v !== "") rawResultValue = v as string | number
      }

      teamElementStats.push({
        teamId: team.id,
        elementId: el.id,
        score: scoreEntry?.penaltyPoints ?? null,
        rank: scoreEntry ? (rankMap.get(team.id) ?? null) : null,
        classRank: !team.isHorsDeCompetition && scoreEntry ? (classRankInElMap.get(team.id) ?? null) : null,
        outOf: elScores.length,
        classOutOf: !team.isHorsDeCompetition ? (classOutOfMap.get(team.id) ?? 0) : 0,
        exceptionLabel: resultEntry?.exceptionLabel ?? null,
        rawValues: resultEntry?.exceptionLabel ? {} : rawValues,
        rawResultValue,
      })
    }
  }

  // ── Build teams prop ───────────────────────────────────────────────────
  const analysisTeams: AnalysisTeam[] = teams.map((team) => {
    const total = teamTotals.find((t) => t.teamId === team.id)?.total ?? 0
    return {
      id: team.id,
      name: team.name,
      code: team.code,
      class: team.class,
      isHorsDeCompetition: team.isHorsDeCompetition,
      totalScore: total,
      overallRank: overallRankMap.get(team.id) ?? null,
      totalInComp,
      classRank: classRankMap.get(team.id) ?? null,
      classTotal: classCountMap.get(team.id) ?? 0,
    }
  })

  const analysisElements: AnalysisElement[] = elements.map((el) => ({
    id: el.id,
    name: el.name,
    code: el.code,
    isCancelled: el.isCancelled,
    fields: el.fields
      .filter((f) => f.type !== "COMPUTED")
      .map((f) => ({ name: f.name, label: f.label, type: f.type, isResultField: f.isResultField })),
  }))

  return (
    <AnalysisView
      competitionId={id}
      competitionName={competition.name}
      scoringMode={scoringMode}
      teams={analysisTeams}
      elements={analysisElements}
      teamElementStats={teamElementStats}
      elementStats={elementStats}
    />
  )
}
