import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { parseValidation, validateFieldValue } from "@/lib/fieldValidation"
import { recomputeElementScores } from "@/lib/recompute"

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
