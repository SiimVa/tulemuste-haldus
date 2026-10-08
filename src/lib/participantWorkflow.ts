import type { PhaseStatus } from "./competitionPhases"

export type ParticipantPhase = "REGISTRATION" | "MANDATE" | "ACTIVE"
export type ParticipantStatus = {
  label: string
  tone: "neutral" | "blue" | "amber" | "green" | "red"
  needsAttention: boolean
}

export function participantTeamPhase(input: {
  competitionStatus: string
  registrationStatus: string
  mandateStatus: string
  mandatePhase: PhaseStatus
  hasRegistrationApplication?: boolean
}): ParticipantPhase {
  if (input.competitionStatus === "ACTIVE") return "ACTIVE"
  if (input.registrationStatus !== "APPROVED") return "REGISTRATION"
  if (input.hasRegistrationApplication === false) return "MANDATE"
  if (input.mandatePhase !== "NOT_OPEN" || ["SUBMITTED", "APPROVED", "CHANGES_REQUESTED"].includes(input.mandateStatus)) {
    return "MANDATE"
  }
  return "REGISTRATION"
}

export function participantStatus(phase: ParticipantPhase, status: string): ParticipantStatus {
  if (phase === "ACTIVE") return { label: "Võistlus toimub", tone: "green", needsAttention: false }
  if (status === "CHANGES_REQUESTED") return { label: "Vajab täiendamist", tone: "red", needsAttention: true }
  if (phase === "MANDATE") {
    if (status === "APPROVED") return { label: "Mandaat kinnitatud", tone: "green", needsAttention: false }
    if (status === "SUBMITTED") return { label: "Mandaat esitatud", tone: "amber", needsAttention: false }
    return { label: "Ootab mandaadi esitamist", tone: "blue", needsAttention: true }
  }
  if (["APPROVED", "CONFIRMED"].includes(status)) return { label: "Registreerimine kinnitatud", tone: "green", needsAttention: false }
  if (status === "WAITLISTED") return { label: "Ootenimekirjas", tone: "amber", needsAttention: false }
  if (status === "DRAFT") return { label: "Registreerimise mustand", tone: "neutral", needsAttention: true }
  return { label: "Registreeritud", tone: "blue", needsAttention: false }
}

export type ParticipantItem = {
  id: string
  teamId: string | null
  phase: ParticipantPhase
  status: string
  competitionId: string
  competitionName: string
  teamName: string
  className: string | null
  date: string | null
  href: string | null
  action: string | null
  description: string
  note: string | null
  waitlistPosition: number | null
  isRepresentative: boolean
  isMember: boolean
  resultsToken: string | null
  requiresAction: boolean
}
