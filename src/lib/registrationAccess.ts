export const REGISTRATION_ACCESS_MODES = [
  "PUBLIC",
  "LINK_ONLY",
  "PRIVATE",
] as const

export type RegistrationAccessMode =
  (typeof REGISTRATION_ACCESS_MODES)[number]

export function isRegistrationAccessMode(
  value: unknown
): value is RegistrationAccessMode {
  return (
    typeof value === "string" &&
    REGISTRATION_ACCESS_MODES.includes(value as RegistrationAccessMode)
  )
}

export function registrationAccessModeFromRequest(
  value: unknown,
  legacyIsPublic: unknown
): RegistrationAccessMode | null {
  if (value !== undefined) {
    return isRegistrationAccessMode(value) ? value : null
  }
  return legacyIsPublic === true ? "PUBLIC" : "PRIVATE"
}

export function isRegistrationLinkToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value)
}
