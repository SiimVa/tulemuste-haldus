export function isAutomaticRegistrationCode(code: string): boolean {
  return /^REG-\d+$/.test(code.trim())
}

export function teamDisplayName(team: { code: string; name: string }): string {
  const code = team.code.trim()
  return code && !isAutomaticRegistrationCode(code)
    ? `${code} · ${team.name}`
    : team.name
}
