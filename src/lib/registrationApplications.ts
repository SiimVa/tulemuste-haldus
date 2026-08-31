export const REGISTRATION_APPLICATION_STATUSES = [
  "DRAFT",
  "PENDING_REVIEW",
  "CHANGES_REQUESTED",
  "CONFIRMED",
  "WAITLISTED",
  "REJECTED",
  "WITHDRAWN",
] as const

export type RegistrationApplicationStatus =
  (typeof REGISTRATION_APPLICATION_STATUSES)[number]

export const PUBLIC_REGISTRATION_APPLICATION_STATUSES = [
  "PENDING_REVIEW",
  "CHANGES_REQUESTED",
  "CONFIRMED",
  "WAITLISTED",
] as const satisfies readonly RegistrationApplicationStatus[]

export type PublicRegistrationApplicationStatus =
  (typeof PUBLIC_REGISTRATION_APPLICATION_STATUSES)[number]

export function isPublicRegistrationApplicationStatus(
  status: string
): status is PublicRegistrationApplicationStatus {
  return PUBLIC_REGISTRATION_APPLICATION_STATUSES.some(
    (publicStatus) => publicStatus === status
  )
}

export function initialRegistrationStatus(
  confirmedCount: number,
  capacity: number | null
): "CONFIRMED" | "WAITLISTED" {
  if (capacity === null) return "CONFIRMED"
  return confirmedCount < capacity ? "CONFIRMED" : "WAITLISTED"
}

export function canWithdrawRegistration(
  status: string
): status is
  | "CONFIRMED"
  | "WAITLISTED"
  | "PENDING_REVIEW"
  | "CHANGES_REQUESTED" {
  return (
    status === "CONFIRMED" ||
    status === "WAITLISTED" ||
    status === "PENDING_REVIEW" ||
    status === "CHANGES_REQUESTED"
  )
}

export function canEditRegistration(
  status: string
): status is
  | "CONFIRMED"
  | "WAITLISTED"
  | "PENDING_REVIEW"
  | "CHANGES_REQUESTED" {
  return canWithdrawRegistration(status)
}
