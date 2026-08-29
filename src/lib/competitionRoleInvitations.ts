import {
  parseCompetitionRoleManagementRequest,
  type EditableCompetitionRole,
} from "./competitionRoleManagement"
import type { CompetitionRoleName } from "./permissions"

export const ROLE_INVITATION_VALID_DAYS = 7

export type StoredCompetitionRoleInvitation = {
  roles: EditableCompetitionRole[]
  elementIds: string[]
  teamIds: string[]
}

export type RoleInvitationState =
  | "PENDING"
  | "ACCEPTED"
  | "REVOKED"
  | "EXPIRED"

export function roleInvitationExpiresAt(now = new Date()) {
  return new Date(
    now.getTime() + ROLE_INVITATION_VALID_DAYS * 24 * 60 * 60 * 1000
  )
}

export function serializeRoleInvitationValues(
  value: StoredCompetitionRoleInvitation
) {
  return {
    roles: JSON.stringify(value.roles),
    elementIds: JSON.stringify(value.elementIds),
    teamIds: JSON.stringify(value.teamIds),
  }
}

export function parseStoredRoleInvitation(value: {
  roles: string
  elementIds: string
  teamIds: string
}): StoredCompetitionRoleInvitation | null {
  try {
    const parsed = parseCompetitionRoleManagementRequest({
      email: "invitation@example.com",
      roles: JSON.parse(value.roles),
      elementIds: JSON.parse(value.elementIds),
      teamIds: JSON.parse(value.teamIds),
    })
    if (!parsed.ok || parsed.value.roles.length === 0) return null
    return {
      roles: parsed.value.roles,
      elementIds: parsed.value.elementIds,
      teamIds: parsed.value.teamIds,
    }
  } catch {
    return null
  }
}

export function getRoleInvitationState(
  invitation: {
    acceptedAt?: Date | string | null
    revokedAt?: Date | string | null
    expiresAt: Date | string
  },
  now = new Date()
): RoleInvitationState {
  if (invitation.acceptedAt) return "ACCEPTED"
  if (invitation.revokedAt) return "REVOKED"
  if (new Date(invitation.expiresAt).getTime() <= now.getTime()) {
    return "EXPIRED"
  }
  return "PENDING"
}

export function maskInvitationEmail(email: string) {
  const normalized = email.trim().toLowerCase()
  const at = normalized.indexOf("@")
  if (at <= 0) return "***"
  const local = normalized.slice(0, at)
  const domain = normalized.slice(at + 1)
  const visible = local.slice(0, Math.min(2, local.length))
  return `${visible}${"*".repeat(Math.max(3, local.length - visible.length))}@${domain}`
}

export function mergeCompetitionRoleInvitation(
  current: {
    roles: readonly CompetitionRoleName[]
    elementIds: readonly string[]
    teamIds: readonly string[]
  },
  invited: StoredCompetitionRoleInvitation
): StoredCompetitionRoleInvitation {
  const currentEditableRoles = current.roles.flatMap((role) =>
    role === "ORGANIZER" || role === "JUDGE" || role === "REPRESENTATIVE"
      ? [role]
      : []
  )
  return {
    roles: [...new Set([...currentEditableRoles, ...invited.roles])],
    elementIds: [...new Set([...current.elementIds, ...invited.elementIds])],
    teamIds: [...new Set([...current.teamIds, ...invited.teamIds])],
  }
}
