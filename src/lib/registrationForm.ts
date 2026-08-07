export const FORM_FIELD_TYPES = [
  "TEXT",
  "TEXTAREA",
  "NUMBER",
  "EMAIL",
  "PHONE",
  "DATE",
  "SELECT",
  "MULTISELECT",
  "CHECKBOX",
  "MEMBER_LIST",
] as const

export const FORM_SEMANTIC_KEYS = ["COUNTY", "TEAM_TYPE"] as const

export const MEMBER_FIELD_TYPES = [
  "name",
  "email",
  "phone",
  "birthDate",
] as const

export const FORM_CONDITION_OPERATORS = [
  "EQUALS",
  "NOT_EQUALS",
  "CONTAINS",
] as const

export type FormFieldType = (typeof FORM_FIELD_TYPES)[number]
export type FormSemanticKey = (typeof FORM_SEMANTIC_KEYS)[number]
export type MemberFieldType = (typeof MEMBER_FIELD_TYPES)[number]
export type FormConditionOperator =
  (typeof FORM_CONDITION_OPERATORS)[number]
export type FormPhase = "REGISTRATION" | "MANDATE"

export type MemberAnswer = {
  name: string
  email?: string
  phone?: string
  birthDate?: string
  isCaptain?: boolean
  assignmentRole?: string
}

export type FormAnswer =
  | string
  | number
  | boolean
  | string[]
  | MemberAnswer[]

export type FormAnswers = Record<string, FormAnswer>

export type FormFieldDefinition = {
  id?: string
  key: string
  label: string
  helpText: string | null
  type: FormFieldType
  semanticKey: FormSemanticKey | null
  options: string[]
  memberFields: MemberFieldType[]
  showInRegistration: boolean
  requiredInRegistration: boolean
  showInMandate: boolean
  requiredInMandate: boolean
  editableInMandate: boolean
  conditionFieldKey: string | null
  conditionOperator: FormConditionOperator | null
  conditionValue: string | null
  purgeAfterCompetition: boolean
  order: number
}

type StoredFormField = Omit<
  FormFieldDefinition,
  "type" | "semanticKey" | "options" | "memberFields" | "conditionOperator"
> & {
  type: string
  semanticKey: string | null
  options: string
  memberFields: string
  conditionOperator: string | null
}

export function isFormFieldType(value: unknown): value is FormFieldType {
  return (
    typeof value === "string" &&
    FORM_FIELD_TYPES.includes(value as FormFieldType)
  )
}

export function isFormSemanticKey(
  value: unknown
): value is FormSemanticKey {
  return (
    typeof value === "string" &&
    FORM_SEMANTIC_KEYS.includes(value as FormSemanticKey)
  )
}

export function isFormConditionOperator(
  value: unknown
): value is FormConditionOperator {
  return (
    typeof value === "string" &&
    FORM_CONDITION_OPERATORS.includes(value as FormConditionOperator)
  )
}

function parseStringArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : []
  } catch {
    return []
  }
}

export function toFormFieldDefinition(
  field: StoredFormField
): FormFieldDefinition {
  const memberFields = parseStringArray(field.memberFields).filter(
    (item): item is MemberFieldType =>
      MEMBER_FIELD_TYPES.includes(item as MemberFieldType)
  )
  const normalizedMemberFields: MemberFieldType[] =
    memberFields.length > 0
      ? Array.from(new Set(["name" as const, ...memberFields]))
      : ["name"]
  const definition = {
    ...field,
    type: isFormFieldType(field.type) ? field.type : "TEXT",
    semanticKey: isFormSemanticKey(field.semanticKey)
      ? field.semanticKey
      : null,
    options: parseStringArray(field.options),
    memberFields: normalizedMemberFields,
    conditionOperator: isFormConditionOperator(field.conditionOperator)
      ? field.conditionOperator
      : null,
  }
  return {
    ...definition,
    purgeAfterCompetition:
      Boolean(field.purgeAfterCompetition) ||
      requiresPersonalDataPurge(definition),
  }
}

