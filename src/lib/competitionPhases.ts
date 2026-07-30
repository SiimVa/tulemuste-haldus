export const PHASE_OVERRIDES = ["AUTO", "OPEN", "CLOSED"] as const

export type PhaseOverride = (typeof PHASE_OVERRIDES)[number]
export type PhaseStatus = "NOT_OPEN" | "OPEN" | "CLOSED" | "FINALIZED"

export type PhaseSchedule = {
  override: string
  opensAt: Date | string | null
  closesAt: Date | string | null
  finalizedAt: Date | string | null
}

export function isPhaseOverride(value: unknown): value is PhaseOverride {
  return (
    typeof value === "string" &&
    PHASE_OVERRIDES.includes(value as PhaseOverride)
  )
}

function toTime(value: Date | string | null): number | null {
  if (!value) return null
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Number.isFinite(time) ? time : null
}

export function getPhaseStatus(
  schedule: PhaseSchedule,
  now = new Date(),
  prerequisiteMet = true
): PhaseStatus {
  if (toTime(schedule.finalizedAt) !== null) return "FINALIZED"
  if (!prerequisiteMet) return "NOT_OPEN"

  if (schedule.override === "OPEN") return "OPEN"
  if (schedule.override === "CLOSED") return "CLOSED"

  const opensAt = toTime(schedule.opensAt)
  const closesAt = toTime(schedule.closesAt)
  const current = now.getTime()

  if (opensAt === null && closesAt === null) return "NOT_OPEN"
  if (opensAt !== null && current < opensAt) return "NOT_OPEN"
  if (closesAt !== null && current >= closesAt) return "CLOSED"
  return "OPEN"
}

export function getCompetitionRegistrationStatus(
  competition: {
    registrationOverride: string
    registrationOpensAt: Date | string | null
    registrationClosesAt: Date | string | null
    registrationFinalizedAt: Date | string | null
  },
  now = new Date()
): PhaseStatus {
  return getPhaseStatus(
    {
      override: competition.registrationOverride,
      opensAt: competition.registrationOpensAt,
      closesAt: competition.registrationClosesAt,
      finalizedAt: competition.registrationFinalizedAt,
    },
    now
  )
}

export function getCompetitionMandateStatus(
  competition: {
    registrationFinalizedAt: Date | string | null
    mandateOverride: string
    mandateOpensAt: Date | string | null
    mandateClosesAt: Date | string | null
    mandateFinalizedAt: Date | string | null
  },
  now = new Date()
): PhaseStatus {
  return getPhaseStatus(
    {
      override: competition.mandateOverride,
      opensAt: competition.mandateOpensAt,
      closesAt: competition.mandateClosesAt,
      finalizedAt: competition.mandateFinalizedAt,
    },
    now,
    Boolean(competition.registrationFinalizedAt)
  )
}

export function validatePhaseWindow(
  opensAt: Date | string | null,
  closesAt: Date | string | null
): boolean {
  const opens = toTime(opensAt)
  const closes = toTime(closesAt)
  return opens === null || closes === null || opens < closes
}
