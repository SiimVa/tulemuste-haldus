export type CompetitionOwnerRequest =
  | { ok: true; userId: string | null }
  | { ok: false; error: string }

export function parseCompetitionOwnerRequest(
  value: unknown
): CompetitionOwnerRequest {
  if (!value || typeof value !== "object" || !("userId" in value)) {
    return { ok: false, error: "Peakorraldaja valik puudub" }
  }

  const userId = (value as { userId?: unknown }).userId
  if (userId === null) return { ok: true, userId: null }
  if (typeof userId !== "string" || !userId.trim()) {
    return { ok: false, error: "Peakorraldaja valik ei ole korrektne" }
  }

  return { ok: true, userId: userId.trim() }
}
