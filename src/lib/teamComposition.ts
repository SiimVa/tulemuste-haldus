export type TeamMemberRoleDefinition = {
  name: string
  required: boolean
}

export type TeamCompositionSettings = {
  representativeRequired: boolean
  captainRequired: boolean
  memberRoles: TeamMemberRoleDefinition[]
}

export type TeamCompositionMember = {
  role: string
  isCaptain?: boolean
  assignmentRole?: string | null
}

export function normalizeTeamMemberRoles(
  value: unknown
): TeamMemberRoleDefinition[] {
  if (!Array.isArray(value)) {
    throw new Error("Liikmerollide nimekiri puudub")
  }
  if (value.length > 20) {
    throw new Error("Ühel võistlusel saab olla kuni 20 liikmerolli")
  }

  const roles = value.map((item): TeamMemberRoleDefinition => {
    const raw =
      typeof item === "string"
        ? { name: item, required: false }
        : item && typeof item === "object"
          ? (item as Record<string, unknown>)
          : null
    const name = typeof raw?.name === "string" ? raw.name.trim() : ""
    if (!name || name.length > 100) {
      throw new Error("Kontrolli liikmerolli nimetust")
    }
    return { name, required: Boolean(raw?.required) }
  })

  const normalizedNames = roles.map(({ name }) =>
    name.toLocaleLowerCase("et")
  )
  if (new Set(normalizedNames).size !== normalizedNames.length) {
    throw new Error("Liikmerollide nimetused peavad olema erinevad")
  }
  return roles
}

export function parseTeamMemberRoles(value: string): TeamMemberRoleDefinition[] {
  try {
    return normalizeTeamMemberRoles(JSON.parse(value))
  } catch {
    return []
  }
}

export function validateTeamMemberAssignments(
  members: TeamCompositionMember[],
  settings: TeamCompositionSettings
): string | null {
  const captains = members.filter(({ isCaptain }) => Boolean(isCaptain))
  if (captains.length > 1) {
    return "Kapteniks saab märkida ainult ühe võistkonnaliikme"
  }
  if (captains.some(({ role }) => role !== "COMPETITOR")) {
    return "Kapten peab olema võistleja"
  }

  const allowedRoles = new Set(settings.memberRoles.map(({ name }) => name))
  const unknownRole = members.find(
    ({ assignmentRole }) => assignmentRole && !allowedRoles.has(assignmentRole)
  )?.assignmentRole
  if (unknownRole) {
    return `Liikmeroll „${unknownRole}” ei ole sellel võistlusel lubatud`
  }
  return null
}

export function validateTeamComposition(
  members: TeamCompositionMember[],
  settings: TeamCompositionSettings,
  hasRepresentative: boolean
): string | null {
  const assignmentError = validateTeamMemberAssignments(members, settings)
  if (assignmentError) return assignmentError

  if (settings.representativeRequired && !hasRepresentative) {
    return "Võistkonnale tuleb määrata esindaja"
  }
  if (
    settings.captainRequired &&
    !members.some(
      ({ isCaptain, role }) => isCaptain && role === "COMPETITOR"
    )
  ) {
    return "Võistkonnale tuleb valida kapten"
  }

  const missingRole = settings.memberRoles.find(
    ({ name, required }) =>
      required && !members.some(({ assignmentRole }) => assignmentRole === name)
  )
  if (missingRole) {
    return `Võistkonnale tuleb määrata roll „${missingRole.name}”`
  }
  return null
}
