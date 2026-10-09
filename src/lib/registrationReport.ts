import { applicationRepresentativeIdentity, teamRepresentativeIdentity, currentRepresentativeAnswers, type RepresentativeIdentity } from "./representativeIdentity"
import { csvRow } from "./csv"
import {
  REPRESENTATIVE_FORM_FIELD_KEYS,
  formatFormAnswer,
  isFormFieldVisible,
  isRepresentativeFormField,
  parseFormAnswer,
  type FormAnswer,
  type FormFieldDefinition,
  type FormPhase,
  type MemberAnswer,
} from "./registrationForm"

// "members" veerud näitavad koosseisu kokkuvõtet; liikmete üksikandmed on
// eraldi ReportRow.members massiivis ja eksporditakse liikmete lehele.
export type ReportColumn = { key: string; label: string; group: "basic" | "form" | "members" }
export type ReportMember = {
  list: string
  name: string
  email: string
  phone: string
  birthDate: string
  captain: boolean
  assignmentRole: string
  role: string
}
export type ReportRow = {
  id: string
  status: string
  className: string
  cells: Record<string, string | number>
  // Ainult serveris (eksport); ülevaate API neid brauserisse ei saada.
  members?: ReportMember[]
}
export type RegistrationReport = { name: string; phase: FormPhase; columns: ReportColumn[]; rows: ReportRow[] }
export type ReportFilters = { status?: string; className?: string; search?: string; answers?: Record<string, string> }
export type ReportView = "teams" | "summary" | "members"
export type ReportTable = { columns: ReportColumn[]; rows: Pick<ReportRow, "id" | "cells">[] }
type Values = { fieldId: string; value: string }[]
export type ReportApplication = {
  representative?: RepresentativeIdentity | null
  pendingRepresentativeName?: string | null; pendingRepresentativeEmail?: string | null
  id: string; teamName: string; status: string; teamId: string | null
  class: { name: string } | null; team: { code: string } | null
  submittedBy: { name: string; email: string }; submittedAt: Date | null
  waitlistPosition: number | null; allocationReason: string | null; fieldValues: Values
}
export type ReportTeam = {
  pendingRepresentativeName?: string | null; pendingRepresentativeEmail?: string | null
  id: string; code: string; name: string; class: string | null
  registrationStatus: string; registrationSubmittedAt: Date | null; registrationReviewNote: string | null
  mandateStatus: string; mandateSubmittedAt: Date | null; mandateReviewNote: string | null
  representative: { member: { user: { name: string; email: string } } } | null
  formValues: Values
  members: { name: string; email: string | null; role: string; isCaptain: boolean; assignmentRole: string | null }[]
}

export const REPORT_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Mustand", PENDING_REVIEW: "Ootab ülevaatamist", CHANGES_REQUESTED: "Vajab täiendamist",
  CONFIRMED: "Registreeritud", WAITLISTED: "Ootenimekirjas", REJECTED: "Tagasi lükatud",
  WITHDRAWN: "Loobunud", SUBMITTED: "Esitatud", APPROVED: "Kinnitatud",
}
const MEMBER_ROLE_LABELS: Record<string, string> = { COMPETITOR: "Võistleja", SUPPORT: "Tugiliige" }
const DEFAULT_MEMBER_LIST = "Liikmed"

