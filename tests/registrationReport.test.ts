import assert from "node:assert/strict"
import test from "node:test"
import { buildRegistrationReport, filterReportRows, reportCsv, reportMatrix, type ReportApplication, type ReportTeam } from "../src/lib/registrationReport"
import { representativeFormFields, type FormFieldDefinition } from "../src/lib/registrationForm"

const field = (id: string, overrides: Partial<FormFieldDefinition> = {}): FormFieldDefinition => ({ ...representativeFormFields()[0], id, key: id, label: id, ...overrides })
const fields = [field("county"), field("consent", { type: "CHECKBOX" }), field("count", { type: "NUMBER" }), field("food", { type: "MULTISELECT" }), field("members", { type: "MEMBER_LIST" }), field("mandateOnly", { showInRegistration: false })]
const values = (answers: Record<string, unknown>) => Object.entries(answers).map(([fieldId, value]) => ({ fieldId, value: JSON.stringify(value) }))
const application: ReportApplication = {
  id: "a", teamName: "Öökullid", status: "CONFIRMED", teamId: "t", class: { name: "Noored" }, team: { code: "01" },
  submittedBy: { name: "Esitaja", email: "esitaja@example.com" }, submittedAt: new Date("2026-09-28T09:00:00Z"), waitlistPosition: null, allocationReason: null,
  fieldValues: values({ county: "Tartu", consent: false, count: 0, food: ["Taimne", "Gluteenivaba"], members: [{ name: "Mari", email: "mari@example.com", phone: "01234", birthDate: "2000-01-01", isCaptain: true, assignmentRole: "Navigeerija" }], mandateOnly: "Ei kuulu registreerimisse" }),
}
const team: ReportTeam = {
  id: "t", code: "01", name: "Öökullid", class: "Noored", registrationStatus: "APPROVED", registrationSubmittedAt: null, registrationReviewNote: null,
  mandateStatus: "SUBMITTED", mandateSubmittedAt: new Date("2026-09-28T10:00:00Z"), mandateReviewNote: "Kontrollida",
  representative: { member: { user: { name: "Esindaja", email: "esindaja@example.com" } } }, formValues: values({ county: "Harju", mandateOnly: "Lõplik vastus" }),
  members: [{ name: "Jüri", email: "jyri@example.com", role: "SUPPORT", isCaptain: true, assignmentRole: "Autojuht" }],
}
const report = (phase: "REGISTRATION" | "MANDATE" = "REGISTRATION") => buildRegistrationReport({ name: "Võistlus", phase, fields, applications: [application], teams: [team, { ...team, id: "legacy", code: "02", class: null, name: "Varasem võistkond" }] })

test("registreerimise aruanne säilitab avalduse vastused ja ei dubleeri loodud võistkonda", () => {
  const result = report()
  assert.equal(result.rows.length, 2)
  assert.equal(result.rows[0].cells["field:county"], "Tartu")
  assert.equal(result.rows[1].cells["field:county"], "Harju")
  assert.equal(result.rows[0].cells["field:consent"], "Ei")
  assert.equal(result.rows[0].cells["field:count"], 0)
  assert.equal(result.rows[0].cells["field:food"], "Taimne, Gluteenivaba")
  assert.equal(result.rows[0].cells["field:members"], "Mari · mari@example.com · 01234 · 2000-01-01 · Kapten · Navigeerija")
  assert.equal(result.rows[0].cells["field:mandateOnly"], undefined)
  assert.equal(result.rows[0].cells.members, undefined)
})

test("mandaat kasutab praeguseid vastuseid, koosseisu, rolli ja etapi staatust", () => {
  const result = report("MANDATE")
  assert.equal(result.rows.length, 2)
  assert.equal(result.rows[0].status, "SUBMITTED")
  assert.equal(result.rows[0].cells["field:county"], "Harju")
  assert.equal(result.rows[0].cells["field:mandateOnly"], "Lõplik vastus")
  assert.equal(result.rows[0].cells.note, "Kontrollida")
  assert.equal(result.rows[0].cells.memberCount, 1)
  assert.equal(result.rows[0].cells.members, "Jüri · jyri@example.com · Tugiliige · Kapten · Autojuht")
})

test("valitud veergude ja filtritega eksport sisaldab ainult nähtavaid ridu ja välju", () => {
  assert.deepEqual(reportMatrix(report(), ["name", "field:county"], { status: "CONFIRMED", className: "Noored", search: "ÖÖK" }), [["Võistkond", "county"], ["Öökullid", "Tartu"]])
  assert.equal(filterReportRows(report().rows, { className: "" }).length, 1)
  assert.deepEqual(reportMatrix(report(), ["name"], { search: "puuduv" }), [["Võistkond"]])
})

test("tühjad, kustutatud ja tingimuslikult peidetud vastused ei tekita andmeid", () => {
  const result = buildRegistrationReport({ name: "Test", phase: "REGISTRATION", fields: [field("county"), field("hidden", { conditionFieldKey: "county", conditionOperator: "EQUALS", conditionValue: "Harju" })], applications: [{ ...application, fieldValues: [...application.fieldValues, ...values({ hidden: "Vana peidetud vastus" })] }], teams: [] })
  assert.equal(result.rows[0].cells["field:hidden"], "")
  assert.deepEqual(buildRegistrationReport({ name: "Tühi", phase: "REGISTRATION", fields: [], applications: [], teams: [] }).rows, [])
  const purged = buildRegistrationReport({ name: "Test", phase: "REGISTRATION", fields, applications: [{ ...application, fieldValues: [] }], teams: [] })
  assert.equal(purged.rows[0].cells["field:members"], "")
})

test("CSV säilitab täpitähed, reavahetused ja jutumärgid ning neutraliseerib tekstivalemid", () => {
  const csv = reportCsv([["Nimi", "Vastus"], ['Öö, "tiim"', "rida 1\nrida 2"], ["=1+1", " +SUM(A1)"], [-2, 0]])
  assert.ok(csv.startsWith("\uFEFF"))
  assert.ok(csv.includes('"Öö, ""tiim""","rida 1\nrida 2"'))
  assert.ok(csv.includes("'=1+1"))
  assert.ok(csv.includes("' +SUM(A1)"))
  assert.ok(csv.endsWith('"-2","0"'))
})
