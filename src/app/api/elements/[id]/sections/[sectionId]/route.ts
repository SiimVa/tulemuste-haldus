import { FailureRuleError, validateFailureRule } from "@/lib/failureRules"
import { withElementScoreTransaction } from "@/lib/recompute"
import { validatePointFields, type PointField } from "@/lib/pointFields"
import { withSecurityRoute } from "@/lib/securityRoute.server"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { canAccessSection } from "@/lib/competitionAccess"
import { fixedRankingParamsForStorage, parseFixedRankingParams } from "@/lib/fixedRanking"

async function handlePATCH(req: Request, { params }: { params: Promise<{ id: string; sectionId: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id: elementId, sectionId } = await params
    if (!await canAccessSection(sectionId, elementId, { id: session.user.id, role: session.user.role })) {
      return NextResponse.json({ error: "Keelatud" }, { status: 403 })
    }
    const body = await req.json()
    const pointError = validatePointFields([...(Array.isArray(body.fields) ? body.fields : []), ...(Array.isArray(body.sections) ? body.sections.flatMap((section: { fields?: PointField[] }) => section.fields ?? []) : [])])
    if (pointError) return NextResponse.json({ error: pointError }, { status: 400 })
    const { name, maxValue, calcMethod, fields } = body
    const storedCalcParams = calcMethod?.type === "FIXED_RANKING"
      ? fixedRankingParamsForStorage(parseFixedRankingParams(calcMethod.params))
      : (calcMethod?.params ?? {})

    type FieldInput = { name: string; label: string; type: string; order?: number; isResultField?: boolean; rankingPriority?: number | null; formula?: string; meta?: string }

    await withElementScoreTransaction(elementId, async (tx) => {
      await tx.elementSection.update({
        where: { id: sectionId },
        data: {
          ...(name !== undefined && { name }),
          ...(maxValue !== undefined && { maxValue: maxValue != null && maxValue !== "" ? Number(maxValue) : null }),
          ...(calcMethod && {
            calcMethod: {
              upsert: {
                create: {
                  type: calcMethod.type ?? "RELATIVE_RANKING",
                  params: JSON.stringify(storedCalcParams),
                  customFormula: calcMethod.customFormula ?? null,
                },
                update: {
                  type: calcMethod.type ?? "RELATIVE_RANKING",
                  params: JSON.stringify(storedCalcParams),
                  customFormula: calcMethod.customFormula ?? null,
                },
              },
            },
          }),
        },
      })

      if (Array.isArray(fields)) {
        await tx.fieldDefinition.deleteMany({ where: { sectionId } })
        if (fields.length > 0) {
          await tx.fieldDefinition.createMany({
            data: fields.map((f: FieldInput & { validation?: Record<string, unknown> }, i: number) => ({
              elementId,
              sectionId,
              name: f.name,
              label: f.label,
              type: f.type,
              order: f.order ?? i,
              isResultField: f.rankingPriority === 1 || (f.isResultField ?? false),
              rankingPriority: f.rankingPriority ?? null,
              formula: f.formula ?? null,
              meta: f.meta ?? null,
              validation: f.validation && Object.keys(f.validation).length ? JSON.stringify(f.validation) : null,
            })),
          })
        }
      }
    })

    const section = await prisma.elementSection.findUnique({
      where: { id: sectionId },
      include: { fields: { orderBy: { order: "asc" } }, calcMethod: true },
    })

    return NextResponse.json(section)
  } catch (error) {
    if (error instanceof FailureRuleError) return NextResponse.json({ error: error.message }, { status: 422 })
    throw error
  }
}

async function handleDELETE(_req: Request, { params }: { params: Promise<{ id: string; sectionId: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id: elementId, sectionId } = await params
    if (!await canAccessSection(sectionId, elementId, { id: session.user.id, role: session.user.role })) {
      return NextResponse.json({ error: "Keelatud" }, { status: 403 })
    }
    await withElementScoreTransaction(elementId, async (tx) => {
      const element = await tx.scoringElement.findUniqueOrThrow({ where: { id: elementId }, include: { fields: true } })
      const failureError = validateFailureRule(element.config, element.fields.filter(field => field.sectionId !== sectionId))
      if (failureError) throw new FailureRuleError(failureError)
      return tx.elementSection.delete({ where: { id: sectionId } })
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof FailureRuleError) return NextResponse.json({ error: error.message }, { status: 422 })
    throw error
  }
}

export const PATCH = withSecurityRoute("/api/elements/[id]/sections/[sectionId]", handlePATCH)
export const DELETE = withSecurityRoute("/api/elements/[id]/sections/[sectionId]", handleDELETE)
