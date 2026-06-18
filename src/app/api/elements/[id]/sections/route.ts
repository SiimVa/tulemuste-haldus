import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: elementId } = await params
  const sections = await prisma.elementSection.findMany({
    where: { elementId },
    include: { fields: { orderBy: { order: "asc" } }, calcMethod: true },
    orderBy: { order: "asc" },
  })
  return NextResponse.json(sections)
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: elementId } = await params
  const body = await req.json()
  const { name, maxValue, fields, calcMethod, order } = body

  const count = await prisma.elementSection.count({ where: { elementId } })

  const section = await prisma.elementSection.create({
    data: {
      elementId,
      name,
      maxValue: maxValue != null && maxValue !== "" ? Number(maxValue) : null,
      order: order ?? count,
      fields: fields?.length > 0
        ? {
            create: fields.map((f: {
              name: string; label: string; type: string; order?: number
              isResultField?: boolean; rankingPriority?: number | null
              formula?: string; meta?: string; validation?: Record<string, unknown>
            }, i: number) => ({
              elementId,
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
      calcMethod: calcMethod
        ? {
            create: {
              type: calcMethod.type ?? "RELATIVE_RANKING",
              params: JSON.stringify(calcMethod.params ?? {}),
              customFormula: calcMethod.customFormula ?? null,
            },
          }
        : undefined,
    },
    include: { fields: { orderBy: { order: "asc" } }, calcMethod: true },
  })

  return NextResponse.json(section)
}
