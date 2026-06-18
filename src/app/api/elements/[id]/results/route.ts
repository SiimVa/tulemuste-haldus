import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { calculateScores } from "@/lib/calculators"
import { parseValidation, validateFieldValue } from "@/lib/fieldValidation"

// GET – kõik tulemused selle elemendi jaoks
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params

  const results = await prisma.result.findMany({
    where: { elementId: id },
    include: { team: true },
    orderBy: { updatedAt: "desc" },
  })
  return NextResponse.json(results)
}

// POST – sisesta / uuenda tulemus (kohtunik)
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: elementId } = await params

  // Kontrollime kas on kasutaja sessioon VÕI juurdepääsu token
  const session = await auth()
  const authHeader = req.headers.get("x-access-token")
  let enteredByUserId: string | null = null
  let enteredByTokenId: string | null = null

  if (session?.user?.id) {
    enteredByUserId = session.user.id
  } else if (authHeader) {
    const token = await prisma.accessToken.findUnique({
      where: { token: authHeader },
    })
    if (!token || token.type !== "JUDGE") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    // Kontroll: kas kohtunik tohib seda KP-d sisestada?
    if (token.elementId && token.elementId !== elementId) {
      return NextResponse.json({ error: "Keelatud – vale KP" }, { status: 403 })
    }
    enteredByTokenId = token.id
    await prisma.accessToken.update({ where: { id: token.id }, data: { lastUsedAt: new Date() } })
  } else {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json()
  const { teamId, values, exceptionLabel } = body

  // Valideeri sisendväljad (ainult kui ei ole erandit)
  if (!exceptionLabel && values) {
    const element = await prisma.scoringElement.findUnique({
      where: { id: elementId },
      include: { fields: true, sections: { include: { fields: true } } },
    })
    const allFields = [
      ...(element?.fields ?? []),
      ...(element?.sections.flatMap(s => s.fields) ?? []),
    ]
    for (const field of allFields) {
      if (field.type === "COMPUTED") continue
      const validation = parseValidation(field.validation)
      if (!Object.keys(validation).length) continue
      if (field.type === "TIME_RANGE") {
        if (validation.required) {
          const hasStart = (values[field.name + "_start"] ?? "").toString().trim() !== ""
          const hasEnd = (values[field.name + "_end"] ?? "").toString().trim() !== ""
          if (!hasStart || !hasEnd) {
            return NextResponse.json({ error: `${field.label} — sisesta nii algusaeg kui lõppaeg` }, { status: 422 })
          }
        }
        continue
      }
      const err = validateFieldValue(values[field.name], field.name, field.label, field.type, validation)
      if (err) return NextResponse.json({ error: err.message }, { status: 422 })
    }
  }

  // Leia erandi karistus
  let exceptionPenalty: number | null = null
  if (exceptionLabel) {
    const exc = await prisma.elementException.findFirst({
      where: { elementId, label: exceptionLabel },
    })
    exceptionPenalty = exc?.penalty ?? null
  }

  const result = await prisma.result.upsert({
    where: { elementId_teamId: { elementId, teamId } },
    create: {
      elementId,
      teamId,
      values: JSON.stringify(values ?? {}),
      exceptionLabel: exceptionLabel ?? null,
      exceptionPenalty,
      enteredByUserId,
      enteredByTokenId,
    },
    update: {
      values: JSON.stringify(values ?? {}),
      exceptionLabel: exceptionLabel ?? null,
      exceptionPenalty,
      enteredByUserId,
      enteredByTokenId,
    },
    include: { team: true },
  })

  // Taasaruta skoorid kohe pärast sisestust
  await recomputeScores(elementId)

  return NextResponse.json(result)
}

// Abi: arvuta kõigi võistkondade skoorid uuesti
async function recomputeScores(elementId: string) {
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

  let scored: { teamId: string; penaltyPoints: number }[]

  if (element.sections.length > 0) {
    // Kombineeritud: iga sektsiooni skoor arvutatakse eraldi ja summeritakse
    const exceptionResults = results.filter(r => r.exceptionLabel)
    const normalResults = results.filter(r => !r.exceptionLabel)
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
    // Tavaline element
    const calcScored = calculateScores(element, results, competitionConfig)
    scored = calcScored.map(s => ({
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
