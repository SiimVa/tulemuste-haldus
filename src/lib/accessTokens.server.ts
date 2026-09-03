import "server-only"

import type { Prisma } from "@prisma/client"
import { randomBytes } from "node:crypto"

export function generateAccessToken(): string {
  return randomBytes(32).toString("base64url")
}

export async function ensureCompetitionAccessTokens(
  tx: Prisma.TransactionClient,
  competitionId: string
): Promise<number> {
  const [elements, teams, existing] = await Promise.all([
    tx.scoringElement.findMany({
      where: { competitionId },
      select: { id: true, name: true, code: true },
    }),
    tx.team.findMany({
      where: { competitionId, registrationStatus: "APPROVED" },
      select: { id: true, name: true, code: true },
    }),
    tx.accessToken.findMany({
      where: { competitionId },
      select: { elementId: true, teamId: true, type: true },
    }),
  ])

  const judgeElements = new Set(
    existing
      .filter((token) => token.type === "JUDGE" && token.elementId)
      .map((token) => token.elementId as string)
  )
  const athleteTeams = new Set(
    existing
      .filter((token) => token.type === "ATHLETE" && token.teamId)
      .map((token) => token.teamId as string)
  )
  const toCreate: {
    token: string
    type: string
    name: string
    competitionId: string
    elementId?: string
    teamId?: string
  }[] = []

  for (const element of elements) {
    if (!judgeElements.has(element.id)) {
      toCreate.push({
        token: generateAccessToken(),
        type: "JUDGE",
        name: `[${element.code}] ${element.name}`,
        competitionId,
        elementId: element.id,
      })
    }
  }
  for (const team of teams) {
    if (!athleteTeams.has(team.id)) {
      toCreate.push({
        token: generateAccessToken(),
        type: "ATHLETE",
        name: `${team.code} · ${team.name}`,
        competitionId,
        teamId: team.id,
      })
    }
  }

  if (toCreate.length > 0) {
    await tx.accessToken.createMany({ data: toCreate })
  }
  return toCreate.length
}