export function requiresPersonalDataPurge(
  field: Pick<FormFieldDefinition, "type" | "memberFields">
): boolean {
  if (field.type === "EMAIL" || field.type === "PHONE") return true
  return (
    field.type === "MEMBER_LIST" &&
    field.memberFields.some((item) =>
      ["email", "phone", "birthDate"].includes(item)
    )
  )
}

export function serializeFormAnswer(value: FormAnswer): string {
  return JSON.stringify(value)
}

export function parseFormAnswer(value: string): FormAnswer | undefined {
  try {
    const parsed: unknown = JSON.parse(value)
    if (
      typeof parsed === "string" ||
      typeof parsed === "number" ||
      typeof parsed === "boolean"
    ) {
      return parsed
    }
    if (Array.isArray(parsed)) {
      return parsed as string[] | MemberAnswer[]
    }
  } catch {
    return undefined
  }
  return undefined
}

export function defaultFormAnswer(field: FormFieldDefinition): FormAnswer {
  if (field.type === "CHECKBOX") return false
  if (field.type === "MULTISELECT" || field.type === "MEMBER_LIST") return []
  return ""
}

function comparable(value: FormAnswer | undefined): string {
  if (typeof value === "boolean") return value ? "true" : "false"
  if (typeof value === "number") return String(value)
  if (typeof value === "string") return value
  return ""
}

export function isFormFieldVisible(
  field: FormFieldDefinition,
  answers: FormAnswers
): boolean {
  if (!field.conditionFieldKey || !field.conditionOperator) return true
  const controllingValue = answers[field.conditionFieldKey]
  const expected = field.conditionValue ?? ""

  if (field.conditionOperator === "CONTAINS") {
    return Array.isArray(controllingValue)
      ? controllingValue.some(
          (item) => typeof item === "string" && item === expected
        )
      : false
  }

  const matches = comparable(controllingValue) === expected
  return field.conditionOperator === "EQUALS" ? matches : !matches
}

function isEmptyAnswer(value: FormAnswer | undefined): boolean {
  if (value === undefined) return true
  if (typeof value === "string") return value.trim().length === 0
  if (Array.isArray(value)) return value.length === 0
  return false
}

function normalizeString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null
  const normalized = value.trim()
  return normalized.length <= maxLength ? normalized : null
}

function normalizeMembers(
  value: unknown,
  enabledFields: MemberFieldType[]
): { value?: MemberAnswer[]; error?: string } {
  if (!Array.isArray(value)) return { value: [] }
  if (value.length > 500) return { error: "Liikmete nimekiri on liiga pikk" }

  const members: MemberAnswer[] = []
  for (const rawMember of value) {
    if (!rawMember || typeof rawMember !== "object") {
      return { error: "Liikmete nimekiri on vigane" }
    }
    const raw = rawMember as Record<string, unknown>
    const hasAnyValue = enabledFields.some(
      (field) => typeof raw[field] === "string" && raw[field].trim().length > 0
    )
    if (!hasAnyValue) continue

    const name = normalizeString(raw.name, 200)
    if (!name) return { error: "Igal liikmel peab olema nimi" }
    const member: MemberAnswer = { name }

    if (enabledFields.includes("email")) {
      const email = normalizeString(raw.email ?? "", 320)
      if (email === null) return { error: "Liikme e-posti aadress on liiga pikk" }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { error: "Kontrolli liikme e-posti aadressi" }
      }
      if (email) member.email = email
    }
    if (enabledFields.includes("phone")) {
      const phone = normalizeString(raw.phone ?? "", 100)
      if (phone === null) return { error: "Liikme telefoninumber on liiga pikk" }
      if (phone) member.phone = phone
    }
    if (enabledFields.includes("birthDate")) {
      const birthDate = normalizeString(raw.birthDate ?? "", 10)
      if (birthDate === null) return { error: "Liikme sünniaeg on vigane" }
      if (
        birthDate &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) ||
          !Number.isFinite(new Date(`${birthDate}T00:00:00Z`).getTime()))
      ) {
        return { error: "Kontrolli liikme sünniaega" }
      }
      if (birthDate) member.birthDate = birthDate
    }
    if (raw.isCaptain === true) member.isCaptain = true
    const assignmentRole = normalizeString(raw.assignmentRole ?? "", 100)
    if (assignmentRole === null) return { error: "Liikmeroll on liiga pikk" }
    if (assignmentRole) member.assignmentRole = assignmentRole
    members.push(member)
  }
  return { value: members }
}

