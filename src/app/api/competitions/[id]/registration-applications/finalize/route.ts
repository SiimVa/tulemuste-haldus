import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { canAccessCompetition } from "@/lib/competitionAccess"
import { getCompetitionRegistrationStatus } from "@/lib/competitionPhases"
import { prisma } from "@/lib/prisma"
import {
  type MemberAnswer,
  parseFormAnswer,
} from "@/lib/registrationForm"

function nextTeamCode(existing: Set<string>, sequence: number): string {
  let number = sequence
  while (true) {
    const code = `REG-${String(number).padStart(3, "0")}`
    if (!existing.has(code)) {
      existing.add(code)
      return code
    }
    number += 1
  }
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const actor = session.user
  const { id: competitionId } = await params
  const allowed = await canAccessCompetition(competitionId, {
    id: actor.id,
    role: actor.role,
  })
  if (!allowed) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const competition = await tx.competition.findUnique({
        where: { id: competitionId },
        select: {
          registrationOverride: true,
          registrationOpensAt: true,
          registrationClosesAt: true,
          registrationFinalizedAt: true,
        },
      })
      if (!competition) throw new Error("Võistlust ei leitud")
      if (competition.registrationFinalizedAt) {
        throw new Error("Osalejate nimekiri on juba kinnitatud")
      }
      if (getCompetitionRegistrationStatus(competition) === "OPEN") {
        throw new Error("Sulge registreerimine enne nimekirja kinnitamist")
      }

      const unresolved = await tx.registrationApplication.count({
        where: {
          competitionId,
          status: { in: ["WAITLISTED", "PENDING_REVIEW", "DRAFT"] },
        },
      })
      if (unresolved > 0) {
        throw new Error(
          "Enne kinnitamist võta vastu või lükka tagasi kõik ootel avaldused"
        )
      }

      const applications = await tx.registrationApplication.findMany({
        where: { competitionId, status: "CONFIRMED" },
        include: {
          class: { select: { name: true } },
          fieldValues: {
            include: {
              field: { select: { id: true, type: true, isActive: true } },
            },
          },
        },
        orderBy: [{ submittedAt: "asc" }, { createdAt: "asc" }],
      })
      const existingTeams = await tx.team.findMany({
        where: { competitionId },
        select: { code: true },
      })
      const codes = new Set(existingTeams.map(({ code }) => code))
      let createdTeams = 0

      for (const application of applications) {
        if (application.teamId) continue
        const members = application.fieldValues.flatMap((fieldValue) => {
          if (
            !fieldValue.field.isActive ||
            fieldValue.field.type !== "MEMBER_LIST"
          ) {
            return []
          }
          const value = parseFormAnswer(fieldValue.value)
          if (!Array.isArray(value)) return []
          return value.filter(
            (member): member is MemberAnswer =>
              typeof member === "object" &&
              member !== null &&
              typeof member.name === "string" &&
              Boolean(member.name.trim())
          )
        })
        const team = await tx.team.create({
          data: {
            competitionId,
            name: application.teamName,
            class: application.class.name,
            code: nextTeamCode(codes, createdTeams + 1),
            registrationStatus: "APPROVED",
            formValues: {
              create: application.fieldValues.map((fieldValue) => ({
                fieldId: fieldValue.fieldId,
                value: fieldValue.value,
              })),
            },
            members: {
              create: members.map((member) => ({
                name: member.name.trim(),
                role: "COMPETITOR",
              })),
            },
          },
        })
        const representativeMembership = await tx.competitionMember.upsert({
          where: {
            competitionId_userId: {
              competitionId,
              userId: application.submittedById,
            },
          },
          create: {
            competitionId,
            userId: application.submittedById,
          },
          update: {},
        })
        await tx.competitionMemberRole.upsert({
          where: {
            memberId_role: {
              memberId: representativeMembership.id,
              role: "REPRESENTATIVE",
            },
          },
          create: {
            memberId: representativeMembership.id,
            role: "REPRESENTATIVE",
          },
          update: {},
        })
        await tx.teamRepresentative.create({
          data: {
            competitionId,
            teamId: team.id,
            memberId: representativeMembership.id,
          },
        })
        await tx.registrationApplication.update({
          where: { id: application.id },
          data: { teamId: team.id },
        })
        createdTeams += 1
      }

      const finalizedAt = new Date()
      await tx.competition.update({
        where: { id: competitionId },
        data: {
          registrationFinalizedAt: finalizedAt,
          registrationOverride: "CLOSED",
        },
      })
      await tx.competitionPhaseEvent.create({
        data: {
          competitionId,
          phase: "REGISTRATION",
          action: "FINALIZED",
          actorId: actor.id,
        },
      })

      return { finalizedAt, createdTeams }
    })

    return NextResponse.json(result)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Nimekirja kinnitamine ebaõnnestus"
    return NextResponse.json({ error: message }, { status: 409 })
  }
}
