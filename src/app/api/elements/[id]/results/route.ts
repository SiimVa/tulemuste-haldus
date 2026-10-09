import { withSecurityRoute } from "@/lib/securityRoute.server"
import { setSecurityActor, setSecurityTargets } from "@/lib/security.server"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { parseValidation, validateClockValue, validateFieldValue } from "@/lib/fieldValidation"
import { withElementScoreTransaction } from "@/lib/recompute"
import { resultKeepsValues } from "@/lib/exceptionKinds"
import {
  canEnterElementResults,
  teamBelongsToCompetition,
} from "@/lib/competitionAccess"

class ResultVersionConflict extends Error {}

function sameValues(left: string, right: string): boolean {
  const canonical = (value: string) => JSON.stringify(Object.entries(JSON.parse(value)).sort(([a], [b]) => a.localeCompare(b)))
  try { return canonical(left) === canonical(right) } catch { return false }
}

// GET – kõik tulemused selle elemendi jaoks
async function handleGET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
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
async function handlePOST(req: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const sessionMayEnter = session?.user?.id
    ? await canEnterElementResults(elementId, {
        id: session.user.id,
        role: session.user.role,
      })
    : false

  if (session?.user?.id && sessionMayEnter) {
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
  } else if (session?.user?.id) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  } else {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  setSecurityActor(enteredByUserId, enteredByTokenId)
  const body = await req.json().catch(() => ({}))
  const { teamId, values, exceptionLabel, expectedUpdatedAt } = body
  const checksVersion = Object.prototype.hasOwnProperty.call(body, "expectedUpdatedAt")
  if (checksVersion && expectedUpdatedAt !== null && (
    typeof expectedUpdatedAt !== "string" || !Number.isFinite(Date.parse(expectedUpdatedAt))
  )) {
    return NextResponse.json({ error: "Vigane tulemuse versioon" }, { status: 400 })
  }
  if (typeof teamId !== "string" || !teamId) {
    return NextResponse.json({ error: "Võistkonna ID puudub" }, { status: 400 })
  }
  if (!await teamBelongsToCompetition(teamId, targetElement.competitionId)) {
    return NextResponse.json({ error: "Võistkond ei kuulu sellele võistlusele" }, { status: 400 })
  }
  setSecurityTargets({ competitionId: targetElement.competitionId, elementId, teamId })
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

  const element = await prisma.scoringElement.findUnique({
    where: { id: elementId },
    include: { fields: true, sections: { include: { fields: true } }, exceptions: true },
  })

  // Leia erandi karistus
  let exceptionPenalty: number | null = null
  if (exceptionLabel) {
    const exc = element?.exceptions.find((item) => item.label === exceptionLabel)
    if (!exc) return NextResponse.json({ error: "Tundmatu erand" }, { status: 422 })
    exceptionPenalty = exc.penalty
  }
  // Ebaõnnestunud tulemusel on sooritus olemas: väljad valideeritakse ja
  // salvestatakse. Teiste erandite korral väärtusi ei hoita.
  const keepsValues = resultKeepsValues({ exceptionLabel }, element?.exceptions ?? [])
  const storedValues = keepsValues ? (values ?? {}) : {}

  // Kui erandit pole ja kõik lahtrid on tühjad → loe "sisestamata": kustuta kirje
  // ja skoor. Enne valideerimist, et kohustuslik väli kustutamist ei takistaks.
  const hasAnyValue = values && Object.values(values).some((v) => String(v ?? "").trim() !== "")
  if (!exceptionLabel && !hasAnyValue) {
    try {
      await withElementScoreTransaction(elementId, async (tx) => {
        const current = await tx.result.findUnique({ where: { elementId_teamId: { elementId, teamId } } })
        // A repeated deletion is already complete. A stale deletion must not
        // remove a newer result entered while the client was disconnected.
        if (current && checksVersion && (expectedUpdatedAt === null || current.updatedAt.getTime() !== Date.parse(expectedUpdatedAt))) {
          throw new ResultVersionConflict()
        }
        await tx.result.deleteMany({ where: { elementId, teamId } })
      })
    } catch (error) {
      if (error instanceof ResultVersionConflict) return NextResponse.json({ error: "Tulemus on vahepeal muutunud. Värskenda lehte ja kontrolli tulemust enne uuesti salvestamist." }, { status: 409 })
      throw error
    }
    return NextResponse.json({ deleted: true, teamId })
  }

  // Valideeri sisendväljad. Ebaõnnestunul võib mõni väärtus puududa, seega
  // kohustuslikke välju ei nõuta.
  if (keepsValues && values) {
    const failed = Boolean(exceptionLabel)
    const allFields = [
      ...(element?.fields ?? []),
      ...(element?.sections.flatMap(s => s.fields) ?? []),
    ]
    for (const field of allFields) {
      if (field.type === "COMPUTED") continue
      const parsedValidation = parseValidation(field.validation)
      const validation = failed ? { ...parsedValidation, required: false } : parsedValidation
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
      const err = validateFieldValue(values[field.name], field.name, field.label, field.type, validation, field.meta)
      if (err) return NextResponse.json({ error: err.message }, { status: 422 })
    }
  }

  try {
    const result = await withElementScoreTransaction(elementId, async (tx) => {
      const current = await tx.result.findUnique({
        where: { elementId_teamId: { elementId, teamId } },
        include: { team: true },
      })
      const serializedValues = JSON.stringify(storedValues)
      // The first attempt may have committed even if its HTTP response was
      // lost. Return that record without changing timestamps or provenance.
      if (checksVersion && current &&
        sameValues(current.values, serializedValues) &&
        current.exceptionLabel === (exceptionLabel ?? null) &&
        current.exceptionPenalty === exceptionPenalty &&
        current.enteredByUserId === enteredByUserId &&
        current.enteredByTokenId === enteredByTokenId
      ) return current
      if (checksVersion && (expectedUpdatedAt === null
        ? current !== null
        : current?.updatedAt.getTime() !== Date.parse(expectedUpdatedAt))) {
        throw new ResultVersionConflict()
      }
      const data = {
        values: serializedValues,
        exceptionLabel: exceptionLabel ?? null,
        exceptionPenalty,
        enteredByUserId,
        enteredByTokenId,
      }
      return tx.result.upsert({
        where: { elementId_teamId: { elementId, teamId } },
        create: { elementId, teamId, ...data },
        update: data,
        include: { team: true },
      })
    })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof ResultVersionConflict) return NextResponse.json({ error: "Tulemus on vahepeal muutunud. Värskenda lehte ja kontrolli tulemust enne uuesti salvestamist." }, { status: 409 })
    throw error
  }
}

export const GET = withSecurityRoute("/api/elements/[id]/results", handleGET)
export const POST = withSecurityRoute("/api/elements/[id]/results", handlePOST)
