import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id: competitionId } = await params

  const body = await req.json()
  const { name, code, type, order, maxValue, config, fields, exceptions, calcMethod, sections } = body

  type FieldInput = { name: string; label: string; type: string; order?: number; isResultField?: boolean; rankingPriority?: number | null; formula?: string; meta?: string; validation?: Record<string, unknown> }
  type SectionInput = { name: string; maxValue?: number | null; fields?: FieldInput[]; calcMethod?: { type: string; params?: Record<string, unknown>; customFormula?: string } }

  const hasSections = Array.isArray(sections) && sections.length > 0

  try {
    // Step 1: Create element without sections (so we have the element.id for FieldDefinition.elementId)
    const element = await prisma.scoringElement.create({
      data: {
        competitionId,
        name,
        code,
        type: type ?? "CHECKPOINT",
        order: order ?? 0,
        maxValue: hasSections ? null : (maxValue ?? null),
        config: config ? JSON.stringify(config) : "{}",
        fields: (!hasSections && Array.isArray(fields) && fields.length > 0)
          ? {
              create: fields.map((f: FieldInput, i: number) => ({
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
            }
          : undefined,
        exceptions: Array.isArray(exceptions) && exceptions.length > 0
          ? {
              create: exceptions.map((e: { label: string; penalty: number; order?: number }, i: number) => ({
                label: e.label,
                penalty: e.penalty,
                order: e.order ?? i,
              })),
            }
          : undefined,
        calcMethod: (!hasSections && calcMethod)
          ? {
              create: {
                type: calcMethod.type ?? "RELATIVE_RANKING",
                params: JSON.stringify(calcMethod.params ?? {}),
                customFormula: calcMethod.customFormula ?? null,
              },
            }
          : undefined,
      },
    })

    // Step 2: If sections provided, create them with fields (now we know element.id)
    if (hasSections) {
      for (let si = 0; si < (sections as SectionInput[]).length; si++) {
        const s = (sections as SectionInput[])[si]
        const sec = await prisma.elementSection.create({
          data: {
            elementId: element.id,
            name: s.name,
            maxValue: s.maxValue ?? null,
            order: si,
            fields: s.fields?.length
              ? {
                  create: s.fields.map((f: FieldInput, fi: number) => ({
                    elementId: element.id,
                    name: f.name,
                    label: f.label,
                    type: f.type,
                    order: fi,
                    isResultField: f.rankingPriority === 1 || (f.isResultField ?? false),
                    rankingPriority: f.rankingPriority ?? null,
                    formula: f.formula ?? null,
                    meta: f.meta ?? null,
                  })),
                }
              : undefined,
            calcMethod: s.calcMethod
              ? {
                  create: {
                    type: s.calcMethod.type ?? "RELATIVE_RANKING",
                    params: JSON.stringify(s.calcMethod.params ?? {}),
                    customFormula: s.calcMethod.customFormula ?? null,
                  },
                }
              : undefined,
          },
        })
        void sec
      }
    }

    // Return full element with sections
    const full = await prisma.scoringElement.findUnique({
      where: { id: element.id },
      include: {
        fields: true,
        exceptions: true,
        calcMethod: true,
        sections: { include: { fields: true, calcMethod: true } },
      },
    })
    return NextResponse.json(full)
  } catch (e) {
    console.error("Element POST viga:", e)
    return NextResponse.json({ error: "Salvestamine ebaõnnestus" }, { status: 500 })
  }
}
