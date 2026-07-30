import { Prisma } from "@prisma/client"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { canAccessCompetition } from "@/lib/competitionAccess"
import { prisma } from "@/lib/prisma"

const ACTION_STATUS = {
  CONFIRM: "CONFIRMED",
  WAITLIST: "WAITLISTED",
  REJECT: "REJECTED",
} as const

export async function PATCH(
  req: Request,
  {
    params,
  }: { params: Promise<{ id: string; applicationId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const actor = session.user

  const { id: competitionId, applicationId } = await params
  const allowed = await canAccessCompetition(competitionId, {
    id: actor.id,
    role: actor.role,
  })
  if (!allowed) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  }

  const body = await req.json()
  let action: keyof typeof ACTION_STATUS
  if (body.action === "CONFIRM") {
    action = "CONFIRM"
  } else if (body.action === "WAITLIST") {
    action = "WAITLIST"
  } else if (body.action === "REJECT") {
    action = "REJECT"
  } else {
    return NextResponse.json({ error: "Vigane otsus" }, { status: 400 })
  }
  const note = typeof body.note === "string" ? body.note.trim() : ""
  if (note.length > 2000) {
    return NextResponse.json({ error: "Märkus on liiga pikk" }, { status: 400 })
  }

  try {
    const updated = await prisma.$transaction(
      async (tx) => {
        const application = await tx.registrationApplication.findFirst({
          where: { id: applicationId, competitionId },
          include: {
            competition: { select: { registrationFinalizedAt: true } },
          },
        })
        if (!application) throw new Error("Registreerimisavaldust ei leitud")
        if (application.competition.registrationFinalizedAt) {
          throw new Error("Kinnitatud osalejate nimekirja ei saa muuta")
        }
        if (["WITHDRAWN", "REJECTED"].includes(application.status)) {
          throw new Error("Seda registreerimisavaldust ei saa enam muuta")
        }

        const nextStatus = ACTION_STATUS[action]
        if (application.status === nextStatus) return application

        const now = new Date()
        const result = await tx.registrationApplication.update({
          where: { id: application.id },
          data: {
            status: nextStatus,
            decidedAt:
              nextStatus === "CONFIRMED" || nextStatus === "REJECTED"
                ? now
                : null,
            events: {
              create: {
                fromStatus: application.status,
                toStatus: nextStatus,
                actorId: actor.id,
                note: note || null,
              },
            },
          },
          include: {
            class: { select: { id: true, name: true } },
            submittedBy: { select: { id: true, name: true, email: true } },
            team: { select: { id: true, code: true } },
          },
        })

        if (
          application.status === "CONFIRMED" &&
          nextStatus !== "CONFIRMED"
        ) {
          const next = await tx.registrationApplication.findFirst({
            where: {
              competitionId,
              status: "WAITLISTED",
              id: { not: application.id },
            },
            orderBy: [{ submittedAt: "asc" }, { createdAt: "asc" }],
          })
          if (next) {
            await tx.registrationApplication.update({
              where: { id: next.id },
              data: {
                status: "CONFIRMED",
                decidedAt: now,
                events: {
                  create: {
                    fromStatus: "WAITLISTED",
                    toStatus: "CONFIRMED",
                    actorId: actor.id,
                    note: "Edutatud pärast koha vabanemist",
                  },
                },
              },
            })
          }
        }

        return result
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    )
    return NextResponse.json(updated)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Otsuse salvestamine ebaõnnestus"
    return NextResponse.json({ error: message }, { status: 409 })
  }
}
