import { prisma } from "@/lib/prisma"
import { notFound } from "next/navigation"
import { formatAthletePoints, parseRanges, type AthletePointsMode } from "@/lib/athletePoints"

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
          select: { id: true, name: true, code: true, order: true, type: true, fields: { orderBy: { order: "asc" } } },
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

  // Elemendi punktide kuvamine (kui lubatud)
  const scoreByElement = new Map(myScores.map(s => [s.elementId, s.penaltyPoints]))
  const elementById = new Map(elements.map(el => [el.id, el]))
  function pointsLabel(elementId: string): string | null {
    if (pointsMode === "HIDDEN") return null
    const el = elementById.get(elementId)
    if (!el || !el.revealPointsToAthletes) return null
    const score = scoreByElement.get(elementId)
    if (score === undefined) return null
    return formatAthletePoints(score, el.maxValue ?? defaultMax, pointsMode, pointsRanges, scoringMode)
  }

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

        {activeElements.length === 0 ? (
          <div className="text-center py-10 text-gray-400 bg-white border rounded-xl">
            <p className="text-2xl mb-2">📋</p>
            <p>Tulemusi pole veel sisestatud</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeElements.map(el => {
              const result = resultMap.get(el.id)
              const miscList = miscByElement.get(el.id) ?? []

              // Muu / Katkestamine element — kuva MiscEntry kirjed
              if (el.type === "OTHER" || el.type === "ABANDONMENT") {
                const total = miscList.reduce((s, e) => s + e.points, 0)
                const isAbandon = el.type === "ABANDONMENT"
                const revealMisc = pointsMode !== "HIDDEN" && el.revealPointsToAthletes
                return (
                  <div key={el.id} className="bg-white border rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <span className="font-mono text-xs text-gray-400 mr-1">[{el.code}]</span>
                        <span className="font-semibold text-gray-900">{el.name}</span>
                        <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${isAbandon ? "bg-rose-100 text-rose-700" : "bg-teal-100 text-teal-700"}`}>{isAbandon ? "Katkestamine" : "Muu"}</span>
                      </div>
                      {revealMisc && (
                        <span className={`text-sm font-mono font-semibold ${total >= 0 ? "text-green-700" : "text-red-700"}`}>
                          {total >= 0 ? "+" : ""}{total}p
                        </span>
                      )}
                    </div>
                    <div className="space-y-1">
                      {miscList.map(entry => (
                        <div key={entry.id} className="flex items-center justify-between text-sm py-1 border-t first:border-t-0">
                          <span className="text-gray-600">{entry.description}</span>
                          {revealMisc && (
                            <span className={`font-mono font-medium ${entry.points >= 0 ? "text-green-600" : "text-red-600"}`}>
                              {entry.points >= 0 ? "+" : ""}{entry.points}p
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              }

              // Tavaline element — kuva Result väljad
              if (!result) return null
              let values: Record<string, string> = {}
              try { values = JSON.parse(result.values) } catch {}

              const resultEl = result.element
              const inputFields = resultEl.fields.filter(f => f.type !== "COMPUTED")

              return (
                <div key={el.id} className="bg-white border rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3 gap-2">
                    <div>
                      <span className="font-mono text-xs text-gray-400 mr-1">[{el.code}]</span>
                      <span className="font-semibold text-gray-900">{el.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!result.exceptionLabel && (() => { const pl = pointsLabel(el.id); return pl ? <span className="text-sm font-mono font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">{pl}</span> : null })()}
                      {result.exceptionLabel && (
                        <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                          {result.exceptionLabel}
                        </span>
                      )}
                    </div>
                  </div>

                  {!result.exceptionLabel && inputFields.map(field => {
                    let display = "–"
                    if (field.type === "TIME_RANGE") {
                      const toSec = (v: string) => { const p = String(v).trim().split(":"); return p.length === 3 ? +p[0]*3600 + +p[1]*60 + +p[2] : p.length === 2 ? +p[0]*60 + +p[1] : 0 }
                      const st = toSec(values[field.name + "_start"] ?? "")
                      const en = toSec(values[field.name + "_end"] ?? "")
                      if (values[field.name + "_start"] && values[field.name + "_end"]) {
                        const dur = en >= st ? en - st : en + 86400 - st
                        const h = Math.floor(dur/3600), m = Math.floor((dur%3600)/60), s = dur%60
                        display = `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`
                      }
                    } else {
                      display = values[field.name] ?? "–"
                    }
                    return (
                      <div key={field.id} className="flex items-center justify-between text-sm py-1 border-t first:border-t-0">
                        <span className="text-gray-500">{field.label}</span>
                        <span className="font-mono font-medium text-gray-900">{display}</span>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
