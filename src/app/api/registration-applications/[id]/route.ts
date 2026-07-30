import { Prisma } from "@prisma/client"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getCompetitionRegistrationStatus } from "@/lib/competitionPhases"
import { prisma } from "@/lib/prisma"
import { canWithdrawRegistration } from "@/lib/registrationApplications"

async function withdrawApplication(applicationId: string, userId: string) {
  return prisma.$transaction(
    async (tx) => {
      const application = await tx.registrationApplication.findUnique({
        where: { id: applicationId },
        include: {
          competition: {
            select: {
              registrationOverride: true,
              registrationOpensAt: true,
              registrationClosesAt: true,
              registrationFinalizedAt: true,
            },
          },
        },
      })
      if (!application || application.submittedById !== userId) {
        throw new Error("Registreerimisavaldust ei leitud")
      }
      if (getCompetitionRegistrationStatus(application.competition) !== "OPEN") {
        throw new Error("Pärast registreerimise sulgemist võta ühendust korraldajaga")
      }
      if (!canWithdrawRegistration(application.status)) {
        throw new Error("Sellest registreerimisavaldusest ei saa loobuda")
      }

      const now = new Date()
      const updated = await tx.registrationApplication.update({
        where: { id: application.id },
        data: {
          status: "WITHDRAWN",
          withdrawnAt: now,
          events: {
            create: {
              fromStatus: application.status,
              toStatus: "WITHDRAWN",
              actorId: userId,
            },
          },
        },
      })

      let promotedId: string | null = null
      if (application.status === "CONFIRMED") {
        const next = await tx.registrationApplication.findFirst({
          where: {
            competitionId: application.competitionId,
            status: "WAITLISTED",
          },
          orderBy: [{ submittedAt: "asc" }, { createdAt: "asc" }],
        })
        if (next) {
          promotedId = next.id
          await tx.registrationApplication.update({
            where: { id: next.id },
            data: {
              status: "CONFIRMED",
              decidedAt: now,
              events: {
                create: {
                  fromStatus: "WAITLISTED",
                  toStatus: "CONFIRMED",
                  note: "Edutatud pärast kinnitatud võistkonna loobumist",
                },
              },
            },
          })
        }
      }

      return { application: updated, promotedId }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  )
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { id } = await params

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return NextResponse.json(await withdrawApplication(id, session.user.id))
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034" &&
        attempt < 2
      ) {
        continue
      }
      const message =
        error instanceof Error ? error.message : "Loobumine ebaõnnestus"
      return NextResponse.json({ error: message }, { status: 409 })
    }
  }

  return NextResponse.json({ error: "Loobumine ebaõnnestus" }, { status: 409 })
}
