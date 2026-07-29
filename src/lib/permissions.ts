export const COMPETITION_ROLES = [
  "OWNER",
  "ORGANIZER",
  "JUDGE",
  "COMPETITOR",
  "REPRESENTATIVE",
  "VIEWER",
] as const

export type CompetitionRoleName = (typeof COMPETITION_ROLES)[number]

export type CompetitionAccessContext = {
  systemRole?: string | null
  isOwner: boolean
  roles: readonly CompetitionRoleName[]
  representedTeamIds?: readonly string[]
}

function hasRole(
  access: CompetitionAccessContext,
  roles: readonly CompetitionRoleName[]
) {
  return access.roles.some((role) => roles.includes(role))
}

export function canCreateCompetition(systemRole?: string | null) {
  return systemRole === "ADMIN"
}

export function canViewCompetition(access: CompetitionAccessContext) {
  return (
    access.systemRole === "ADMIN" ||
    access.isOwner ||
    access.roles.length > 0
  )
}

export function canManageCompetition(access: CompetitionAccessContext) {
  return (
    access.systemRole === "ADMIN" ||
    access.isOwner ||
    hasRole(access, ["OWNER", "ORGANIZER"])
  )
}

export function canManageCompetitionMembers(access: CompetitionAccessContext) {
  return (
    access.systemRole === "ADMIN" ||
    access.isOwner ||
    hasRole(access, ["OWNER"])
  )
}

export function canEnterCompetitionResults(access: CompetitionAccessContext) {
  return canManageCompetition(access) || hasRole(access, ["JUDGE"])
}

export function canManageTeamRegistration(
  access: CompetitionAccessContext,
  teamId: string
) {
  return (
    canManageCompetition(access) ||
    (hasRole(access, ["REPRESENTATIVE"]) &&
      Boolean(access.representedTeamIds?.includes(teamId)))
  )
}
