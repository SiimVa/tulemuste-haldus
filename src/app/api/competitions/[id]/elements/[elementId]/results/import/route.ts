import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import * as XLSX from "xlsx"

async function checkAccess(competitionId: string, userId: string, role: string) {
  if (role === "ADMIN") return true
  const comp = await prisma.competition.findUnique({
    where: { id: competitionId },
    include: { members: { where: { userId }, select: { id: true } } },
  })
  return comp?.organizerId === userId || (comp?.members?.length ?? 0) > 0
}

function isTimeValue(val: string): boolean {
  // accepts mm:ss (e.g. "1:23") or h:mm:ss (e.g. "1:23:45")
  return /^\d+:\d{2}(:\d{2})?$/.test(val.trim())
}

// Excel stores times as fraction of a day (e.g. 00:02:05 = 125/86400 ≈ 0.001446)
function excelFractionToTime(val: string): string | null {
  const num = parseFloat(val)
  if (isNaN(num) || num < 0 || num >= 1) return null
  const totalSeconds = Math.round(num * 86400)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`
}

function isNumericValue(val: string): boolean {
  return val.trim() === "" || !isNaN(Number(val.trim().replace(",", ".")))
}

export type ImportRowResult = {
  rowNum: number
  teamCode: string
  teamName: string
  status: "ok" | "error" | "skipped"
  message?: string
  values?: Record<string, string>
  exceptionLabel?: string
}

export type ImportResult = {
  rows: ImportRowResult[]
  missingTeams: string[]
  summary: {
    total: number
    imported: number
    errors: number
    skipped: number
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; elementId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: competitionId, elementId } = await params

  const ok = await checkAccess(competitionId, session.user.id, session.user.role ?? "")
  if (!ok) return NextResponse.json({ error: "Keelatud" }, { status: 403 })

  const contentType = req.headers.get("content-type") ?? ""
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json({ error: "Oodati multipart/form-data" }, { status: 400 })
  }

  const formData = await req.formData()
  const file = formData.get("file")
  const dryRunStr = formData.get("dryRun")
  const dryRun = dryRunStr === "true"

  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Fail puudub" }, { status: 400 })
  }

  const element = await prisma.scoringElement.findUnique({
    where: { id: elementId },
    include: {
      fields: {
        where: { sectionId: null },
        orderBy: { order: "asc" },
      },
      sections: {
        orderBy: { order: "asc" },
        include: {
          fields: { orderBy: { order: "asc" } },
        },
      },
      exceptions: { orderBy: { order: "asc" } },
    },
  })
  if (!element) return NextResponse.json({ error: "Element ei leitud" }, { status: 404 })

  const teams = await prisma.team.findMany({
    where: { competitionId },
    orderBy: { code: "asc" },
  })

  // Parse file to raw rows (array of arrays)
  const buffer = await file.arrayBuffer()
  const filename = (file as File).name.toLowerCase()

  let allRows: unknown[][]
  if (filename.endsWith(".csv")) {
    const text = Buffer.from(buffer).toString("utf-8")
    allRows = text
      .split(/\r?\n/)
      .map((l) => l.split(",").map((c) => c.trim().replace(/^"|"$/g, "")))
      .filter((r) => r.some((c) => c !== ""))
  } else {
    const wb = XLSX.read(new Uint8Array(buffer), { type: "array" })
    const ws = wb.Sheets[wb.SheetNames[0]]
    allRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" })
  }

  // Find header row: look for "Tähis" or "code" (case-insensitive)
  let headerRowIdx = -1
  for (let i = 0; i < Math.min(allRows.length, 10); i++) {
    const row = allRows[i] as string[]
    const rowStr = row.map((c) => String(c ?? "").toLowerCase())
    if (rowStr.some((c) => c === "tähis" || c === "code")) {
      headerRowIdx = i
      break
    }
  }

  if (headerRowIdx === -1) {
    return NextResponse.json({ error: "Päistarida ei leitud (oodati veergu 'Tähis' või 'code')" }, { status: 400 })
  }

  const headerRow = (allRows[headerRowIdx] as string[]).map((c) => String(c ?? "").trim())
  const codeColIdx = headerRow.findIndex((h) => h.toLowerCase() === "tähis" || h.toLowerCase() === "code")
  const nameColIdx = headerRow.findIndex((h) => h.toLowerCase() === "võistkond" || h.toLowerCase() === "name")
  const exceptionColIdx = headerRow.findIndex((h) => h.toLowerCase() === "erand" || h.toLowerCase() === "exception")

  // Map field labels to column indices (includes section fields for combined elements)
  const directInputFields = element.fields.filter((f) => f.type !== "COMPUTED" && !f.formula)
  const sectionInputFields = (element.sections ?? []).flatMap((s) =>
    s.fields.filter((f) => f.type !== "COMPUTED" && !f.formula)
  )
  const inputFields = [...directInputFields, ...sectionInputFields]
  const fieldColMap: { field: typeof inputFields[0]; colIdx: number; storeAs?: string }[] = []
  for (const field of inputFields) {
    if (field.type === "TIME_RANGE") {
      // TIME_RANGE expands to two columns: _start and _end
      const startIdx = headerRow.findIndex((h) => h.toLowerCase() === `${field.label} (algus)`.toLowerCase() || h.toLowerCase() === `${field.name}_start`)
      const endIdx = headerRow.findIndex((h) => h.toLowerCase() === `${field.label} (lõpp)`.toLowerCase() || h.toLowerCase() === `${field.name}_end`)
      if (startIdx >= 0) fieldColMap.push({ field, colIdx: startIdx, storeAs: field.name + "_start" })
      if (endIdx >= 0) fieldColMap.push({ field, colIdx: endIdx, storeAs: field.name + "_end" })
    } else {
      const idx = headerRow.findIndex((h) => h.toLowerCase() === field.label.toLowerCase() || h.toLowerCase() === field.name.toLowerCase())
      if (idx >= 0) fieldColMap.push({ field, colIdx: idx })
    }
  }

  // Build team lookup maps
  const teamByCode = new Map(teams.map((t) => [t.code.toLowerCase(), t]))
  const teamByName = new Map(teams.map((t) => [t.name.toLowerCase(), t]))
  const foundTeamIds = new Set<string>()

  const rows: ImportRowResult[] = []
  const dataRows = allRows.slice(headerRowIdx + 1)

  for (let i = 0; i < dataRows.length; i++) {
    const rowData = (dataRows[i] as unknown[]).map((c) => String(c ?? "").trim())
    const rowNum = headerRowIdx + i + 2 // 1-based row number in original file

    // Skip empty rows
    if (rowData.every((c) => c === "")) continue

    const teamCodeRaw = codeColIdx >= 0 ? rowData[codeColIdx] ?? "" : ""
    const teamNameRaw = nameColIdx >= 0 ? rowData[nameColIdx] ?? "" : ""

    // Find team
    let team = teamByCode.get(teamCodeRaw.toLowerCase())
    if (!team && teamNameRaw) {
      team = teamByName.get(teamNameRaw.toLowerCase())
    }

    if (!team) {
      rows.push({
        rowNum,
        teamCode: teamCodeRaw,
        teamName: teamNameRaw,
        status: "skipped",
        message: `Võistkonda ei leitud koodiga "${teamCodeRaw}"`,
      })
      continue
    }

    foundTeamIds.add(team.id)

    // Check exception column
    const exceptionLabel = exceptionColIdx >= 0 ? rowData[exceptionColIdx] ?? "" : ""

    if (exceptionLabel) {
      rows.push({
        rowNum,
        teamCode: team.code,
        teamName: team.name,
        status: "ok",
        exceptionLabel,
        values: {},
      })
      continue
    }

    // Parse field values
    const values: Record<string, string> = {}
    let hasError = false
    let errorMsg = ""

    for (const { field, colIdx, storeAs } of fieldColMap) {
      const storeName = storeAs ?? field.name
      const rawVal = rowData[colIdx] ?? ""
      if (rawVal === "") {
        values[storeName] = ""
        continue
      }

      if (field.type === "NUMBER") {
        if (!isNumericValue(rawVal)) {
          hasError = true
          errorMsg = `Väli "${field.label}" peaks olema arv, saadi: "${rawVal}"`
          break
        }
        values[storeName] = rawVal.replace(",", ".")
      } else if (field.type === "TIME" || field.type === "TIME_RANGE") {
        const excelTime = excelFractionToTime(rawVal)
        if (excelTime !== null) {
          values[storeName] = excelTime
        } else if (!isTimeValue(rawVal)) {
          hasError = true
          errorMsg = `Väli "${field.label}" peaks olema aeg (mm:ss), saadi: "${rawVal}"`
          break
        } else {
          values[storeName] = rawVal
        }
      } else {
        values[storeName] = rawVal
      }
    }

    if (hasError) {
      rows.push({
        rowNum,
        teamCode: team.code,
        teamName: team.name,
        status: "error",
        message: errorMsg,
      })
      continue
    }

    rows.push({
      rowNum,
      teamCode: team.code,
      teamName: team.name,
      status: "ok",
      values,
    })
  }

  // Teams not in file
  const missingTeams = teams
    .filter((t) => !foundTeamIds.has(t.id))
    .map((t) => `${t.code} ${t.name}`)

  const summary = {
    total: rows.length,
    imported: rows.filter((r) => r.status === "ok").length,
    errors: rows.filter((r) => r.status === "error").length,
    skipped: rows.filter((r) => r.status === "skipped").length,
  }

  const result: ImportResult = { rows, missingTeams, summary }

  if (dryRun) {
    return NextResponse.json(result)
  }

  // Perform actual import
  const okRows = rows.filter((r) => r.status === "ok")
  const importErrors: string[] = []

  for (const row of okRows) {
    const team = teamByCode.get(row.teamCode.toLowerCase())
    if (!team) continue

    const valuesJson = row.exceptionLabel ? "{}" : JSON.stringify(row.values ?? {})
    const exceptionLabel = row.exceptionLabel ?? null

    // Find exception penalty if applicable
    let exceptionPenalty: number | null = null
    if (exceptionLabel) {
      const exc = element.exceptions.find((e) => e.label === exceptionLabel)
      exceptionPenalty = exc?.penalty ?? null
    }

    try {
      await prisma.result.upsert({
        where: { elementId_teamId: { elementId, teamId: team.id } },
        create: {
          elementId,
          teamId: team.id,
          values: valuesJson,
          exceptionLabel,
          exceptionPenalty,
          enteredByUserId: session.user.id,
        },
        update: {
          values: valuesJson,
          exceptionLabel,
          exceptionPenalty,
          enteredByUserId: session.user.id,
        },
      })
    } catch {
      importErrors.push(`Tulemuse salvestamine ebaõnnestus: ${row.teamCode} ${row.teamName}`)
      row.status = "error"
      row.message = "Salvestamine ebaõnnestus"
    }
  }

  // Trigger recalculate for this element
  try {
    await recomputeElementScores(elementId, competitionId)
  } catch {
    // Non-fatal: import still succeeded
  }

  const finalSummary = {
    total: rows.length,
    imported: rows.filter((r) => r.status === "ok").length,
    errors: rows.filter((r) => r.status === "error").length,
    skipped: rows.filter((r) => r.status === "skipped").length,
  }

  return NextResponse.json({ rows, missingTeams, summary: finalSummary, importErrors })
}

async function recomputeElementScores(elementId: string, competitionId: string) {
  const { calculateScores } = await import("@/lib/calculators")

  const element = await prisma.scoringElement.findUnique({
    where: { id: elementId },
    include: {
      fields: { where: { sectionId: null } },
      exceptions: true,
      calcMethod: true,
      miscEntries: true,
      sections: {
        include: { fields: { orderBy: { order: "asc" } }, calcMethod: true },
        orderBy: { order: "asc" },
      },
      competition: {
        select: { scoringMode: true, defaultKPMaxValue: true, defaultPKMaxValue: true },
      },
    },
  })
  if (!element) return

  const teams = await prisma.team.findMany({ where: { competitionId } })
  const dnfTeams = new Map(
    teams.filter((t) => t.dnfFromElementOrder != null).map((t) => [t.id, t.dnfFromElementOrder!])
  )

  const results = await prisma.result.findMany({
    where: { elementId },
    include: { team: true },
  })
  if (results.length === 0) return

  const competitionConfig = {
    scoringMode: element.competition.scoringMode as "PENALTY" | "PLUS",
    defaultKPMaxValue: element.competition.defaultKPMaxValue,
    defaultPKMaxValue: element.competition.defaultPKMaxValue,
  }
  const isPlusMode = competitionConfig.scoringMode === "PLUS"

  const miscByTeam = new Map<string, number>()
  for (const entry of element.miscEntries) {
    miscByTeam.set(entry.teamId, (miscByTeam.get(entry.teamId) ?? 0) + entry.points)
  }

  const activeResults = results.filter((r) => {
    const dnfOrder = dnfTeams.get(r.teamId)
    return dnfOrder == null || element.order < dnfOrder
  })

  let scored: { teamId: string; penaltyPoints: number }[]

  if (element.sections.length > 0) {
    const exceptionResults = activeResults.filter((r) => r.exceptionLabel)
    const normalResults = activeResults.filter((r) => !r.exceptionLabel)
    const teamScores = new Map<string, number>()

    for (const r of exceptionResults) {
      const magnitude = Math.abs(r.exceptionPenalty ?? 0)
      teamScores.set(r.teamId, isPlusMode ? -magnitude : magnitude)
    }

    for (const section of element.sections) {
      if (!section.calcMethod || section.fields.length === 0) continue
      const mockElement = {
        id: element.id,
        calcMethod: {
          id: section.calcMethod.id,
          elementId: element.id,
          type: section.calcMethod.type,
          params: section.calcMethod.params,
          customFormula: section.calcMethod.customFormula,
        },
        fields: section.fields,
        exceptions: [] as { label: string; penalty: number }[],
        maxValue: section.maxValue,
      }
      const sectionScored = calculateScores(mockElement, normalResults, competitionConfig)
      for (const s of sectionScored) {
        teamScores.set(s.teamId, Math.round(((teamScores.get(s.teamId) ?? 0) + s.penaltyPoints) * 1000) / 1000)
      }
    }

    for (const [teamId, bonus] of miscByTeam) {
      if (teamScores.has(teamId)) {
        teamScores.set(teamId, Math.round(((teamScores.get(teamId) ?? 0) + bonus) * 1000) / 1000)
      }
    }

    scored = [...teamScores.entries()].map(([teamId, penaltyPoints]) => ({ teamId, penaltyPoints }))
  } else {
    const calcScored = calculateScores(element, activeResults, competitionConfig)
    scored = calcScored.map((s) => ({
      teamId: s.teamId,
      penaltyPoints: Math.round((s.penaltyPoints + (miscByTeam.get(s.teamId) ?? 0)) * 1000) / 1000,
    }))
  }

  if (scored.length === 0) return

  await prisma.$transaction(
    scored.map((s) =>
      prisma.computedScore.upsert({
        where: { elementId_teamId: { elementId, teamId: s.teamId } },
        create: { elementId, teamId: s.teamId, penaltyPoints: s.penaltyPoints },
        update: { penaltyPoints: s.penaltyPoints, computedAt: new Date() },
      })
    )
  )
}
