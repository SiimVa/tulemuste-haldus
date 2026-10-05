import {
  REPRESENTATIVE_FORM_FIELD_KEYS,
  isFormFieldVisible,
  parseFormAnswer,
  type FormAnswer,
  type FormFieldDefinition,
  type MemberAnswer,
} from "./registrationForm"

// Kirjad võistkondadele: saajad on registreerunud võistkondade esindajad ja
// liikmed, kellel on e-post. Sama loogika on brauseris eelvaates ja serveris,
// mis arvutab saajad uuesti ega usalda brauseri saadetud aadresse.

export const MESSAGE_GROUPS = ["TEAM", "CONFIRMED", "WAITLISTED", "PENDING_REVIEW", "CHANGES_REQUESTED"] as const
export type MessageGroup = (typeof MESSAGE_GROUPS)[number]
export const MESSAGE_GROUP_LABELS: Record<MessageGroup, string> = {
  TEAM: "Võistkonnad",
  CONFIRMED: "Registreeritud",
  WAITLISTED: "Ootenimekirjas",
  PENDING_REVIEW: "Ootab ülevaatamist",
  CHANGES_REQUESTED: "Vajab täiendamist",
}
// Vaikimisi kiri läheb võistkondadele ja registreeritud avaldustele.
export const DEFAULT_MESSAGE_GROUPS: MessageGroup[] = ["TEAM", "CONFIRMED"]

export const MESSAGE_ROLES = ["REPRESENTATIVE", "MEMBER"] as const
export type MessageRole = (typeof MESSAGE_ROLES)[number]
export const MESSAGE_ROLE_LABELS: Record<MessageRole, string> = { REPRESENTATIVE: "Esindajad", MEMBER: "Liikmed" }
const ROLE_CONTEXT: Record<MessageRole, string> = { REPRESENTATIVE: "esindaja", MEMBER: "liige" }

export const MESSAGE_SUBJECT_MAX = 200
export const MESSAGE_BODY_MAX = 20_000
export const MESSAGE_RECIPIENT_MAX = 2_000
// Klassita võistkondade valik klassifiltris.
export const NO_CLASS = ""

type Values = { fieldId: string; value: string }[]
export type MessageApplication = {
  id: string
  teamName: string
  status: string
  teamId: string | null
  className: string | null
  submittedBy: { name: string; email: string }
  pendingRepresentativeName: string | null
  pendingRepresentativeEmail: string | null
  fieldValues: Values
}
export type MessageTeam = {
  id: string
  name: string
  className: string | null
  representative: { name: string; email: string } | null
  pendingRepresentativeName: string | null
  pendingRepresentativeEmail: string | null
  members: { name: string; email: string | null }[]
  formValues: Values
}

export type MessageContact = {
  email: string
  name: string | null
  role: MessageRole
  teamKey: string
  teamName: string
  className: string | null
  group: MessageGroup
}
export type MessageRecipient = { email: string; name: string | null; contexts: string[] }
export type MessageFilters = { groups: string[]; roles: string[]; classes: string[] | null }

const EMAIL_PATTERN = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/

export function normalizeMessageEmail(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase()
}

export function isValidMessageEmail(value: string): boolean {
  return value.length <= 254 && EMAIL_PATTERN.test(value)
}

const text = (value: FormAnswer | undefined) => (typeof value === "string" ? value.trim() : "")
const isMember = (value: unknown): value is MemberAnswer =>
  typeof value === "object" && value !== null && typeof (value as MemberAnswer).name === "string"

function answers(fields: FormFieldDefinition[], values: Values) {
  const byId = new Map(values.map((value) => [value.fieldId, parseFormAnswer(value.value)]))
  const byKey = Object.fromEntries(fields.flatMap((field) => {
    const value = byId.get(field.id ?? "")
    return value === undefined ? [] : [[field.key, value]]
  })) as Record<string, FormAnswer>
  return { byId, byKey }
}

function answeredMembers(fields: FormFieldDefinition[], values: Values): { name: string; email: string }[] {
  const parsed = answers(fields, values)
  return fields.filter((field) => field.type === "MEMBER_LIST" && isFormFieldVisible(field, parsed.byKey)).flatMap((field) => {
    const value = parsed.byId.get(field.id ?? "")
    return Array.isArray(value) ? value.filter(isMember).map((member) => ({ name: member.name.trim(), email: member.email ?? "" })) : []
  })
}

function applicationGroup(status: string): MessageGroup | null {
  if (status === "CONFIRMED") return "CONFIRMED"
  if (status === "WAITLISTED") return "WAITLISTED"
  if (status === "PENDING_REVIEW" || status === "SUBMITTED") return "PENDING_REVIEW"
  if (status === "CHANGES_REQUESTED") return "CHANGES_REQUESTED"
  return null
}

