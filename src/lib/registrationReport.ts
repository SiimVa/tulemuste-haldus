import { formatFormAnswer, isFormFieldVisible, parseFormAnswer, type FormFieldDefinition, type FormPhase, type MemberAnswer } from "./registrationForm"

export type ReportColumn = { key: string; label: string; group: "basic" | "form" }
export type ReportRow = {
  id: string
  status: string
  className: string
  cells: Record<string, string | number>
}
export type RegistrationReport = { name: string; phase: FormPhase; columns: ReportColumn[]; rows: ReportRow[] }
export type ReportFilters = { status?: string; className?: string; search?: string; answers?: Record<string, string> }
export type ReportView = "teams" | "summary"
export type ReportTable = { columns: ReportColumn[]; rows: Pick<ReportRow, "id" | "cells">[] }
type Values = { fieldId: string; value: string }[]
export type ReportApplication = {
  id: string; teamName: string; status: string; teamId: string | null
  class: { name: string } | null; team: { code: string } | null
  submittedBy: { name: string; email: string }; submittedAt: Date | null
  waitlistPosition: number | null; allocationReason: string | null; fieldValues: Values
}
export type ReportTeam = {
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

function date(value: Date | null): string {
  return value ? new Intl.DateTimeFormat("et-EE", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Tallinn" }).format(value) : ""
}

function formCells(fields: FormFieldDefinition[], values: Values) {
  const byId = new Map(values.map(value => [value.fieldId, parseFormAnswer(value.value)]))
  const answers = Object.fromEntries(fields.flatMap(field => {
    const value = byId.get(field.id ?? "")
    return value === undefined ? [] : [[field.key, value]]
  }))
  return Object.fromEntries(fields.map(field => {
    const value = byId.get(field.id ?? "")
    let formatted = ""
    if (value !== undefined && isFormFieldVisible(field, answers)) {
      if (field.type === "MEMBER_LIST" && Array.isArray(value)) {
        formatted = (value as MemberAnswer[]).map(member => [member.name, member.email, member.phone, member.birthDate, member.isCaptain ? "Kapten" : "", member.assignmentRole].filter(Boolean).join(" · ")).join("\n")
      } else {
        formatted = formatFormAnswer(field, value)
      }
    }
    return [`field:${field.id}`, typeof value === "number" && formatted !== "" ? value : formatted]
  }))
}

export function buildRegistrationReport(input: {
  name: string; phase: FormPhase; fields: FormFieldDefinition[]; applications: ReportApplication[]; teams: ReportTeam[]
}): RegistrationReport {
  const mandate = input.phase === "MANDATE"
  const fields = [...input.fields].filter(field => mandate ? field.showInMandate : field.showInRegistration).sort((a, b) => a.order - b.order)
  const basic = [
    ["code", "Tähis"], ["name", "Võistkond"], ["class", "Klass"],
    ["status", mandate ? "Mandaadi staatus" : "Registreerimise staatus"],
    ["representative", mandate ? "Esindaja" : "Esitaja / esindaja"], ["email", "E-post"],
    ["submittedAt", "Esitatud (Eesti aeg)"], ["note", "Märkus"],
    ...(mandate ? [["members", "Mandaadi koosseis"], ["memberCount", "Liikmete arv"]] : [["waitlist", "Ootenimekirja koht"]]),
  ]
  const columns: ReportColumn[] = [
    ...basic.map(([key, label]) => ({ key, label, group: "basic" as const })),
    ...fields.map(field => ({ key: `field:${field.id}`, label: field.label, group: "form" as const })),
  ]
  const linkedTeams = new Set(input.applications.map(application => application.teamId).filter(Boolean))
  const rows: ReportRow[] = mandate ? [] : input.applications.map(application => ({
    id: `application:${application.id}`, status: application.status, className: application.class?.name ?? "",
    cells: {
      code: application.team?.code ?? "", name: application.teamName, class: application.class?.name ?? "",
      status: REPORT_STATUS_LABELS[application.status] ?? application.status,
      representative: application.submittedBy.name, email: application.submittedBy.email,
      submittedAt: date(application.submittedAt), note: application.allocationReason ?? "", waitlist: application.waitlistPosition ?? "",
      ...formCells(input.fields, application.fieldValues),
    },
  }))
  for (const team of input.teams) {
    // A finalized application and its team are one registration, not two.
    if (!mandate && linkedTeams.has(team.id)) continue
    const status = mandate ? team.mandateStatus : team.registrationStatus
    rows.push({
      id: `team:${team.id}`, status, className: team.class ?? "",
      cells: {
        code: team.code, name: team.name, class: team.class ?? "", status: REPORT_STATUS_LABELS[status] ?? status,
        representative: team.representative?.member.user.name ?? "", email: team.representative?.member.user.email ?? "",
        submittedAt: date(mandate ? team.mandateSubmittedAt : team.registrationSubmittedAt),
        note: (mandate ? team.mandateReviewNote : team.registrationReviewNote) ?? "", waitlist: "",
        members: team.members.map(member => [member.name, member.email, member.role === "SUPPORT" ? "Tugiliige" : "Võistleja", member.isCaptain ? "Kapten" : "", member.assignmentRole].filter(Boolean).join(" · ")).join("\n"),
        memberCount: team.members.length, ...formCells(input.fields, team.formValues),
      },
    })
  }
  // Only phase-appropriate columns leave the server.
  return { name: input.name, phase: input.phase, columns, rows: rows.map(row => ({ ...row, cells: Object.fromEntries(columns.map(column => [column.key, row.cells[column.key] ?? ""])) })) }
}

export function filterReportRows(rows: ReportRow[], filters: ReportFilters): ReportRow[] {
  const search = filters.search?.trim().toLocaleLowerCase("et")
  return rows.filter(row => (!filters.status || row.status === filters.status)
    && (filters.className === undefined || row.className === filters.className)
    && Object.entries(filters.answers ?? {}).every(([key, value]) => String(row.cells[key] ?? "") === value)
    && (!search || [row.cells.name, row.cells.code, row.cells.representative, row.cells.email].some(value => String(value ?? "").toLocaleLowerCase("et").includes(search))))
}

export function reportTable(report: RegistrationReport, selected: string[] | undefined, filters: ReportFilters = {}, view: ReportView = "teams"): ReportTable {
  const keys = selected === undefined ? null : new Set(selected)
  const columns = report.columns.filter(column => keys === null || keys.has(column.key))
  const rows = filterReportRows(report.rows, filters)
  if (view === "teams") return { columns, rows }
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
  const table = reportTable(report, selected, filters, view)
  return [table.columns.map(column => column.label), ...table.rows.map(row => table.columns.map(column => row.cells[column.key] ?? ""))]
}

export function reportCsv(matrix: (string | number)[][]): string {
  return "\uFEFF" + matrix.map(row => row.map(value => {
    // User-entered text must not become a spreadsheet formula when opening CSV.
    const safe = typeof value === "string" && /^[\s\uFEFF]*[=+@-]/.test(value) ? `'${value}` : String(value)
    return `"${safe.replace(/"/g, '""')}"`
  }).join(",")).join("\r\n")
}
