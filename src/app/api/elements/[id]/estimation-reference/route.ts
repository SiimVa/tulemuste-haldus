import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { canEnterElementResults } from "@/lib/competitionAccess"
import { recomputeElementScores } from "@/lib/recompute"
import { readEstimation, validateEstimation } from "@/lib/estimation"
import { readPointMeta } from "@/lib/pointFields"
import { withSecurityRoute } from "@/lib/securityRoute.server"
import { setSecurityActor, setSecurityTargets } from "@/lib/security.server"

async function handlePATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: elementId } = await params
  const element = await prisma.scoringElement.findUnique({ where: { id: elementId }, select: { competitionId: true } })
  if (!element) return NextResponse.json({ error: "Elementi ei leitud" }, { status: 404 })
  const session = await auth()
  const sessionAllowed = session?.user?.id && await canEnterElementResults(elementId, { id: session.user.id, role: session.user.role })
  if (sessionAllowed) {
    setSecurityActor(session!.user!.id!, null)
  } else {
    const tokenValue = req.headers.get("x-access-token")
    const token = tokenValue ? await prisma.accessToken.findUnique({ where: { token: tokenValue } }) : null
    if (!token || token.type !== "JUDGE") return NextResponse.json({ error: "Keelatud" }, { status: session?.user?.id ? 403 : 401 })
    if (token.competitionId !== element.competitionId || (token.elementId && token.elementId !== elementId)) return NextResponse.json({ error: "Keelatud – vale võistlus või element" }, { status: 403 })
    setSecurityActor(null, token.id)
    await prisma.accessToken.update({ where: { id: token.id }, data: { lastUsedAt: new Date() } })
  }
  setSecurityTargets({ competitionId: element.competitionId, elementId })
  const body = await req.json().catch(() => null)
  if (!body || typeof body.fieldId !== "string" || !body.correct || typeof body.correct !== "object" || Array.isArray(body.correct)) return NextResponse.json({ error: "Vigased õiged kaugused" }, { status: 400 })
  const field = await prisma.fieldDefinition.findFirst({ where: { id: body.fieldId, elementId, type: "ESTIMATION" } })
  if (!field) return NextResponse.json({ error: "Kauguste hindamise välja ei leitud" }, { status: 404 })
  // Only reference distances can be changed by a judge, not scoring rules or targets.
  const config = readEstimation(field.meta)
  if (Object.keys(body.correct).length !== config.targets.length || config.targets.some(t => typeof body.correct[t.id] !== "number" || !Number.isFinite(body.correct[t.id]) || body.correct[t.id] <= 0)) return NextResponse.json({ error: "Sisesta kõik õiged kaugused" }, { status: 400 })
  const updated = { ...config, targets: config.targets.map(t => ({ ...t, correct: body.correct[t.id] })) }
  const error = validateEstimation(updated)
  if (error) return NextResponse.json({ error }, { status: 422 })
  const saved = await prisma.fieldDefinition.updateMany({ where: { id: field.id, meta: field.meta }, data: { meta: JSON.stringify({ ...readPointMeta(field.meta), estimation: updated }) } })
  if (!saved.count) return NextResponse.json({ error: "Seaded muutusid. Värskenda lehte ja proovi uuesti." }, { status: 409 })
  await recomputeElementScores(elementId)
  return NextResponse.json({ ok: true })
}
export const PATCH = withSecurityRoute("/api/elements/[id]/estimation-reference", handlePATCH)
