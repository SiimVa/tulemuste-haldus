import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { canAccessCompetition } from "@/lib/competitionAccess"
import {
  getCompetitionMandateStatus,
  getCompetitionRegistrationStatus,
  isPhaseOverride,
  validatePhaseWindow,
} from "@/lib/competitionPhases"
import { prisma } from "@/lib/prisma"

function optionalDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null
  if (typeof value !== "string") throw new Error("Vigane kuupäev")
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) throw new Error("Vigane kuupäev")
  return date
}

function responseData<
  T extends {
    registrationOverride: string
    registrationOpensAt: Date | null
    registrationClosesAt: Date | null
    registrationFinalizedAt: Date | null
    mandateOverride: string
    mandateOpensAt: Date | null
    mandateClosesAt: Date | null
    mandateFinalizedAt: Date | null
  },
>(competition: T) {
  return {
    ...competition,
    registrationStatus: getCompetitionRegistrationStatus(competition),
    mandateStatus: getCompetitionMandateStatus(competition),
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const actor = session.user

  const { id } = await params
  const allowed = await canAccessCompetition(id, {
    id: actor.id,
    role: actor.role,
  })
  if (!allowed) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  }

  const competition = await prisma.competition.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      isPublic: true,
      registrationOpensAt: true,
      registrationClosesAt: true,
      registrationOverride: true,
      registrationFinalizedAt: true,
      registrationCapacity: true,
      mandateOpensAt: true,
      mandateClosesAt: true,
      mandateOverride: true,
      mandateFinalizedAt: true,
      registrationClasses: {
        where: { isActive: true },
        orderBy: [{ order: "asc" }, { name: "asc" }],
        select: { id: true, name: true, order: true },
      },
      _count: {
        select: { registrationApplications: true },
      },
    },
  })
  if (!competition) {
    return NextResponse.json({ error: "Võistlust ei leitud" }, { status: 404 })
  }

  return NextResponse.json(responseData(competition))
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const actor = session.user

  const { id } = await params
  const allowed = await canAccessCompetition(id, {
    id: actor.id,
    role: actor.role,
  })
  if (!allowed) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  }

  try {
    const body = await req.json()
    if (
      !isPhaseOverride(body.registrationOverride) ||
      !isPhaseOverride(body.mandateOverride)
    ) {
      return NextResponse.json(
        { error: "Vigane käsitsi juhtimise valik" },
        { status: 400 }
      )
    }

    const registrationOpensAt = optionalDate(body.registrationOpensAt)
    const registrationClosesAt = optionalDate(body.registrationClosesAt)
    const mandateOpensAt = optionalDate(body.mandateOpensAt)
    const mandateClosesAt = optionalDate(body.mandateClosesAt)

    if (!validatePhaseWindow(registrationOpensAt, registrationClosesAt)) {
      return NextResponse.json(
        { error: "Registreerimise algus peab olema lõpust varasem" },
        { status: 400 }
      )
    }
    if (!validatePhaseWindow(mandateOpensAt, mandateClosesAt)) {
      return NextResponse.json(
        { error: "Mandaadi algus peab olema lõpust varasem" },
        { status: 400 }
      )
    }

    let registrationCapacity: number | null = null
    if (
      body.registrationCapacity !== null &&
      body.registrationCapacity !== undefined &&
      body.registrationCapacity !== ""
    ) {
      registrationCapacity = Number(body.registrationCapacity)
      if (
        !Number.isInteger(registrationCapacity) ||
        registrationCapacity < 1
      ) {
        return NextResponse.json(
          { error: "Kohtade arv peab olema positiivne täisarv" },
          { status: 400 }
        )
      }
    }

    if (!Array.isArray(body.classes)) {
      return NextResponse.json(
        { error: "Klasside nimekiri puudub" },
        { status: 400 }
      )
    }
    const classes: { id?: string; name: string; order: number }[] = body.classes.map(
      (item: unknown, order: number): { id?: string; name: string; order: number } => {
        if (!item || typeof item !== "object") {
          throw new Error("Vigane klass")
        }
        const raw = item as { id?: unknown; name?: unknown }
        const name = typeof raw.name === "string" ? raw.name.trim() : ""
        if (!name || name.length > 100) throw new Error("Vigane klassi nimi")
        return {
          id: typeof raw.id === "string" ? raw.id : undefined,
          name,
          order,
        }
      }
    )
    const normalizedNames = classes.map(({ name }) => name.toLocaleLowerCase("et"))
    if (new Set(normalizedNames).size !== normalizedNames.length) {
      return NextResponse.json(
        { error: "Klasside nimed peavad olema erinevad" },
        { status: 400 }
      )
    }
    if (classes.length > 100) {
      return NextResponse.json(
        { error: "Ühel võistlusel saab olla kuni 100 klassi" },
        { status: 400 }
      )
    }

    const updated = await prisma.$transaction(async (tx) => {
      const current = await tx.competition.findUnique({
        where: { id },
        include: { registrationClasses: true },
      })
      if (!current) throw new Error("Võistlust ei leitud")

      const currentById = new Map(
        current.registrationClasses.map((item) => [item.id, item])
      )
      const currentByName = new Map(
        current.registrationClasses.map((item) => [
          item.name.toLocaleLowerCase("et"),
          item,
        ])
      )
      const retainedIds: string[] = []

      for (const item of classes) {
        const existing =
          (item.id ? currentById.get(item.id) : undefined) ??
          currentByName.get(item.name.toLocaleLowerCase("et"))
        if (existing) {
          const saved = await tx.competitionClass.update({
            where: { id: existing.id },
            data: { name: item.name, order: item.order, isActive: true },
          })
          retainedIds.push(saved.id)
        } else {
          const saved = await tx.competitionClass.create({
            data: {
              competitionId: id,
              name: item.name,
              order: item.order,
            },
          })
          retainedIds.push(saved.id)
        }
      }

      await tx.competitionClass.updateMany({
        where: {
          competitionId: id,
          ...(retainedIds.length > 0 ? { id: { notIn: retainedIds } } : {}),
        },
        data: { isActive: false },
      })

      const competition = await tx.competition.update({
        where: { id },
        data: {
          isPublic: Boolean(body.isPublic),
          registrationOpensAt,
          registrationClosesAt,
          registrationOverride: body.registrationOverride,
          registrationCapacity,
          mandateOpensAt,
          mandateClosesAt,
          mandateOverride: body.mandateOverride,
        },
        include: {
          registrationClasses: {
            where: { isActive: true },
            orderBy: [{ order: "asc" }, { name: "asc" }],
            select: { id: true, name: true, order: true },
          },
          _count: { select: { registrationApplications: true } },
        },
      })

      const events: { phase: string; action: string }[] = []
      if (current.registrationOverride !== body.registrationOverride) {
        events.push({
          phase: "REGISTRATION",
          action: `OVERRIDE_${body.registrationOverride}`,
        })
      }
      if (current.mandateOverride !== body.mandateOverride) {
        events.push({
          phase: "MANDATE",
          action: `OVERRIDE_${body.mandateOverride}`,
        })
      }
      if (events.length > 0) {
        await tx.competitionPhaseEvent.createMany({
          data: events.map((event) => ({
            competitionId: id,
            actorId: actor.id,
            ...event,
          })),
        })
      }

      return competition
    })

    return NextResponse.json(responseData(updated))
  } catch (error) {
    const message = error instanceof Error ? error.message : "Salvestamine ebaõnnestus"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
