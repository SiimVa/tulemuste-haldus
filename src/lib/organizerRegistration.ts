import type { FormFieldDefinition, FormAnswers, MemberAnswer } from "./registrationForm"

// Organizers may correct registration fields during mandate as well. Mandate
// requirements are checked when approving it; drafts can still be saved.
export function organizerRegistrationFields(fields: FormFieldDefinition[], includeMandate: boolean) {
  return fields
    .filter((field) => field.showInRegistration || (includeMandate && field.showInMandate))
    .map((field) => ({
      ...field,
      showInRegistration: true,
      requiredInRegistration: field.showInRegistration && field.requiredInRegistration,
    }))
}

// The current roster may have been edited on the teams page. Preserve contact
// details from form answers while showing current names, accounts and roles.
export function organizerTeamAnswers(
  fields: FormFieldDefinition[],
  answers: FormAnswers,
  members: { name: string; email?: string | null; role: string; isCaptain: boolean; assignmentRole: string | null }[],
) {
  const memberFields = fields.filter((field) => field.type === "MEMBER_LIST" && (field.showInRegistration || field.showInMandate))
  if (!memberFields.length) return answers
  const result = { ...answers }
  const assigned = new Set<number>()
  for (const field of memberFields) {
    const stored = answers[field.key]
    const contacts = Array.isArray(stored) ? stored.filter((value): value is MemberAnswer => typeof value === "object" && value !== null) : []
    result[field.key] = contacts.flatMap((contact) => {
      const index = members.findIndex((member, index) => !assigned.has(index) && member.role === "COMPETITOR" && (
        (contact.email && member.email?.toLowerCase() === contact.email.toLowerCase()) || member.name === contact.name
      ))
      if (index < 0) return []
      assigned.add(index)
      const member = members[index]
      return [{ ...contact, name: member.name, email: member.email ?? undefined, isCaptain: member.isCaptain, assignmentRole: member.assignmentRole ?? undefined }]
    })
  }
  const first = memberFields[0].key
  result[first] = [
    ...result[first] as MemberAnswer[],
    ...members.flatMap((member, index) => member.role !== "COMPETITOR" || assigned.has(index) ? [] : [{ name: member.name, email: member.email ?? undefined, isCaptain: member.isCaptain, assignmentRole: member.assignmentRole ?? undefined }]),
  ]
  return result
}
