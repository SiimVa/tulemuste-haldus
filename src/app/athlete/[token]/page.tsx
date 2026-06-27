import { prisma } from "@/lib/prisma"
import { notFound } from "next/navigation"
import { formatAthletePoints, parseRanges, type AthletePointsMode } from "@/lib/athletePoints"
import { AthleteResultCards, type ResultCard } from "@/components/athlete/AthleteResultCards"

export const dynamic = "force-dynamic"


export default async function AthletePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const accessToken = await prisma.accessToken.findUnique({
    where: { token },
    include: {
      competition: { select: { id: true, name: true, scoringMode: true, defaultKPMaxValue: true, athletePointsMode: true, athletePointsRanges: true, athleteShowTotal: true } },
      team: { include: { members: true } },
    },
  })

  if (!accessToken || accessToken.type !== "ATHLETE" || !accessToken.team) notFound()

  const team = accessToken.team
  const competitionId = accessToken.competition.id

  // Punktide nähtavuse seaded
  const pointsMode = (accessToken.competition.athletePointsMode as AthletePointsMode) ?? "HIDDEN"
  const pointsRanges = parseRanges(accessToken.competition.athletePointsRanges)
  const showTotal = accessToken.competition.athleteShowTotal && pointsMode !== "HIDDEN"
  const defaultMax = accessToken.competition.defaultKPMaxValue
  const scoringMode = accessToken.competition.scoringMode as "PENALTY" | "PLUS"

  const [results, miscEntries, elements, myScores] = await Promise.all([
    prisma.result.findMany({
      where: { teamId: team.id },
      include: {
        element: {
          select: {
            id: true, name: true, code: true, order: true, type: true,
            fields: { orderBy: { order: "asc" } },
            calcMethod: { select: { type: true, params: true, customFormula: true } },
          },
        },
      },
    }),
    prisma.miscEntry.findMany({
      where: { teamId: team.id },
      include: {
        element: { select: { id: true, name: true, code: true, order: true, type: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.scoringElement.findMany({
      where: { competitionId },
      orderBy: { order: "asc" },
      select: { id: true, name: true, code: true, order: true, type: true, isCancelled: true, maxValue: true, revealPointsToAthletes: true },
    }),
    prisma.computedScore.findMany({ where: { teamId: team.id }, select: { elementId: true, penaltyPoints: true } }),
  ])

  const scoreByElement = new Map(myScores.map(s => [s.elementId, s.penaltyPoints]))

  // Kogusumma + koht (kui lubatud)
  let totalBlock: { totalLabel: string; rank: number | null; totalTeams: number; classRank: number | null; classTotal: number } | null = null
  if (showTotal) {
    const [allScores, allPenalties, allTeams] = await Promise.all([
      prisma.computedScore.findMany({ where: { element: { competitionId } }, select: { teamId: true, penaltyPoints: true } }),
      prisma.manualPenalty.findMany({ where: { competitionId }, select: { teamId: true, points: true } }),
      prisma.team.findMany({ where: { competitionId }, select: { id: true, class: true, isHorsDeCompetition: true, hcFromElementOrder: true } }),
    ])
    const totalByTeam = new Map<string, number>()
    for (const t of allTeams) totalByTeam.set(t.id, 0)
    for (const s of allScores) totalByTeam.set(s.teamId, (totalByTeam.get(s.teamId) ?? 0) + s.penaltyPoints)
    for (const p of allPenalties) totalByTeam.set(p.teamId, (totalByTeam.get(p.teamId) ?? 0) + (scoringMode === "PLUS" ? -p.points : p.points))

    const inComp = allTeams.filter(t => !t.isHorsDeCompetition && t.hcFromElementOrder == null)
    const ranked = inComp
      .map(t => ({ id: t.id, class: t.class ?? "–", total: Math.round((totalByTeam.get(t.id) ?? 0) * 1000) / 1000 }))
      .sort((a, b) => (scoringMode === "PLUS" ? b.total - a.total : a.total - b.total))
    const myTotal = Math.round((totalByTeam.get(team.id) ?? 0) * 1000) / 1000
    const rankIdx = ranked.findIndex(r => r.id === team.id)
    const myClass = team.class ?? "–"
    const classRanked = ranked.filter(r => r.class === myClass)
    const classIdx = classRanked.findIndex(r => r.id === team.id)
    const sumMax = elements.filter(e => !e.isCancelled).reduce((s, e) => s + (e.maxValue ?? defaultMax), 0)
    totalBlock = {
      totalLabel: formatAthletePoints(myTotal, sumMax, pointsMode, pointsRanges, scoringMode) ?? `${myTotal}p`,
      rank: rankIdx >= 0 ? rankIdx + 1 : null,
      totalTeams: ranked.length,
      classRank: classIdx >= 0 ? classIdx + 1 : null,
      classTotal: classRanked.length,
    }
  }

  await prisma.accessToken.update({ where: { token }, data: { lastUsedAt: new Date() } })

  // Grupeeri MiscEntry-d elemendi järgi
  const miscByElement = new Map<string, typeof miscEntries>()
  for (const e of miscEntries) {
    const list = miscByElement.get(e.elementId) ?? []
    list.push(e)
    miscByElement.set(e.elementId, list)
  }

  // Kõik elemendid mille kohta on andmeid (Result või MiscEntry)
  const resultMap = new Map(results.map(r => [r.elementId, r]))
  const activeElementIds = new Set([
    ...results.map(r => r.elementId),
    ...miscEntries.map(e => e.elementId),
  ])
  const activeElements = elements
    .filter(el => activeElementIds.has(el.id))
    .sort((a, b) => a.order - b.order)

  // Ehita kaardid kliendikomponendile (simulaatoriga)
  const cards: ResultCard[] = activeElements.flatMap((el): ResultCard[] => {
    if (el.type === "OTHER" || el.type === "ABANDONMENT") {
      return [{
        id: el.id, code: el.code, name: el.name, type: el.type,
        isCancelled: el.isCancelled, maxValue: el.maxValue ?? defaultMax, revealPointsToAthletes: el.revealPointsToAthletes,
        exceptionLabel: null, realScore: scoreByElement.get(el.id) ?? null,
        fields: [], inputFields: [], values: {}, calcType: null, customFormula: null, calcParams: {},
        misc: (miscByElement.get(el.id) ?? []).map(e => ({ id: e.id, description: e.description, points: e.points })),
      }]
    }
    const result = resultMap.get(el.id)
    if (!result) return []
    let values: Record<string, string> = {}
    try { values = JSON.parse(result.values) } catch {}
    const cm = result.element.calcMethod
    let calcParams: Record<string, unknown> = {}
    try { calcParams = JSON.parse(cm?.params ?? "{}") } catch {}
    return [{
      id: el.id, code: el.code, name: el.name, type: el.type,
      isCancelled: el.isCancelled, maxValue: el.maxValue ?? defaultMax, revealPointsToAthletes: el.revealPointsToAthletes,
      exceptionLabel: result.exceptionLabel ?? null,
      realScore: scoreByElement.get(el.id) ?? null,
      fields: result.element.fields.map(f => ({ name: f.name, type: f.type, isResultField: f.isResultField, rankingPriority: f.rankingPriority, formula: f.formula, order: f.order })),
      inputFields: result.element.fields.filter(f => f.type !== "COMPUTED").map(f => ({ name: f.name, label: f.label, type: f.type })),
      values,
      calcType: cm?.type ?? null,
      customFormula: cm?.customFormula ?? null,
      calcParams,
      misc: [],
    }]
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between gap-2">
          <span className="font-semibold text-gray-900 truncate">{accessToken.competition.name}</span>
          <span className="text-sm text-gray-500 shrink-0">{team.name}</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <div className="bg-white border rounded-xl p-5">
          <h1 className="text-lg font-bold text-gray-900">{team.name}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {team.class && <span className="bg-gray-100 px-2 py-0.5 rounded-full text-xs mr-2">{team.class}</span>}
            {team.members.filter(m => m.role === "COMPETITOR").map(m => m.name).join(", ")}
          </p>
        </div>

        {totalBlock && (
          <div className="bg-blue-600 text-white rounded-xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-blue-100">Kokku</p>
                <p className="text-2xl font-bold font-mono">{totalBlock.totalLabel}</p>
              </div>
              <div className="text-right">
                {totalBlock.rank != null && (
                  <p className="text-xs text-blue-100">
                    Üldkoht <span className="text-lg font-bold text-white">{totalBlock.rank}</span><span className="text-blue-200">/{totalBlock.totalTeams}</span>
                  </p>
                )}
                {totalBlock.classRank != null && totalBlock.classTotal > 1 && (
                  <p className="text-xs text-blue-100 mt-1">
                    Klassis <span className="font-bold text-white">{totalBlock.classRank}</span><span className="text-blue-200">/{totalBlock.classTotal}</span>
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {cards.length === 0 ? (
          <div className="text-center py-10 text-gray-400 bg-white border rounded-xl">
            <p className="text-2xl mb-2">📋</p>
            <p>Tulemusi pole veel sisestatud</p>
          </div>
        ) : (
          <AthleteResultCards
            cards={cards}
            scoringMode={scoringMode}
            pointsMode={pointsMode}
            pointsRanges={pointsRanges}
            defaultMax={defaultMax}
          />
        )}
      </main>
    </div>
  )
}
