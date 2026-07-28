import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { parseValidation, validateClockValue, validateFieldValue } from "@/lib/fieldValidation"
import { recomputeElementScores } from "@/lib/recompute"
import {
  canEnterCompetitionResults,
  canEnterElementResults,
  teamBelongsToCompetition,
} from "@/lib/competitionAccess"

// GET – kõik tulemused selle elemendi jaoks
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  if (!await canEnterElementResults(id, { id: session.user.id, role: session.user.role })) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  }

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
  const targetElement = await prisma.scoringElement.findUnique({
    where: { id: elementId },
    select: { competitionId: true },
  })
  if (!targetElement) return NextResponse.json({ error: "Elementi ei leitud" }, { status: 404 })

  // Kontrollime kas on kasutaja sessioon VÕI juurdepääsu token
  const session = await auth()
  const authHeader = req.headers.get("x-access-token")
  let enteredByUserId: string | null = null
  let enteredByTokenId: string | null = null

  if (session?.user?.id) {
    if (!await canEnterCompetitionResults(targetElement.competitionId, { id: session.user.id, role: session.user.role })) {
      return NextResponse.json({ error: "Keelatud" }, { status: 403 })
    }
    enteredByUserId = session.user.id
  } else if (authHeader) {
    const token = await prisma.accessToken.findUnique({
      where: { token: authHeader },
    })
    if (!token || token.type !== "JUDGE") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (token.competitionId !== targetElement.competitionId) {
      return NextResponse.json({ error: "Keelatud – vale võistlus" }, { status: 403 })
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

  const body = await req.json().catch(() => ({}))
  const { teamId, values, exceptionLabel } = body
  if (typeof teamId !== "string" || !teamId) {
    return NextResponse.json({ error: "Võistkonna ID puudub" }, { status: 400 })
  }
  if (!await teamBelongsToCompetition(teamId, targetElement.competitionId)) {
    return NextResponse.json({ error: "Võistkond ei kuulu sellele võistlusele" }, { status: 400 })
  }
  if (values != null && (typeof values !== "object" || Array.isArray(values))) {
    return NextResponse.json({ error: "Väljade väärtused peavad olema objekt" }, { status: 400 })
  }
  if (
    values &&
    Object.values(values).some((value) =>
      value != null && !["string", "number", "boolean"].includes(typeof value)
    )
  ) {
    return NextResponse.json({ error: "Väljade väärtused peavad olema lihtväärtused" }, { status: 400 })
  }
  if (exceptionLabel != null && typeof exceptionLabel !== "string") {
    return NextResponse.json({ error: "Vigane erand" }, { status: 400 })
  }

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
      if (field.type === "TIME_RANGE") {
        const startError = validateClockValue(
          values[field.name + "_start"],
          field.name + "_start",
          `${field.label} algusaeg`,
          Boolean(validation.required)
        )
        if (startError) return NextResponse.json({ error: startError.message }, { status: 422 })
        const endError = validateClockValue(
          values[field.name + "_end"],
          field.name + "_end",
          `${field.label} lõppaeg`,
          Boolean(validation.required)
        )
        if (endError) return NextResponse.json({ error: endError.message }, { status: 422 })
        const hasStart = String(values[field.name + "_start"] ?? "").trim() !== ""
        const hasEnd = String(values[field.name + "_end"] ?? "").trim() !== ""
        if (hasStart !== hasEnd) {
          return NextResponse.json({ error: `${field.label} — sisesta nii algusaeg kui lõppaeg` }, { status: 422 })
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
    if (!exc) return NextResponse.json({ error: "Tundmatu erand" }, { status: 422 })
    exceptionPenalty = exc.penalty
  }

  // Kui erandit pole ja kõik lahtrid on tühjad → loe "sisestamata": kustuta kirje ja skoor
  const hasAnyValue = values && Object.values(values).some((v) => String(v ?? "").trim() !== "")
  if (!exceptionLabel && !hasAnyValue) {
    await prisma.result.deleteMany({ where: { elementId, teamId } })
    await prisma.computedScore.deleteMany({ where: { elementId, teamId } })
    await recomputeElementScores(elementId)
    return NextResponse.json({ deleted: true, teamId })
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

  // Taasaruta skoorid kohe pärast sisestust (jagatud loogika hulgi-ümberarvutusega)
  await recomputeElementScores(elementId)

  return NextResponse.json(result)
}
