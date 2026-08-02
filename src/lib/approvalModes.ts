export const APPROVAL_MODES = ["AUTOMATIC", "MANUAL"] as const

export type ApprovalMode = (typeof APPROVAL_MODES)[number]

export function isApprovalMode(value: unknown): value is ApprovalMode {
  return (
    typeof value === "string" &&
    APPROVAL_MODES.includes(value as ApprovalMode)
  )
}

export function workflowStatusAfterSubmission(
  approvalMode: ApprovalMode
): "APPROVED" | "SUBMITTED" {
  return approvalMode === "AUTOMATIC" ? "APPROVED" : "SUBMITTED"
}

export function applicationStatusAfterSubmission(
  approvalMode: ApprovalMode
): "WAITLISTED" | "PENDING_REVIEW" {
  return approvalMode === "AUTOMATIC" ? "WAITLISTED" : "PENDING_REVIEW"
}
