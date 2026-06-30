import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; sectionId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: elementId, sectionId } = await params
  const body = await req.json()
  const { name, maxValue, calcMethod, fields } = body

  type FieldInput = { name: string; label: string; type: string; order?: number; isResultField?: boolean; rankingPriority?: number | null; formula?: string; meta?: string }

  await prisma.$transaction(async (tx) => {
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
                params: JSON.stringify(calcMethod.params ?? {}),
                customFormula: calcMethod.customFormula ?? null,
              },
              update: {
                type: calcMethod.type ?? "RELATIVE_RANKING",
                params: JSON.stringify(calcMethod.params ?? {}),
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
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; sectionId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { sectionId } = await params
  await prisma.elementSection.delete({ where: { id: sectionId } })
  return NextResponse.json({ ok: true })
}
