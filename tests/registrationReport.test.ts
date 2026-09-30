import assert from "node:assert/strict"
import test from "node:test"
import { buildRegistrationReport, filterReportRows, reportCsv, reportMatrix, reportTable, type RegistrationReport, type ReportApplication, type ReportTeam } from "../src/lib/registrationReport"
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

const summaryReport: RegistrationReport = {
  name: "Koondamine", phase: "REGISTRATION",
  columns: [{ key: "county", label: "Maakond", group: "form" }, { key: "class", label: "Klass", group: "basic" }],
  rows: [["Järva", "Sega"], ["Viru", "Sega"], ["Alutaguse", "Tüdrukud"], ["Alutaguse", "Poisid"], ["Alutaguse", "Sega"], ["Alutaguse", "Lapsevanemad"], ["Järva", "Tüdrukud"]].map(([county, className], index) => ({
    id: String(index), status: index === 0 ? "WAITLISTED" : "CONFIRMED", className,
    cells: { county, class: className, name: `Võistkond ${index + 1}` },
  })),
}

test("maakonna ja klassi kokkuvõtted loendavad valitud väljade kordused", () => {
  assert.deepEqual(reportMatrix(summaryReport, ["county"], {}, "summary"), [["Maakond", "Võistkondade arv"], ["Alutaguse", 4], ["Järva", 2], ["Viru", 1]])
  assert.deepEqual(reportMatrix(summaryReport, ["class"], {}, "summary"), [["Klass", "Võistkondade arv"], ["Sega", 3], ["Tüdrukud", 2], ["Lapsevanemad", 1], ["Poisid", 1]])
  assert.equal(reportTable(summaryReport, ["county", "class"], {}, "summary").rows.length, 7)
  assert.equal(reportTable(summaryReport, ["county"], {}, "teams").rows.length, 7)
})

test("filtrid rakenduvad enne loendamist ja eksport järgib tabeli kokkuvõtet", () => {
  const filters = { status: "CONFIRMED", className: "Sega" }
  const table = reportTable(summaryReport, ["county"], filters, "summary")
  assert.equal(table.rows.reduce((sum, row) => sum + Number(row.cells["summary:count"]), 0), 2)
  assert.deepEqual(reportMatrix(summaryReport, ["county"], filters, "summary"), [["Maakond", "Võistkondade arv"], ["Alutaguse", 1], ["Viru", 1]])
  assert.deepEqual(reportMatrix(summaryReport, ["county"], { search: "Võistkond 1" }, "summary"), [["Maakond", "Võistkondade arv"], ["Järva", 1]])
  assert.deepEqual(reportMatrix(summaryReport, ["county"], { search: "Puuduv" }, "summary"), [["Maakond", "Võistkondade arv"]])
  assert.deepEqual(reportTable(summaryReport, [], {}, "summary"), { columns: [], rows: [] })
})

test("vormivastuse filter piirab nii kokkuvõtet kui ka võistkondade eksporti", () => {
  const filters = { answers: { county: "Alutaguse" } }
  assert.deepEqual(reportMatrix(summaryReport, ["county"], filters, "summary"), [["Maakond", "Võistkondade arv"], ["Alutaguse", 4]])
  assert.equal(reportTable(summaryReport, ["class"], filters, "teams").rows.length, 4)
  assert.deepEqual(reportMatrix(summaryReport, ["county"], { ...filters, className: "Sega", status: "CONFIRMED" }, "summary"), [["Maakond", "Võistkondade arv"], ["Alutaguse", 1]])
  assert.equal(filterReportRows(summaryReport.rows, { answers: { county: "Alutaguse", class: "Poisid" } }).length, 1)
  assert.equal(filterReportRows(summaryReport.rows, { answers: { county: "puuduv" } }).length, 0)
  assert.equal(filterReportRows(report().rows, { answers: { "field:count": "0", "field:consent": "Ei" } }).length, 1)
  assert.equal(filterReportRows(report().rows, { answers: { "field:count": "" } }).length, 1)
})

test("koondamine säilitab tühjad vastused ja eristab arvu tekstist ning väärtuste kombinatsioone", () => {
  const report: RegistrationReport = { ...summaryReport, rows: [
    { id: "1", status: "CONFIRMED", className: "", cells: { county: "", class: "" } },
    { id: "2", status: "CONFIRMED", className: "", cells: { county: "", class: "" } },
    { id: "3", status: "CONFIRMED", className: "", cells: { county: 0, class: "" } },
    { id: "4", status: "CONFIRMED", className: "", cells: { county: "0", class: "" } },
    { id: "5", status: "CONFIRMED", className: "", cells: { county: "a,b", class: "c" } },
    { id: "6", status: "CONFIRMED", className: "", cells: { county: "a", class: "b,c" } },
  ] }
  const table = reportTable(report, ["county", "class"], {}, "summary")
  assert.equal(table.rows.length, 5)
  assert.equal(table.rows[0].cells["summary:count"], 2)
  assert.equal(report.rows[0].cells["summary:count"], undefined)
  const mandate = reportTable({ ...report, phase: "MANDATE" }, ["county"], {}, "summary")
  assert.equal(mandate.rows[0].cells["summary:count"], 2)
})
