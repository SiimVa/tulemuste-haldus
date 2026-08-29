import type { CompetitionRoleName } from "./permissions"

export const EDITABLE_COMPETITION_ROLES = [
  "ORGANIZER",
  "JUDGE",
  "REPRESENTATIVE",
] as const satisfies readonly CompetitionRoleName[]

export type EditableCompetitionRole =
  (typeof EDITABLE_COMPETITION_ROLES)[number]

export type CompetitionRoleManagementRequest = {
  email: string
  roles: EditableCompetitionRole[]
  elementIds: string[]
  teamIds: string[]
}

type ParseResult =
  | { ok: true; value: CompetitionRoleManagementRequest }
  | { ok: false; error: string }

function uniqueStrings(value: unknown) {
  if (!Array.isArray(value)) return []
  return [
    ...new Set(
      value.filter(
        (item): item is string =>
          typeof item === "string" && item.trim().length > 0
      )
    ),
  ]
}

export function parseCompetitionRoleManagementRequest(
  body: unknown
): ParseResult {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Päringu sisu ei ole korrektne" }
  }

  const input = body as Record<string, unknown>
  const email =
    typeof input.email === "string" ? input.email.trim().toLowerCase() : ""
  const rawRoles = uniqueStrings(input.roles)

  if (!email) {
    return { ok: false, error: "Kasutaja e-post on kohustuslik" }
  }
  if (
    rawRoles.some(
      (role) =>
        !EDITABLE_COMPETITION_ROLES.includes(
          role as EditableCompetitionRole
        )
    )
  ) {
    return { ok: false, error: "Vähemalt üks roll ei ole muudetav" }
  }

  const roles = rawRoles as EditableCompetitionRole[]
  const elementIds = roles.includes("JUDGE")
    ? uniqueStrings(input.elementIds)
    : []
  const teamIds = roles.includes("REPRESENTATIVE")
    ? uniqueStrings(input.teamIds)
    : []

  if (roles.includes("JUDGE") && elementIds.length === 0) {
    return {
      ok: false,
      error: "Kohtunikule tuleb valida vähemalt üks hindamiselement",
    }
  }
  if (roles.includes("REPRESENTATIVE") && teamIds.length === 0) {
    return {
      ok: false,
      error: "Esindajale tuleb valida vähemalt üks võistkond",
    }
  }

  return {
    ok: true,
    value: { email, roles, elementIds, teamIds },
  }
}

export function mayChangeOrganizerRole(
  currentRoles: readonly CompetitionRoleName[],
  requestedRoles: readonly EditableCompetitionRole[],
  canManageOrganizers: boolean
) {
  const currentlyOrganizer = currentRoles.includes("ORGANIZER")
  const requestedOrganizer = requestedRoles.includes("ORGANIZER")
  return (
    canManageOrganizers || currentlyOrganizer === requestedOrganizer
  )
}
