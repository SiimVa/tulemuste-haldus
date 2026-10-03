import assert from "node:assert/strict"
import test from "node:test"
import { buildRegistrationReport, filterReportRows, reportCsv, reportMatrix, reportMembersMatrix, reportTable, type RegistrationReport, type ReportApplication, type ReportTeam } from "../src/lib/registrationReport"
import { REPRESENTATIVE_FORM_FIELD_KEYS, representativeFormFields, type FormFieldDefinition } from "../src/lib/registrationForm"

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
  // Liikmete loend ei ole vormiveerg: tabelis on nimed, üksikandmed liikmete lehel.
  assert.equal(result.rows[0].cells["field:members"], undefined)
  assert.equal(result.rows[0].cells.members, "Mari (kapten)")
  assert.equal(result.rows[0].cells.memberCount, 1)
  assert.deepEqual(result.rows[0].members, [{ list: "members", name: "Mari", email: "mari@example.com", phone: "01234", birthDate: "01.01.2000", captain: true, assignmentRole: "Navigeerija", role: "" }])
  assert.equal(result.rows[0].cells["field:mandateOnly"], undefined)
  assert.ok(!result.columns.some(column => column.key === "field:members"))
})

test("mandaat kasutab praeguseid vastuseid, koosseisu, rolli ja etapi staatust", () => {
  const result = report("MANDATE")
  assert.equal(result.rows.length, 2)
  assert.equal(result.rows[0].status, "SUBMITTED")
  assert.equal(result.rows[0].cells["field:county"], "Harju")
  assert.equal(result.rows[0].cells["field:mandateOnly"], "Lõplik vastus")
  assert.equal(result.rows[0].cells.note, "Kontrollida")
  assert.equal(result.rows[0].cells.memberCount, 1)
  assert.equal(result.rows[0].cells.members, "Jüri (kapten) (tugiliige)")
  assert.deepEqual(result.rows[0].members, [{ list: "Liikmed", name: "Jüri", email: "jyri@example.com", phone: "", birthDate: "", captain: true, assignmentRole: "Autojuht", role: "Tugiliige" }])
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
  assert.equal(purged.rows[0].cells.members, "")
  assert.equal(purged.rows[0].cells.memberCount, 0)
  // Tühi vastus on tühi lahter, mitte vormi kriips.
  const blank = buildRegistrationReport({ name: "Test", phase: "REGISTRATION", fields, applications: [{ ...application, fieldValues: values({ county: "  " }) }], teams: [] })
  assert.equal(blank.rows[0].cells["field:county"], "")
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

const systemFields = representativeFormFields(10).map((item, index) => ({ ...item, id: `rep${index}` }))
const repAnswers = (name: string, email: string, phone: string) => [
  { fieldId: "rep0", value: JSON.stringify(name) }, { fieldId: "rep1", value: JSON.stringify(email) }, { fieldId: "rep2", value: JSON.stringify(phone) },
]

test("esindaja andmed on ühes kohas ega kordu vormiveergudena", () => {
  const result = buildRegistrationReport({
    name: "Esindajad", phase: "REGISTRATION", fields: [...fields, ...systemFields],
    applications: [
      { ...application, fieldValues: [...application.fieldValues, ...repAnswers("Robi Abel", "robi@example.com", "5555 1234")] },
      { ...application, id: "b", teamId: null, team: null, pendingRepresentativeName: "Kontota Esindaja", pendingRepresentativeEmail: "kontota@example.com", fieldValues: [] },
    ],
    teams: [{ ...team, id: "legacy", formValues: repAnswers("Vana nimi", "vana@example.com", "5000 0000") }],
  })
  assert.deepEqual(result.columns.filter(column => column.group === "basic").map(column => column.label).slice(4, 7), ["Esindaja", "Esindaja e-post", "Esindaja telefon"])
  assert.ok(!result.columns.some(column => systemFields.some(field => column.key === `field:${field.id}`)))
  assert.ok(!result.columns.some(column => column.label === "Esitaja / esindaja" || column.label === "E-post"))
  assert.deepEqual([result.rows[0].cells.representative, result.rows[0].cells.email, result.rows[0].cells.phone], ["Robi Abel", "robi@example.com", "5555 1234"])
  assert.deepEqual([result.rows[1].cells.representative, result.rows[1].cells.email, result.rows[1].cells.phone], ["Kontota Esindaja", "kontota@example.com", ""])
  // Võistkonnaga seotud konto on esindaja; telefon tuleb vormist.
  assert.deepEqual([result.rows[2].cells.representative, result.rows[2].cells.email, result.rows[2].cells.phone], ["Esindaja", "esindaja@example.com", "5000 0000"])
  assert.equal(REPRESENTATIVE_FORM_FIELD_KEYS.phone, systemFields[2].key)
})

test("liikmete leht: üks rida liikme kohta, filtrid kehtivad ja tühjad veerud jäävad välja", () => {
  const helpers = field("helpers", { type: "MEMBER_LIST", label: "Saatjad" })
  const twoLists = buildRegistrationReport({
    name: "Liikmed", phase: "REGISTRATION", fields: [...fields, helpers],
    applications: [
      { ...application, fieldValues: values({ members: [{ name: "Mari", email: "mari@example.com", isCaptain: true }, { name: "Jaan" }], helpers: [{ name: "Ants", phone: "5123" }] }) },
      { ...application, id: "w", teamId: null, team: null, teamName: "Ootel", status: "WAITLISTED", class: { name: "Vanemad" }, fieldValues: values({ members: [{ name: "Kati" }] }) },
    ],
    teams: [],
  })
  assert.deepEqual(reportMembersMatrix(twoLists), [
    ["Tähis", "Võistkond", "Klass", "Registreerimise staatus", "Nimekiri", "Nr", "Nimi", "E-post", "Telefon", "Kapten"],
    ["01", "Öökullid", "Noored", "Registreeritud", "members", 1, "Mari", "mari@example.com", "", "Jah"],
    ["01", "Öökullid", "Noored", "Registreeritud", "members", 2, "Jaan", "", "", ""],
    ["01", "Öökullid", "Noored", "Registreeritud", "Saatjad", 3, "Ants", "", "5123", ""],
    ["", "Ootel", "Vanemad", "Ootenimekirjas", "members", 1, "Kati", "", "", ""],
  ])
  // Filtreeritud väljavõttes on üks nimekiri, seega selle veergu pole vaja.
  assert.deepEqual(reportMembersMatrix(twoLists, { status: "WAITLISTED" }), [
    ["Tähis", "Võistkond", "Klass", "Registreerimise staatus", "Nr", "Nimi"],
    ["", "Ootel", "Vanemad", "Ootenimekirjas", 1, "Kati"],
  ])
  assert.deepEqual(reportMatrix(twoLists, undefined, { status: "WAITLISTED" }, "members"), reportMembersMatrix(twoLists, { status: "WAITLISTED" }))
  assert.deepEqual(reportMembersMatrix(twoLists, { search: "puuduv" }), [["Tähis", "Võistkond", "Klass", "Registreerimise staatus", "Nr", "Nimi"]])
})

test("mandaadi koosseis saab telefoni ja sünniaja liikmete vormivastusest", () => {
  const result = buildRegistrationReport({
    name: "Mandaat", phase: "MANDATE", fields,
    applications: [],
    teams: [{ ...team, members: [
      { name: "Mari Maasikas", email: null, role: "COMPETITOR", isCaptain: true, assignmentRole: null },
      { name: "Jüri", email: "jyri@example.com", role: "SUPPORT", isCaptain: false, assignmentRole: "Autojuht" },
    ], formValues: values({ members: [{ name: "mari maasikas", email: "mari@example.com", phone: "5111", birthDate: "2011-05-06" }, { name: "Teine nimi", email: "JYRI@example.com", phone: "5222" }] }) }],
  })
  assert.equal(result.rows[0].cells.members, "Mari Maasikas (kapten), Jüri (tugiliige)")
  assert.deepEqual(reportMembersMatrix(result), [
    ["Tähis", "Võistkond", "Klass", "Mandaadi staatus", "Nr", "Nimi", "E-post", "Telefon", "Sünniaeg", "Kapten", "Ülesanne", "Roll"],
    ["01", "Öökullid", "Noored", "Esitatud", 1, "Mari Maasikas", "mari@example.com", "5111", "06.05.2011", "Jah", "", "Võistleja"],
    ["01", "Öökullid", "Noored", "Esitatud", 2, "Jüri", "jyri@example.com", "5222", "", "", "Autojuht", "Tugiliige"],
  ])
})
