import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import {
  canManageCompetition as canManageCompetitionWithContext,
  canManageCompetitionMembers as canManageMembersWithContext,
  canManageTeamRegistration as canManageTeamWithContext,
  canEnterCompetitionResults as canEnterResultsWithContext,
  canViewCompetition as canViewCompetitionWithContext,
  type CompetitionAccessContext,
  type CompetitionRoleName,
} from "@/lib/permissions"

export type AccessActor = {
  id: string
  role?: string | null
}

export function managedCompetitionsWhere(
  actor: AccessActor
): Prisma.CompetitionWhereInput {
  if (actor.role === "ADMIN") return {}

  return {
    OR: [
      { organizerId: actor.id },
      {
        members: {
          some: {
            userId: actor.id,
            roles: { some: { role: { in: ["OWNER", "ORGANIZER"] } } },
          },
        },
      },
    ],
  }
}

async function getCompetitionAccess(
  competitionId: string,
  actor: AccessActor
): Promise<CompetitionAccessContext | null> {
  const competition = await prisma.competition.findFirst({
    where: { id: competitionId },
    select: {
      organizerId: true,
      members: {
        where: { userId: actor.id },
        select: {
          roles: { select: { role: true } },
          representedTeams: { select: { teamId: true } },
        },
      },
    },
  })
  if (!competition) return null

  const membership = competition.members[0]
  return {
    systemRole: actor.role,
    isOwner: competition.organizerId === actor.id,
    roles:
      membership?.roles.map(({ role }) => role as CompetitionRoleName) ?? [],
    representedTeamIds:
      membership?.representedTeams.map(({ teamId }) => teamId) ?? [],
  }
}

// Existing management routes keep using this name. Representative, judge,
// competitor and viewer memberships do not grant full administration access.
export async function canAccessCompetition(
  competitionId: string,
  actor: AccessActor
): Promise<boolean> {
  const access = await getCompetitionAccess(competitionId, actor)
  return Boolean(access && canManageCompetitionWithContext(access))
}

export async function canViewCompetition(
  competitionId: string,
  actor: AccessActor
): Promise<boolean> {
  const access = await getCompetitionAccess(competitionId, actor)
  return Boolean(access && canViewCompetitionWithContext(access))
}

export async function canManageCompetitionMembers(
  competitionId: string,
  actor: AccessActor
): Promise<boolean> {
  const access = await getCompetitionAccess(competitionId, actor)
  return Boolean(access && canManageMembersWithContext(access))
}

export async function canManageTeamRegistration(
  competitionId: string,
  teamId: string,
  actor: AccessActor
): Promise<boolean> {
  const teamExists = await teamBelongsToCompetition(teamId, competitionId)
  if (!teamExists) return false

  const access = await getCompetitionAccess(competitionId, actor)
  return Boolean(access && canManageTeamWithContext(access, teamId))
}

export async function canEnterCompetitionResults(
  competitionId: string,
  actor: AccessActor
): Promise<boolean> {
  const access = await getCompetitionAccess(competitionId, actor)
  return Boolean(access && canEnterResultsWithContext(access))
}

export async function canEnterElementResults(
  elementId: string,
  actor: AccessActor
): Promise<boolean> {
  const element = await prisma.scoringElement.findUnique({
    where: { id: elementId },
    select: { competitionId: true },
  })
  return Boolean(
    element &&
      await canEnterCompetitionResults(element.competitionId, actor)
  )
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
