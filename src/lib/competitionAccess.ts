import { prisma } from "@/lib/prisma"

export type AccessActor = {
  id: string
  role?: string | null
}

export async function canAccessCompetition(
  competitionId: string,
  actor: AccessActor
): Promise<boolean> {
  if (actor.role === "ADMIN") {
    return Boolean(await prisma.competition.findUnique({
      where: { id: competitionId },
      select: { id: true },
    }))
  }

  const competition = await prisma.competition.findFirst({
    where: {
      id: competitionId,
      OR: [
        { organizerId: actor.id },
        { members: { some: { userId: actor.id } } },
      ],
    },
    select: { id: true },
  })
  return Boolean(competition)
}

export async function elementBelongsToCompetition(
  elementId: string,
  competitionId: string
): Promise<boolean> {
  return Boolean(await prisma.scoringElement.findFirst({
    where: { id: elementId, competitionId },
    select: { id: true },
  }))
}

export async function teamBelongsToCompetition(
  teamId: string,
  competitionId: string
): Promise<boolean> {
  return Boolean(await prisma.team.findFirst({
    where: { id: teamId, competitionId },
    select: { id: true },
  }))
}

export async function canAccessElement(
  elementId: string,
  actor: AccessActor
): Promise<boolean> {
  const element = await prisma.scoringElement.findUnique({
    where: { id: elementId },
    select: { competitionId: true },
  })
  return Boolean(element && await canAccessCompetition(element.competitionId, actor))
}

export async function canAccessSection(
  sectionId: string,
  elementId: string,
  actor: AccessActor
): Promise<boolean> {
  const section = await prisma.elementSection.findFirst({
    where: { id: sectionId, elementId },
    select: { element: { select: { competitionId: true } } },
  })
  return Boolean(section && await canAccessCompetition(section.element.competitionId, actor))
}

export async function canAccessToken(
  tokenId: string,
  actor: AccessActor
): Promise<boolean> {
  const token = await prisma.accessToken.findUnique({
    where: { id: tokenId },
    select: { competitionId: true },
  })
  return Boolean(token && await canAccessCompetition(token.competitionId, actor))
}

export async function canAccessMiscEntry(
  entryId: string,
  actor: AccessActor
): Promise<boolean> {
  const entry = await prisma.miscEntry.findUnique({
    where: { id: entryId },
    select: { element: { select: { competitionId: true } } },
  })
  return Boolean(entry && await canAccessCompetition(entry.element.competitionId, actor))
}
