import { REPRESENTATIVE_FORM_FIELD_KEYS as keys, type FormAnswers } from "./registrationForm"

export type RepresentativeIdentity = { id?: string; name: string; email: string }
type PendingIdentity = { pendingRepresentativeName?: string | null; pendingRepresentativeEmail?: string | null }

export function teamRepresentativeIdentity(team: PendingIdentity & {
  representative?: { member: { user: RepresentativeIdentity } } | null
}): RepresentativeIdentity | null {
  return team.representative?.member.user ?? (team.pendingRepresentativeEmail
    ? { name: team.pendingRepresentativeName ?? "", email: team.pendingRepresentativeEmail }
    : null)
}

export function applicationRepresentativeIdentity(application: PendingIdentity & {
  representative?: RepresentativeIdentity | null
  submittedBy: RepresentativeIdentity
}): RepresentativeIdentity {
  if (application.pendingRepresentativeEmail) return { name: application.pendingRepresentativeName ?? "", email: application.pendingRepresentativeEmail }
  return application.representative ?? application.submittedBy
}

export function applicationRepresentativeId(application: { representativeId?: string | null; submittedById: string; teamId?: string | null; pendingRepresentativeEmail?: string | null }) {
  return application.pendingRepresentativeEmail ? null : application.representativeId ?? (application.teamId ? null : application.submittedById)
}

// Legacy applications without the new relation still belong to their submitter.
export function applicationRepresentativeWhere(userId: string) {
  return { pendingRepresentativeEmail: null, OR: [{ representativeId: userId }, { representativeId: null, submittedById: userId, teamId: null }] }
}

// Account/pending assignment is authoritative. A former representative's phone
// must not silently become the new representative's phone.
export function currentRepresentativeAnswers(answers: FormAnswers, identity: RepresentativeIdentity | null): FormAnswers {
  const storedEmail = answers[keys.email]
  const oldEmail = typeof storedEmail === "string" ? storedEmail.trim().toLowerCase() : ""
  const sameIdentity = identity && oldEmail === identity.email.trim().toLowerCase()
  return { ...answers, [keys.name]: identity?.name ?? "", [keys.email]: identity?.email ?? "", [keys.phone]: sameIdentity ? answers[keys.phone] ?? "" : "" }
}