function date(value: Date | null): string {
  return value ? new Intl.DateTimeFormat("et-EE", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Tallinn" }).format(value) : ""
}

// Sünniaeg on vormis kujul AAAA-KK-PP; eksport näitab eesti kujul.
function birthDate(value: string | undefined): string {
  const raw = (value ?? "").trim()
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
  return match ? `${match[3]}.${match[2]}.${match[1]}` : raw
}

const text = (value: FormAnswer | undefined) => (typeof value === "string" ? value.trim() : "")
const normalized = (value: string | null | undefined) => (value ?? "").trim().toLocaleLowerCase("et")

function isMemberAnswer(value: unknown): value is MemberAnswer {
  return typeof value === "object" && value !== null && typeof (value as MemberAnswer).name === "string" && (value as MemberAnswer).name.trim() !== ""
}

function answerMember(list: string, member: MemberAnswer): ReportMember {
  return {
    list,
    name: member.name.trim(),
    email: member.email?.trim() ?? "",
    phone: member.phone?.trim() ?? "",
    birthDate: birthDate(member.birthDate),
    captain: Boolean(member.isCaptain),
    assignmentRole: member.assignmentRole?.trim() ?? "",
    role: "",
  }
}

export function memberNames(members: ReportMember[]): string {
  return members.map(member => `${member.name}${member.captain ? " (kapten)" : ""}${member.role === MEMBER_ROLE_LABELS.SUPPORT ? " (tugiliige)" : ""}`).join(", ")
}

type ParsedAnswers = { byId: Map<string, FormAnswer | undefined>; byKey: Record<string, FormAnswer> }

function parseAnswers(fields: FormFieldDefinition[], values: Values): ParsedAnswers {
  const byId = new Map(values.map(value => [value.fieldId, parseFormAnswer(value.value)]))
  const byKey = Object.fromEntries(fields.flatMap(field => {
    const value = byId.get(field.id ?? "")
    return value === undefined ? [] : [[field.key, value]]
  })) as Record<string, FormAnswer>
  return { byId, byKey }
}

function formCells(fields: FormFieldDefinition[], answers: ParsedAnswers) {
  return Object.fromEntries(fields.map(field => {
    const value = answers.byId.get(field.id ?? "")
    const formatted = value !== undefined && isFormFieldVisible(field, answers.byKey) ? formatFormAnswer(field, value) : ""
    // „—” on vormi kuvamise tühi väärtus; tabelis ja ekspordis on tühi lahter.
    const cell = formatted === "—" ? "" : formatted
    return [`field:${field.id}`, typeof value === "number" && cell !== "" ? value : cell]
  }))
}

function answeredMembers(memberFields: FormFieldDefinition[], answers: ParsedAnswers): ReportMember[] {
  return memberFields.flatMap(field => {
    const value = answers.byId.get(field.id ?? "")
    if (!Array.isArray(value) || !isFormFieldVisible(field, answers.byKey)) return []
    return value.filter(isMemberAnswer).map(member => answerMember(field.label, member))
  })
}

// Mandaadi koosseis on võistkonna liikmete tabelis; telefon ja sünniaeg on
// liikmete vormivastuses, mis seotakse nime või e-posti järgi.
function teamMembers(team: ReportTeam, answered: ReportMember[]): ReportMember[] {
  const unused = [...answered]
  return team.members.map(member => {
    let index = unused.findIndex(candidate => normalized(candidate.name) === normalized(member.name))
    if (index < 0 && member.email) index = unused.findIndex(candidate => candidate.email !== "" && normalized(candidate.email) === normalized(member.email))
    const match = index >= 0 ? unused.splice(index, 1)[0] : null
    return {
      list: match?.list ?? DEFAULT_MEMBER_LIST,
      name: member.name.trim(),
      email: member.email?.trim() || match?.email || "",
      phone: match?.phone ?? "",
      birthDate: match?.birthDate ?? "",
      captain: member.isCaptain,
      assignmentRole: member.assignmentRole?.trim() || match?.assignmentRole || "",
      role: MEMBER_ROLE_LABELS[member.role] ?? member.role,
    }
  })
}

export function buildRegistrationReport(input: {
  name: string; phase: FormPhase; fields: FormFieldDefinition[]; applications: ReportApplication[]; teams: ReportTeam[]
}): RegistrationReport {
  const mandate = input.phase === "MANDATE"
  const phaseFields = [...input.fields].filter(field => mandate ? field.showInMandate : field.showInRegistration).sort((a, b) => a.order - b.order)
  // Esindaja süsteemiväljad on esindaja veergudes ja liikmete loend liikmete
  // veergudes, et samad andmed ei korduks.
  const formFields = phaseFields.filter(field => field.type !== "MEMBER_LIST" && !isRepresentativeFormField(field.key))
  const memberFields = phaseFields.filter(field => field.type === "MEMBER_LIST")
  // Mandaadi koosseisu täiendamiseks sobivad ka ainult registreerimisel küsitud loendid.
  const allMemberFields = input.fields.filter(field => field.type === "MEMBER_LIST")
  const basic: [string, string][] = [
    ["code", "Tähis"], ["name", "Võistkond"], ["class", "Klass"],
    ["status", mandate ? "Mandaadi staatus" : "Registreerimise staatus"],
    ["representative", "Esindaja"], ["email", "Esindaja e-post"], ["phone", "Esindaja telefon"],
    ["submittedAt", "Esitatud (Eesti aeg)"], ["note", "Märkus"],
    ...(mandate ? [] : [["waitlist", "Ootenimekirja koht"]] as [string, string][]),
  ]
  const columns: ReportColumn[] = [
    ...basic.map(([key, label]) => ({ key, label, group: "basic" as const })),
    { key: "memberCount", label: "Liikmete arv", group: "members" },
    { key: "members", label: "Liikmed", group: "members" },
    ...formFields.map(field => ({ key: `field:${field.id}`, label: field.label, group: "form" as const })),
  ]
  const linkedTeams = new Set(input.applications.map(application => application.teamId).filter(Boolean))
  const rows: ReportRow[] = mandate ? [] : input.applications.map(application => {
    const answers = parseAnswers(input.fields, application.fieldValues)
    const members = answeredMembers(memberFields, answers)
    const currentTeam = input.teams.find(team => team.id === application.teamId)
    const identity = currentTeam ? teamRepresentativeIdentity(currentTeam) : applicationRepresentativeIdentity(application)
    const contacts = currentRepresentativeAnswers(currentTeam ? parseAnswers(input.fields, currentTeam.formValues).byKey : answers.byKey, identity)
    return {
      id: `application:${application.id}`, status: application.status, className: application.class?.name ?? "", members,
      cells: {
        code: application.team?.code ?? "", name: application.teamName, class: application.class?.name ?? "",
        status: REPORT_STATUS_LABELS[application.status] ?? application.status,
        representative: text(contacts[REPRESENTATIVE_FORM_FIELD_KEYS.name]),
        email: text(contacts[REPRESENTATIVE_FORM_FIELD_KEYS.email]),
        phone: text(contacts[REPRESENTATIVE_FORM_FIELD_KEYS.phone]),
        submittedAt: date(application.submittedAt), note: application.allocationReason ?? "", waitlist: application.waitlistPosition ?? "",
        memberCount: members.length, members: memberNames(members),
        ...formCells(formFields, answers),
      },
    }
  })
  for (const team of input.teams) {
    // A finalized application and its team are one registration, not two.
    if (!mandate && linkedTeams.has(team.id)) continue
    const status = mandate ? team.mandateStatus : team.registrationStatus
    const answers = parseAnswers(input.fields, team.formValues)
    const contacts = currentRepresentativeAnswers(answers.byKey, teamRepresentativeIdentity(team))
    const answered = answeredMembers(mandate ? allMemberFields : memberFields, answers)
    const members = mandate || answered.length === 0 ? teamMembers(team, answered) : answered
    rows.push({
      id: `team:${team.id}`, status, className: team.class ?? "", members,
      cells: {
        code: team.code, name: team.name, class: team.class ?? "", status: REPORT_STATUS_LABELS[status] ?? status,
        representative: text(contacts[REPRESENTATIVE_FORM_FIELD_KEYS.name]),
        email: text(contacts[REPRESENTATIVE_FORM_FIELD_KEYS.email]),
        phone: text(contacts[REPRESENTATIVE_FORM_FIELD_KEYS.phone]),
        submittedAt: date(mandate ? team.mandateSubmittedAt : team.registrationSubmittedAt),
        note: (mandate ? team.mandateReviewNote : team.registrationReviewNote) ?? "", waitlist: "",
        memberCount: members.length, members: memberNames(members),
        ...formCells(formFields, answers),
      },
    })
  }
  // Only phase-appropriate columns leave the server.
  return { name: input.name, phase: input.phase, columns, rows: rows.map(row => ({ ...row, cells: Object.fromEntries(columns.map(column => [column.key, row.cells[column.key] ?? ""])) })) }
}

export function filterReportRows<T extends Pick<ReportRow, "status" | "className" | "cells">>(rows: T[], filters: ReportFilters): T[] {
  const search = filters.search?.trim().toLocaleLowerCase("et")
  return rows.filter(row => (!filters.status || row.status === filters.status)
    && (filters.className === undefined || row.className === filters.className)
    && Object.entries(filters.answers ?? {}).every(([key, value]) => String(row.cells[key] ?? "") === value)
    && (!search || [row.cells.name, row.cells.code, row.cells.representative, row.cells.email].some(value => String(value ?? "").toLocaleLowerCase("et").includes(search))))
}

export function reportTable(report: RegistrationReport, selected: string[] | undefined, filters: ReportFilters = {}, view: ReportView = "teams"): ReportTable {
  const keys = selected === undefined ? null : new Set(selected)
  const columns = report.columns.filter(column => keys === null || keys.has(column.key))
  const rows = filterReportRows(report.rows, filters).map(row => ({ id: row.id, cells: row.cells }))
  if (view !== "summary") return { columns, rows }
  if (columns.length === 0) return { columns, rows: [] }

  // Group only by the selected cells: hidden names, IDs and statuses must not
  // split a county/class summary. Filtering happens before counting.
  const groups = new Map<string, Pick<ReportRow, "id" | "cells">>()
  for (const row of rows) {
    const values = columns.map(column => row.cells[column.key] ?? "")
    const key = JSON.stringify(values)
    const group = groups.get(key)
    if (group) group.cells["summary:count"] = Number(group.cells["summary:count"]) + 1
    else groups.set(key, {
      id: key,
      cells: { ...Object.fromEntries(columns.map((column, index) => [column.key, values[index]])), "summary:count": 1 },
    })
  }
  const groupedRows = [...groups.values()].sort((a, b) => {
    const countDifference = Number(b.cells["summary:count"]) - Number(a.cells["summary:count"])
    if (countDifference) return countDifference
    for (const column of columns) {
      const difference = String(a.cells[column.key]).localeCompare(String(b.cells[column.key]), "et", { numeric: true })
      if (difference) return difference
    }
    return 0
  })
  return { columns: [...columns, { key: "summary:count", label: "Võistkondade arv", group: "basic" }], rows: groupedRows }
}

export function reportMatrix(report: RegistrationReport, selected: string[] | undefined, filters: ReportFilters = {}, view: ReportView = "teams"): (string | number)[][] {
  if (view === "members") return reportMembersMatrix(report, filters)
  const table = reportTable(report, selected, filters, view)
  return [table.columns.map(column => column.label), ...table.rows.map(row => table.columns.map(column => row.cells[column.key] ?? ""))]
}

type MemberItem = { row: ReportRow; member: ReportMember; index: number }

// Üks rida liikme kohta. Veerud, mis on kõigil tühjad, jäetakse välja.
export function reportMembersMatrix(report: RegistrationReport, filters: ReportFilters = {}): (string | number)[][] {
  const items: MemberItem[] = filterReportRows(report.rows, filters).flatMap(row => (row.members ?? []).map((member, index) => ({ row, member, index })))
  const lists = new Set(items.map(item => item.member.list))
  const columns: { label: string; value: (item: MemberItem) => string | number; always?: boolean }[] = [
    { label: "Tähis", value: item => item.row.cells.code ?? "", always: true },
    { label: "Võistkond", value: item => item.row.cells.name ?? "", always: true },
    { label: "Klass", value: item => item.row.cells.class ?? "", always: true },
    { label: report.phase === "MANDATE" ? "Mandaadi staatus" : "Registreerimise staatus", value: item => item.row.cells.status ?? "", always: true },
    ...(lists.size > 1 ? [{ label: "Nimekiri", value: (item: MemberItem) => item.member.list, always: true }] : []),
    { label: "Nr", value: item => item.index + 1, always: true },
    { label: "Nimi", value: item => item.member.name, always: true },
    { label: "E-post", value: item => item.member.email },
    { label: "Telefon", value: item => item.member.phone },
    { label: "Sünniaeg", value: item => item.member.birthDate },
    { label: "Kapten", value: item => (item.member.captain ? "Jah" : "") },
    { label: "Ülesanne", value: item => item.member.assignmentRole },
    { label: "Roll", value: item => item.member.role },
  ]
  const used = columns.filter(column => column.always || items.some(item => column.value(item) !== ""))
  return [used.map(column => column.label), ...items.map(item => used.map(column => column.value(item)))]
}

export function reportCsv(matrix: (string | number)[][]): string {
  return "﻿" + matrix.map(csvRow).join("\r\n")
}
