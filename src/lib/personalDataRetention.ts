import type { MemberAnswer } from "./registrationForm"

export const DEFAULT_PERSONAL_DATA_RETENTION_DAYS = 90
export const MIN_PERSONAL_DATA_RETENTION_DAYS = 1
export const MAX_PERSONAL_DATA_RETENTION_DAYS = 90

const DAY_MS = 24 * 60 * 60 * 1000

export function isPersonalDataRetentionDays(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_PERSONAL_DATA_RETENTION_DAYS &&
    value <= MAX_PERSONAL_DATA_RETENTION_DAYS
  )
}

export function getPersonalDataPurgeDueAt(
  endDate: Date | string | null | undefined,
  retentionDays: number
): Date | null {
  if (!endDate || !isPersonalDataRetentionDays(retentionDays)) return null
  const timestamp = new Date(endDate).getTime()
  if (!Number.isFinite(timestamp)) return null
  return new Date(timestamp + retentionDays * DAY_MS)
}

export function isPersonalDataPurgeDue(
  endDate: Date | string | null | undefined,
  retentionDays: number,
  now = new Date()
): boolean {
  const dueAt = getPersonalDataPurgeDueAt(endDate, retentionDays)
  return Boolean(dueAt && dueAt.getTime() <= now.getTime())
}

export function scrubMemberListPersonalData(value: string): string | null {
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return null
    const members = parsed.flatMap((item): MemberAnswer[] => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return []
      const member = { ...(item as Record<string, unknown>) }
      delete member.email
      delete member.phone
      delete member.birthDate
      return [member as MemberAnswer]
    })
    return JSON.stringify(members)
  } catch {
    return null
  }
}