function normalizeAnswer(
  field: FormFieldDefinition,
  value: unknown
): { value?: FormAnswer; error?: string } {
  if (field.type === "CHECKBOX") {
    if (typeof value === "boolean") return { value }
    if (value === "true" || value === "false") return { value: value === "true" }
    return { value: false }
  }

  if (field.type === "NUMBER") {
    if (value === "" || value === null || value === undefined) return { value: "" }
    const numberValue =
      typeof value === "number"
        ? value
        : typeof value === "string" && value.trim() !== ""
          ? Number(value)
          : Number.NaN
    return Number.isFinite(numberValue)
      ? { value: numberValue }
      : { error: "Sisesta korrektne arv" }
  }

  if (field.type === "MULTISELECT") {
    if (!Array.isArray(value)) return { value: [] }
    const selected = Array.from(
      new Set(value.filter((item): item is string => typeof item === "string"))
    )
    return selected.every((item) => field.options.includes(item))
      ? { value: selected }
      : { error: "Valik sisaldab lubamatut väärtust" }
  }

  if (field.type === "MEMBER_LIST") {
    return normalizeMembers(value, field.memberFields)
  }

  const maxLength = field.type === "TEXTAREA" ? 5000 : 500
  const stringValue = normalizeString(value ?? "", maxLength)
  if (stringValue === null) return { error: "Vastus on liiga pikk" }

  if (field.type === "SELECT" && stringValue) {
    if (!field.options.includes(stringValue)) {
      return { error: "Vali väärtus etteantud nimekirjast" }
    }
  }
  if (
    field.type === "EMAIL" &&
    stringValue &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(stringValue)
  ) {
    return { error: "Sisesta korrektne e-posti aadress" }
  }
  if (
    field.type === "DATE" &&
    stringValue &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(stringValue) ||
      !Number.isFinite(new Date(`${stringValue}T00:00:00Z`).getTime()))
  ) {
    return { error: "Sisesta korrektne kuupäev" }
  }
  return { value: stringValue }
}

export function validateFormAnswers(
  fields: FormFieldDefinition[],
  rawAnswers: unknown,
  phase: FormPhase
): { answers: FormAnswers; errors: Record<string, string> } {
  const source =
    rawAnswers && typeof rawAnswers === "object" && !Array.isArray(rawAnswers)
      ? (rawAnswers as Record<string, unknown>)
      : {}
  const answers: FormAnswers = {}
  const errors: Record<string, string> = {}

  for (const field of [...fields].sort((a, b) => a.order - b.order)) {
    const shown =
      phase === "REGISTRATION"
        ? field.showInRegistration
        : field.showInMandate
    if (!shown || !isFormFieldVisible(field, { ...source, ...answers } as FormAnswers)) {
      continue
    }

    const result = normalizeAnswer(field, source[field.key])
    if (result.error) {
      errors[field.key] = result.error
      continue
    }
    const value = result.value ?? defaultFormAnswer(field)
    const required =
      phase === "REGISTRATION"
        ? field.requiredInRegistration
        : field.requiredInMandate
    if (
      required &&
      (isEmptyAnswer(value) ||
        (field.type === "CHECKBOX" && value !== true))
    ) {
      errors[field.key] = "Väli on kohustuslik"
      continue
    }
    answers[field.key] = value
  }

  return { answers, errors }
}

export function formatFormAnswer(
  field: FormFieldDefinition,
  value: FormAnswer | undefined
): string {
  if (value === undefined || isEmptyAnswer(value)) return "—"
  if (typeof value === "boolean") return value ? "Jah" : "Ei"
  if (typeof value === "number") return String(value)
  if (typeof value === "string") return value
  if (field.type === "MEMBER_LIST") {
    return (value as MemberAnswer[])
      .map((member) =>
        [
          member.name,
          member.email,
          member.phone,
          member.birthDate,
        ]
          .filter(Boolean)
          .join(" · ")
      )
      .join("\n")
  }
  return (value as string[]).join(", ")
}
