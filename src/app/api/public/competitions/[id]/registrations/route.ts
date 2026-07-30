import { Prisma } from "@prisma/client"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getCompetitionRegistrationStatus } from "@/lib/competitionPhases"
import { prisma } from "@/lib/prisma"
import { initialRegistrationStatus } from "@/lib/registrationApplications"

async function createApplication(
  competitionId: string,
  submittedById: string,
  teamName: string,
  classId: string
) {
  return prisma.$transaction(
    async (tx) => {
      const competition = await tx.competition.findUnique({
        where: { id: competitionId },
        select: {
          id: true,
          isPublic: true,
          status: true,
          registrationOverride: true,
          registrationOpensAt: true,
          registrationClosesAt: true,
          registrationFinalizedAt: true,
          registrationCapacity: true,
          registrationClasses: {
            where: { id: classId, isActive: true },
            select: { id: true },
          },
        },
      })
      if (
        !competition ||
        !competition.isPublic ||
        ["CANCELLED", "ARCHIVED", "FINISHED"].includes(competition.status)
      ) {
        throw new Error("Võistlus pole registreerimiseks saadaval")
      }
      if (getCompetitionRegistrationStatus(competition) !== "OPEN") {
        throw new Error("Registreerimine ei ole avatud")
      }
      if (competition.registrationClasses.length !== 1) {
        throw new Error("Valitud klass ei kuulu sellele võistlusele")
      }

      const confirmedCount = await tx.registrationApplication.count({
        where: { competitionId, status: "CONFIRMED" },
      })
      const status = initialRegistrationStatus(
        confirmedCount,
        competition.registrationCapacity
      )
      const now = new Date()
      return tx.registrationApplication.create({
        data: {
          competitionId,
          submittedById,
          teamName,
          classId,
          status,
          submittedAt: now,
          decidedAt: status === "CONFIRMED" ? now : null,
          events: {
            create: {
              toStatus: status,
              actorId: submittedById,
              note:
                status === "WAITLISTED"
                  ? "Kohtade üldarv on täitunud"
                  : "Automaatselt kinnitatud",
            },
          },
        },
        include: {
          class: { select: { id: true, name: true } },
        },
      })
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  )
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Registreerimiseks logi sisse" }, { status: 401 })
  }

  const { id } = await params
  const body = await req.json()
  const teamName = typeof body.teamName === "string" ? body.teamName.trim() : ""
  const classId = typeof body.classId === "string" ? body.classId : ""
  if (!teamName || teamName.length > 200) {
    return NextResponse.json(
      { error: "Võistkonna nimi on kohustuslik ja võib olla kuni 200 tähemärki" },
      { status: 400 }
    )
  }
  if (!classId) {
    return NextResponse.json({ error: "Vali klass" }, { status: 400 })
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const application = await createApplication(
        id,
        session.user.id,
        teamName,
        classId
      )
      return NextResponse.json(application)
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034" &&
        attempt < 2
      ) {
        continue
      }
      const message =
        error instanceof Error ? error.message : "Registreerimine ebaõnnestus"
      return NextResponse.json({ error: message }, { status: 409 })
    }
  }

  return NextResponse.json(
    { error: "Registreerimine ebaõnnestus, proovi uuesti" },
    { status: 409 }
  )
}