// Kõik kontaktid koos rolli ja võistkonnaga. Kinnitatud nimekirja võistkond on
// üks registreering: avaldust, millest võistkond loodi, eraldi ei loeta.
export function collectMessageContacts(input: { fields: FormFieldDefinition[]; applications: MessageApplication[]; teams: MessageTeam[] }): MessageContact[] {
  const contacts: MessageContact[] = []
  const add = (contact: Omit<MessageContact, "email" | "name"> & { email: string | null | undefined; name: string | null | undefined }) => {
    const email = normalizeMessageEmail(contact.email)
    if (!email) return
    if (contacts.some((item) => item.email === email && item.teamKey === contact.teamKey && item.role === contact.role)) return
    contacts.push({ ...contact, email, name: contact.name?.trim() || null })
  }
  for (const application of input.applications) {
    const group = applicationGroup(application.status)
    if (!group || application.teamId) continue
    const parsed = answers(input.fields, application.fieldValues)
    const base = { teamKey: `application:${application.id}`, teamName: application.teamName, className: application.className, group }
    add({ ...base, role: "REPRESENTATIVE", email: text(parsed.byKey[REPRESENTATIVE_FORM_FIELD_KEYS.email]) || application.pendingRepresentativeEmail, name: text(parsed.byKey[REPRESENTATIVE_FORM_FIELD_KEYS.name]) || application.pendingRepresentativeName })
    add({ ...base, role: "REPRESENTATIVE", email: application.submittedBy.email, name: application.submittedBy.name })
    for (const member of answeredMembers(input.fields, application.fieldValues)) add({ ...base, role: "MEMBER", email: member.email, name: member.name })
  }
  for (const team of input.teams) {
    const base = { teamKey: `team:${team.id}`, teamName: team.name, className: team.className, group: "TEAM" as const }
    add({ ...base, role: "REPRESENTATIVE", email: team.representative?.email, name: team.representative?.name })
    add({ ...base, role: "REPRESENTATIVE", email: team.pendingRepresentativeEmail, name: team.pendingRepresentativeName })
    for (const member of team.members) add({ ...base, role: "MEMBER", email: member.email, name: member.name })
    for (const member of answeredMembers(input.fields, team.formValues)) add({ ...base, role: "MEMBER", email: member.email, name: member.name })
  }
  return contacts
}

export function matchesMessageFilters(contact: MessageContact, filters: MessageFilters): boolean {
  return filters.groups.includes(contact.group)
    && filters.roles.includes(contact.role)
    && (filters.classes === null || filters.classes.includes(contact.className ?? NO_CLASS))
}

// Saajad filtrite järgi; sama aadress saab ühe kirja, kus on kõik põhjused.
export function selectMessageRecipients(contacts: MessageContact[], filters: MessageFilters): { recipients: MessageRecipient[]; invalid: string[] } {
  const byEmail = new Map<string, MessageRecipient>()
  const invalid = new Set<string>()
  for (const contact of contacts) {
    if (!matchesMessageFilters(contact, filters)) continue
    if (!isValidMessageEmail(contact.email)) {
      invalid.add(contact.email)
      continue
    }
    const context = `${contact.teamName} (${ROLE_CONTEXT[contact.role]})`
    const recipient = byEmail.get(contact.email) ?? { email: contact.email, name: contact.name, contexts: [] }
    if (!recipient.name && contact.name) recipient.name = contact.name
    if (!recipient.contexts.includes(context)) recipient.contexts.push(context)
    byEmail.set(contact.email, recipient)
  }
  return {
    recipients: [...byEmail.values()].sort((a, b) => a.contexts[0].localeCompare(b.contexts[0], "et") || a.email.localeCompare(b.email)),
    invalid: [...invalid].sort(),
  }
}

export function validateMessageInput(subject: unknown, body: unknown): string | null {
  if (typeof subject !== "string" || !subject.trim()) return "Kirja teema on kohustuslik"
  if (subject.trim().length > MESSAGE_SUBJECT_MAX) return `Teema võib olla kuni ${MESSAGE_SUBJECT_MAX} märki`
  if (/[\r\n]/.test(subject)) return "Teema peab olema ühel real"
  if (typeof body !== "string" || !body.trim()) return "Kirja sisu on kohustuslik"
  if (body.length > MESSAGE_BODY_MAX) return `Kiri võib olla kuni ${MESSAGE_BODY_MAX} märki`
  return null
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")
}

// Lõigud tühja rea järgi, read <br>-iga, http(s)-lingid klikitavaks.
function bodyHtml(body: string): string {
  return body.trim().split(/\n\s*\n/).map((paragraph) => {
    const escaped = escapeHtml(paragraph.trim())
      .replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"]/g, (url) => `<a href="${url}" style="color:#2563eb">${url}</a>`)
      .replace(/\n/g, "<br>")
    return `<p style="font-size:16px;line-height:1.6;margin:0 0 16px">${escaped}</p>`
  }).join("")
}

export function messageFooter(competitionName: string, contexts: string[]): string {
  return `Saad selle kirja võistluse „${competitionName}” korraldajalt, sest oled registreerunud: ${contexts.join(", ")}. Vastamiseks vasta sellele kirjale.`
}

export function messageEmailContent(input: { competitionName: string; subject: string; body: string; contexts: string[] }) {
  const footer = messageFooter(input.competitionName, input.contexts)
  return {
    subject: input.subject.trim(),
    text: `${input.body.trim()}\n\n—\n${footer}`,
    html: `<!doctype html><html lang="et"><body style="margin:0;background:#f9fafb;font-family:Arial,sans-serif;color:#111827"><div style="max-width:600px;margin:0 auto;padding:32px 20px"><div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:28px"><p style="font-size:13px;color:#6b7280;margin:0 0 8px">${escapeHtml(input.competitionName)}</p><h1 style="font-size:22px;margin:0 0 16px">${escapeHtml(input.subject.trim())}</h1>${bodyHtml(input.body)}</div><p style="font-size:12px;color:#6b7280;margin:16px 4px">${escapeHtml(footer)}</p></div></body></html>`,
  }
}
