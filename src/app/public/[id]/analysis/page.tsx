import { prisma } from "@/lib/prisma"
import { naturalCompare } from "@/lib/utils"
import { notFound } from "next/navigation"
import AnalysisView, { AnalysisTeam, AnalysisElement, TeamElementStat, ElementStat } from "@/components/public/AnalysisView"
import { parseTimeToSeconds, computeFields } from "@/lib/calculators"

export const dynamic = "force-dynamic"

// Vormindab välja väärtuse kuvamiseks (TIME → h:mm:ss, arvud korralikult)
function fmtFieldValue(v: unknown, type: string): string {
  if (v === undefined || v === null || v === "") return "–"
  if (type === "TIME" || type === "TIME_RANGE") {
    const s = typeof v === "number" ? v : parseTimeToSeconds(String(v))
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60)
    return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`
  }
  const n = parseFloat(String(v))
  return isNaN(n) ? String(v) : (Number.isInteger(n) ? String(n) : Math.round(n * 100) / 100 + "")
}

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

  const [teams, elements, allScores, penalties, results, miscEntries] = await Promise.all([
    prisma.team.findMany({ where: { competitionId: id } }).then(t => t.sort((a, b) => naturalCompare(a.code, b.code))),
    prisma.scoringElement.findMany({
      where: { competitionId: id },
      orderBy: { order: "asc" },
      include: { fields: { orderBy: { order: "asc" } }, calcMethod: true },
    }),
    prisma.computedScore.findMany({ where: { element: { competitionId: id } } }),
    prisma.manualPenalty.findMany({ where: { competitionId: id } }),
    prisma.result.findMany({
      where: { element: { competitionId: id } },
      select: { teamId: true, elementId: true, exceptionLabel: true, values: true },
    }),
    prisma.miscEntry.findMany({ where: { element: { competitionId: id, type: "OTHER" } }, select: { elementId: true, teamId: true, points: true, description: true } }),
  ])

  // Muu-kirjete selgitused (element + tiim)
  const miscMap = new Map<string, { description: string; points: number }[]>()
  for (const m of miscEntries) {
    const key = `${m.elementId}:${m.teamId}`
    const arr = miscMap.get(key) ?? []
    arr.push({ description: m.description, points: m.points })
    miscMap.set(key, arr)
  }

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

    // Vaba sisestus (DIRECT_ENTRY): suund tuleb elemendi enda seadistusest, mitte üldisest
    // hindamissüsteemist — nii kuvatakse parim/halvim ja pingerida õiges suunas.
    const cmParams = (() => { try { return JSON.parse(el.calcMethod?.params ?? "{}") } catch { return {} } })()
    const isDirectEntry = el.calcMethod?.type === "DIRECT_ENTRY"
    const elHigher = isDirectEntry
      ? (typeof cmParams.higherIsBetter === "boolean" ? cmParams.higherIsBetter : isPlusMode)
      : isPlusMode

    // Overall rank in element
    const sorted = [...elScores].sort((a, b) =>
      elHigher ? b.penaltyPoints - a.penaltyPoints : a.penaltyPoints - b.penaltyPoints
    )
    const rankMap = new Map<string, number>()
    let rank = 1
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0 && sorted[i].penaltyPoints !== sorted[i - 1].penaltyPoints) rank = i + 1
      rankMap.set(sorted[i].teamId, rank)
    }

    // Positsioon (%): kui suure osa võistkondadest see tiim edestas.
    // 100% = parim, 0% = halvim. Sama tulemus = sama %. (Sõltumatu viikgruppide suurusest.)
    const nEl = sorted.length
    const percentileMap = new Map<string, number>()
    for (const s of elScores) {
      const beaten = elScores.filter((o) =>
        elHigher ? o.penaltyPoints < s.penaltyPoints : o.penaltyPoints > s.penaltyPoints
      ).length
      percentileMap.set(s.teamId, nEl > 1 ? Math.round((beaten / (nEl - 1)) * 100) : 100)
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
        elHigher ? b.penaltyPoints - a.penaltyPoints : a.penaltyPoints - b.penaltyPoints
      )
      let cr = 1
      for (let i = 0; i < classSorted.length; i++) {
        if (i > 0 && classSorted[i].penaltyPoints !== classSorted[i - 1].penaltyPoints) cr = i + 1
        classRankInElMap.set(classSorted[i].teamId, cr)
        classOutOfMap.set(classSorted[i].teamId, classScores.length)
      }
    }

    // Per-välja statistika (tulemusväli + viigilahendajad), kasutab ARVUTATUD väärtusi → COMPUTED töötab
    const calcHigher = isDirectEntry ? elHigher : (() => { try { return Boolean(JSON.parse(el.calcMethod?.params ?? "{}").higherIsBetter) } catch { return false } })()
    const fieldsForStats = el.fields
      .filter(f => f.isResultField || f.rankingPriority != null)
      .sort((a, b) => (a.isResultField ? 0 : (a.rankingPriority ?? 99)) - (b.isResultField ? 0 : (b.rankingPriority ?? 99)))
    const nonExc = results.filter(r => r.elementId === el.id && !r.exceptionLabel)
    const computedByResult = nonExc.map(r => {
      let vals: Record<string, string | number> = {}
      try { vals = JSON.parse(r.values ?? "{}") } catch {}
      return computeFields(vals, el.fields as Parameters<typeof computeFields>[1])
    })
    const fieldStats = fieldsForStats.map(f => {
      let fHigher = calcHigher
      try { if (f.meta) { const m = JSON.parse(f.meta); if (typeof m.higherIsBetter === "boolean") fHigher = m.higherIsBetter } } catch {}
      const nums = computedByResult
        .map(c => c[f.name])
        .filter(v => v !== undefined && v !== null && !isNaN(Number(v)))
        .map(Number)
      if (nums.length === 0) return { name: f.name, label: f.label, type: f.type, best: null, avg: null, worst: null }
      return {
        name: f.name, label: f.label, type: f.type,
        best: fHigher ? Math.max(...nums) : Math.min(...nums),
        avg: Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100,
        worst: fHigher ? Math.min(...nums) : Math.max(...nums),
      }
    })
    const resultStat = fieldStats.find(fs => el.fields.find(ff => ff.name === fs.name)?.isResultField) ?? fieldStats[0] ?? null

    // Loendurid: kõik kirjed (sh erandid) vs sooritused (erandita)
    const resultsForEl = results.filter(r => r.elementId === el.id)
    const totalCount = resultsForEl.length
    const performedCount = nonExc.length

    elementStats.push({
      elementId: el.id,
      avgRawValue: resultStat?.avg ?? null,
      bestRawValue: resultStat?.best ?? null,
      worstRawValue: resultStat?.worst ?? null,
      resultFieldType: resultField?.type ?? null,
      fieldStats,
      totalCount,
      performedCount,
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

      // Vormindatud väärtus iga välja kohta (sh arvutatud väljad)
      const fieldDisplay: Record<string, string> = {}
      if (!resultEntry?.exceptionLabel && Object.keys(rawValues).length > 0) {
        const computedAll = computeFields(rawValues as Record<string, string | number>, el.fields as Parameters<typeof computeFields>[1])
        for (const f of el.fields) {
          fieldDisplay[f.name] = fmtFieldValue(computedAll[f.name], f.type)
        }
      }

      teamElementStats.push({
        teamId: team.id,
        elementId: el.id,
        score: scoreEntry?.penaltyPoints ?? null,
        rank: scoreEntry ? (rankMap.get(team.id) ?? null) : null,
        percentile: scoreEntry ? (percentileMap.get(team.id) ?? null) : null,
        classRank: !team.isHorsDeCompetition && scoreEntry ? (classRankInElMap.get(team.id) ?? null) : null,
        outOf: elScores.length,
        classOutOf: !team.isHorsDeCompetition ? (classOutOfMap.get(team.id) ?? 0) : 0,
        exceptionLabel: resultEntry?.exceptionLabel ?? null,
        rawValues: resultEntry?.exceptionLabel ? {} : rawValues,
        rawResultValue,
        fieldDisplay,
        miscEntries: el.type === "OTHER" ? (miscMap.get(`${el.id}:${team.id}`) ?? []) : undefined,
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
      .map((f) => ({ name: f.name, label: f.label, type: f.type, isResultField: f.isResultField })),
  }))

  // Simulaatori jaoks: elementide arvutuskonfiguratsioon (väljad + calcMethod)
  const defaultMax = competition.defaultKPMaxValue
  const simElements = elements.map((el) => {
    let calcParams: Record<string, unknown> = {}
    try { calcParams = JSON.parse(el.calcMethod?.params ?? "{}") } catch {}
    return {
      id: el.id, code: el.code, name: el.name, type: el.type,
      isCancelled: el.isCancelled, maxValue: el.maxValue ?? defaultMax, revealPointsToAthletes: el.revealPointsToAthletes ?? false,
      calcType: el.calcMethod?.type ?? null, customFormula: el.calcMethod?.customFormula ?? null, calcParams,
      fields: el.fields.map((f) => ({ name: f.name, type: f.type, isResultField: f.isResultField, rankingPriority: f.rankingPriority, formula: f.formula, order: f.order })),
      inputFields: el.fields.filter((f) => f.type !== "COMPUTED").map((f) => ({ name: f.name, label: f.label, type: f.type })),
    }
  })

  return (
    <AnalysisView
      competitionId={id}
      competitionName={competition.name}
      scoringMode={scoringMode}
      teams={analysisTeams}
      elements={analysisElements}
      teamElementStats={teamElementStats}
      elementStats={elementStats}
      simElements={simElements}
      defaultMax={defaultMax}
    />
  )
}
