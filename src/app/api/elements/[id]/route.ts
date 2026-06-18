import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params

  const element = await prisma.scoringElement.findUnique({
    where: { id },
    include: {
      fields: { where: { sectionId: null }, orderBy: { order: "asc" } },
      exceptions: { orderBy: { order: "asc" } },
      calcMethod: true,
      competition: { select: { scoringMode: true } },
      sections: {
        include: { fields: { orderBy: { order: "asc" } }, calcMethod: true },
        orderBy: { order: "asc" },
      },
    },
  })
  if (!element) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(element)
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params

  const body = await req.json()
  const { name, code, type, order, maxValue, config, fields, exceptions, calcMethod, isCancelled, directPointsEntry } = body

  try {
    await prisma.$transaction(async (tx) => {
      await tx.scoringElement.update({
        where: { id },
        data: {
          name, code, type, order,
          maxValue: maxValue ?? null,
          config: config ? JSON.stringify(config) : undefined,
          isCancelled: isCancelled !== undefined ? isCancelled : undefined,
          directPointsEntry: directPointsEntry !== undefined ? directPointsEntry : undefined,
        },
      })

      if (fields) {
        // Kustuta ainult top-level väljad (mitte sektsiooni väljad)
        await tx.fieldDefinition.deleteMany({ where: { elementId: id, sectionId: null } })
        await tx.fieldDefinition.createMany({
          data: fields.map((f: {name:string;label:string;type:string;order?:number;isResultField?:boolean;rankingPriority?:number|null;formula?:string;meta?:string;validation?:Record<string,unknown>}) => ({
            elementId: id,
            name: f.name,
            label: f.label,
            type: f.type,
            order: f.order ?? 0,
            isResultField: f.rankingPriority === 1 || (f.isResultField ?? false),
            rankingPriority: f.rankingPriority ?? null,
            formula: f.formula ?? null,
            meta: f.meta ?? null,
            validation: f.validation && Object.keys(f.validation).length ? JSON.stringify(f.validation) : null,
          })),
        })
      }

      if (exceptions) {
        await tx.elementException.deleteMany({ where: { elementId: id } })
        await tx.elementException.createMany({
          data: exceptions.map((e: {label:string;penalty:number;order?:number}, i: number) => ({
            elementId: id,
            label: e.label,
            penalty: e.penalty,
            order: e.order ?? i,
          })),
        })
      }

      if (calcMethod) {
        await tx.calcMethod.upsert({
          where: { elementId: id },
          create: {
            elementId: id,
            type: calcMethod.type,
            params: JSON.stringify(calcMethod.params ?? {}),
            customFormula: calcMethod.customFormula ?? null,
          },
          update: {
            type: calcMethod.type,
            params: JSON.stringify(calcMethod.params ?? {}),
            customFormula: calcMethod.customFormula ?? null,
          },
        })
      }
    })

    const updated = await prisma.scoringElement.findUnique({
      where: { id },
      include: { fields: { orderBy: { order: "asc" } }, exceptions: { orderBy: { order: "asc" } }, calcMethod: true },
    })
    return NextResponse.json(updated)
  } catch (e) {
    console.error("Element PATCH viga:", e)
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params

  await prisma.scoringElement.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
