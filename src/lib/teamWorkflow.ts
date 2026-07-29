export const TEAM_WORKFLOW_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "CHANGES_REQUESTED",
] as const

export type TeamWorkflowStatus = (typeof TEAM_WORKFLOW_STATUSES)[number]
export type TeamWorkflowPhase = "REGISTRATION" | "MANDATE"
export type TeamWorkflowDecision = "APPROVE" | "REQUEST_CHANGES"

export function isTeamWorkflowStatus(
  value: unknown
): value is TeamWorkflowStatus {
  return (
    typeof value === "string" &&
    TEAM_WORKFLOW_STATUSES.includes(value as TeamWorkflowStatus)
  )
}

export function isTeamWorkflowPhase(
  value: unknown
): value is TeamWorkflowPhase {
  return value === "REGISTRATION" || value === "MANDATE"
}

export function isTeamWorkflowDecision(
  value: unknown
): value is TeamWorkflowDecision {
  return value === "APPROVE" || value === "REQUEST_CHANGES"
}

export function canEditWorkflow(status: TeamWorkflowStatus) {
  return status === "DRAFT" || status === "CHANGES_REQUESTED"
}

export function canSubmitRegistration(status: TeamWorkflowStatus) {
  return canEditWorkflow(status)
}

export function canEditMandate(
  registrationStatus: TeamWorkflowStatus,
  mandateStatus: TeamWorkflowStatus
) {
  return (
    registrationStatus === "APPROVED" && canEditWorkflow(mandateStatus)
  )
}

export function canSubmitMandate(
  registrationStatus: TeamWorkflowStatus,
  mandateStatus: TeamWorkflowStatus,
  competitorCount: number
) {
  return (
    canEditMandate(registrationStatus, mandateStatus) &&
    competitorCount > 0
  )
}

export function canReviewWorkflow(status: TeamWorkflowStatus) {
  return status === "SUBMITTED"
}
