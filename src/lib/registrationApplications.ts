export const REGISTRATION_APPLICATION_STATUSES = [
  "DRAFT",
  "PENDING_REVIEW",
  "CONFIRMED",
  "WAITLISTED",
  "REJECTED",
  "WITHDRAWN",
] as const

export type RegistrationApplicationStatus =
  (typeof REGISTRATION_APPLICATION_STATUSES)[number]

export function initialRegistrationStatus(
  confirmedCount: number,
  capacity: number | null
): "CONFIRMED" | "WAITLISTED" {
  if (capacity === null) return "CONFIRMED"
  return confirmedCount < capacity ? "CONFIRMED" : "WAITLISTED"
}

export function canWithdrawRegistration(
  status: string
): status is "CONFIRMED" | "WAITLISTED" | "PENDING_REVIEW" {
  return (
    status === "CONFIRMED" ||
    status === "WAITLISTED" ||
    status === "PENDING_REVIEW"
  )
}
