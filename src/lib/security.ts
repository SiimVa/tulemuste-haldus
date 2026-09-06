export const SECURITY_RETENTION_DAYS = 90

export const SECURITY_OUTCOMES = [
  "STARTED", "SUCCEEDED", "DENIED", "FAILED", "RATE_LIMITED",
] as const
export type SecurityOutcome = typeof SECURITY_OUTCOMES[number]

export const SECURITY_OUTCOME_LABELS: Record<SecurityOutcome, string> = {
  STARTED: "Lõpptulemus puudub",
  SUCCEEDED: "Õnnestus",
  DENIED: "Keeldutud",
  FAILED: "Ebaõnnestus",
  RATE_LIMITED: "Päringupiirang",
}

export const SECURITY_ACTION_LABELS: Record<string, string> = {
  LOGIN: "Sisselogimine",
  API_READ: "Andmete päring",
  API_WRITE: "Andmete muutmine",
  ACCOUNT_CHANGE: "Kasutajakonto muutmine",
  ACCESS_CHANGE: "Juurdepääsu muutmine",
  RESULT_CHANGE: "Tulemuste muutmine",
  REGISTRATION_CHANGE: "Registreerimise või mandaadi muutmine",
  EXPORT: "Andmete eksport",
  AUDIT_READ: "Turvalogi vaatamine",
}

export function securityAction(route: string, method: string): string {
  if (route === "/api/security-events") return "AUDIT_READ"
  if (route.includes("/export")) return "EXPORT"
  if (method === "GET" || method === "HEAD") return "API_READ"
  if (route.startsWith("/api/users") || route === "/api/setup") return "ACCOUNT_CHANGE"
  if (/\/(roles|members|judges|representatives|tokens|role-invitations|invitations|registration-link|results-link)(\/|$)/.test(route)) return "ACCESS_CHANGE"
  if (/registration|representative\/teams/.test(route)) return "REGISTRATION_CHANGE"
  if (/\/(results|misc|misc-entries|recalculate)(\/|$)/.test(route)) return "RESULT_CHANGE"
  return "API_WRITE"
}

export function securityOutcome(status: number): SecurityOutcome {
  if (status === 429) return "RATE_LIMITED"
  if (status === 401 || status === 403) return "DENIED"
  return status >= 400 ? "FAILED" : "SUCCEEDED"
}

// Only known internal identifier fields, never URL tokens, search parameters or bodies.
export function securityTargetIds(params: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const key of ["id", "competitionId", "teamId", "elementId", "sectionId", "entryId", "applicationId", "userId"]) {
    const value = params[key]
    if (typeof value === "string" && /^c[a-z0-9]{24}$/.test(value)) result[key] = value
  }
  return result
}

export type RateLimitPolicy = { scope: string; limit: number; seconds: number }

export const LOGIN_IP_POLICY: RateLimitPolicy = { scope: "login-ip", limit: 60, seconds: 900 }
export const LOGIN_ACCOUNT_POLICY: RateLimitPolicy = { scope: "login-account", limit: 10, seconds: 900 }

export function apiRateLimitPolicy(route: string, method: string, authenticated: boolean): RateLimitPolicy {
  if (route === "/api/setup") return { scope: "setup", limit: 5, seconds: 900 }
  if (route === "/api/users/me/password") return { scope: "password-change", limit: 10, seconds: 900 }
  if (route.includes("/export")) return { scope: "export", limit: 20, seconds: 60 }
  const read = method === "GET" || method === "HEAD"
  return {
    scope: read ? "api-read" : "api-write",
    limit: authenticated ? (read ? 600 : 240) : (read ? 240 : 60),
    seconds: 60,
  }
}
