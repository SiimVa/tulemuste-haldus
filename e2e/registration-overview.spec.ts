import { test, expect } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"
import * as XLSX from "xlsx"

const databaseUrl = process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/tulemuste_haldus?schema=e2e"
const parsed = new URL(databaseUrl)
if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname) || parsed.searchParams.get("schema") !== "e2e") throw new Error("Report tests require a local e2e schema")
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
test.afterAll(() => db.$disconnect())

test("organizer selects report fields, filters and exports registration and mandate data", async ({ page, request }) => {
  const user = await db.user.create({ data: { email: `report-${Date.now()}@example.com`, name: "Aruande korraldaja", passwordHash: await bcrypt.hash("report-test-password", 10) } })
  const other = await db.user.create({ data: { email: `report-other-${Date.now()}@example.com`, name: "Teine korraldaja" } })
  const competition = await db.competition.create({ data: { name: "Öömatka registreerimine", createdById: user.id, organizerId: user.id } })
  const privateCompetition = await db.competition.create({ data: { name: "Privaatne", createdById: other.id, organizerId: other.id } })
  const county = await db.competitionFormField.create({ data: { competitionId: competition.id, key: "county", label: "Maakond", type: "TEXT" } })
  const food = await db.competitionFormField.create({ data: { competitionId: competition.id, key: "food", label: "Toidueelistus", type: "TEXT", showInRegistration: false, showInMandate: true } })
  // Esindaja süsteemiväljad ja liikmete loend, mis varem eksporditi topelt ja ühte lahtrisse.
  const representativeFields: { id: string }[] = []
  for (const [index, [key, label, type]] of [["system_representative_name", "Esindaja nimi", "TEXT"], ["system_representative_email", "Esindaja e-post", "EMAIL"], ["system_representative_phone", "Esindaja telefon", "PHONE"]].entries()) {
    representativeFields.push(await db.competitionFormField.create({ data: { competitionId: competition.id, key, label, type, order: 10 + index } }))
  }
  const memberList = await db.competitionFormField.create({ data: { competitionId: competition.id, key: "members", label: "Võistkonna liikmed", type: "MEMBER_LIST", memberFields: JSON.stringify(["name", "email", "phone", "birthDate"]), showInMandate: false, order: 20 } })
  const team = await db.team.create({ data: {
    competitionId: competition.id, code: "01", name: "Öökullid", class: "Noored", registrationStatus: "APPROVED", mandateStatus: "SUBMITTED",
    formValues: { create: [{ fieldId: county.id, value: JSON.stringify("Harju") }, { fieldId: food.id, value: JSON.stringify("Taimne") }] },
    members: { create: { name: "Mari", email: "mari@example.com", isCaptain: true, assignmentRole: "Navigeerija" } },
  } })
  const representative = await db.user.create({ data: { email: "robi.abel@example.com", name: "Robi Abel" } })
  const membership = await db.competitionMember.create({ data: { competitionId: competition.id, userId: representative.id, roles: { create: { role: "REPRESENTATIVE" } } } })
  await db.teamRepresentative.create({ data: { competitionId: competition.id, teamId: team.id, memberId: membership.id } })
  await db.teamFormFieldValue.createMany({ data: ["Robi Abel", "robi.abel@example.com", "5555 1234"].map((value, index) => ({ teamId: team.id, fieldId: representativeFields[index].id, value: JSON.stringify(value) })) })
  await db.registrationApplication.create({ data: {
    competitionId: competition.id, submittedById: user.id, representativeId: representative.id, teamName: team.name, teamId: team.id, status: "CONFIRMED", submittedAt: new Date(),
    fieldValues: { create: [
      { fieldId: county.id, value: JSON.stringify("Tartu") },
      ...["Robi Abel", "robi.abel@example.com", "5555 1234"].map((value, index) => ({ fieldId: representativeFields[index].id, value: JSON.stringify(value) })),
      { fieldId: memberList.id, value: JSON.stringify([{ name: "Katrin Liidlein", email: "katrin@example.com", phone: "5841234", birthDate: "2010-03-04", isCaptain: true }, { name: "Selena Suurmaa", email: "selena@example.com" }]) },
    ] },
  } })
  await db.registrationApplication.create({ data: {
    competitionId: competition.id, submittedById: user.id, teamName: "Ootel tiim", status: "WAITLISTED", waitlistPosition: 1,
    fieldValues: { create: { fieldId: county.id, value: JSON.stringify("Võru") } },
  } })
  const endpoint = `/api/competitions/${competition.id}`
  expect((await request.get(`${endpoint}/registration-overview`)).status()).toBe(401)
  expect((await request.get(`${endpoint}/registrations/export`)).status()).toBe(401)
  await page.goto("/login")
  await page.getByPlaceholder("admin@example.com").fill(user.email)
  await page.locator('input[type="password"]').fill("report-test-password")
  await page.getByRole("button", { name: "Logi sisse" }).click()
  await page.waitForURL("**/dashboard")
  for (const suffix of ["registration-overview", "registrations/export"]) {
    expect((await page.request.get(`/api/competitions/${privateCompetition.id}/${suffix}`)).status()).toBe(403)
  }
  expect((await page.request.get(`${endpoint}/registrations/export?format=pdf`)).status()).toBe(400)
  expect((await page.request.get(`${endpoint}/registrations/export?column=unknown`)).status()).toBe(400)

  await page.goto(`/dashboard/competitions/${competition.id}/registration-overview`)
  await expect(page.getByRole("heading", { name: "Registreerimise ülevaade" })).toBeVisible()
  await expect(page.getByText("Näitan 2 / 2 võistkonda")).toBeVisible()
  await expect(page.getByRole("checkbox", { name: "Toidueelistus", exact: true })).toHaveCount(0)
  await page.getByRole("checkbox", { name: "Koonda samad vastused" }).uncheck()
  await page.getByRole("button", { name: "Tühjenda valik" }).click()
  await expect(page.getByRole("button", { name: "Ekspordi Excel" })).toBeDisabled()
  await page.getByRole("checkbox", { name: "Võistkond", exact: true }).check()
  await page.getByRole("checkbox", { name: "Maakond", exact: true }).check()
  await page.getByLabel("Staatus", { exact: true }).selectOption("CONFIRMED")
  await expect(page.getByText("Näitan 1 / 2 võistkonda")).toBeVisible()
  await expect(page.getByRole("columnheader")).toHaveCount(2)
  const downloadPromise = page.waitForEvent("download")
  await page.getByRole("button", { name: "Ekspordi Excel" }).click()
  const download = await downloadPromise
  const workbook = XLSX.readFile((await download.path())!)
  expect(XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 })).toEqual([["Võistkond", "Maakond"], ["Öökullid", "Tartu"]])
  await page.reload()
  await page.getByRole("checkbox", { name: "Koonda samad vastused" }).uncheck()
  await expect(page.getByRole("checkbox", { name: "Maakond", exact: true })).toBeChecked()
  await expect(page.getByRole("columnheader")).toHaveCount(2)
  await page.screenshot({ path: "/tmp/registration-overview-desktop.png", fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: "/tmp/registration-overview-mobile.png", fullPage: true })

  await page.getByLabel("Andmed", { exact: true }).selectOption("MANDATE")
  await expect(page.getByText("Näitan 1 / 1 võistkonda")).toBeVisible()
  await expect(page.getByRole("cell", { name: "Taimne", exact: true })).toBeVisible()
  const mandate = await page.request.get(`${endpoint}/registrations/export?phase=MANDATE&format=xlsx`)
  expect(mandate.status()).toBe(200)
  const mandateWorkbook = XLSX.read(await mandate.body(), { type: "buffer" })
  const mandateRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(mandateWorkbook.Sheets.Mandaat)
  expect(mandateRows).toHaveLength(1)
  expect(mandateRows[0].Maakond).toBe("Harju")
  expect(mandateRows[0].Liikmed).toBe("Mari (kapten)")
  expect(XLSX.utils.sheet_to_json(mandateWorkbook.Sheets.Liikmed, { defval: "" })).toEqual([
    { Tähis: "01", Võistkond: "Öökullid", Klass: "Noored", "Mandaadi staatus": "Esitatud", Nr: 1, Nimi: "Mari", "E-post": "mari@example.com", Kapten: "Jah", Ülesanne: "Navigeerija", Roll: "Võistleja" },
  ])

  // Kogu registreerimise eksport: esindaja üks kord, liikmed eraldi lehel.
  const full = XLSX.read(await (await page.request.get(`${endpoint}/registrations/export?format=xlsx`)).body(), { type: "buffer" })
  expect(full.SheetNames).toEqual(["Registreerimine", "Liikmed"])
  const header = XLSX.utils.sheet_to_json<unknown[]>(full.Sheets.Registreerimine, { header: 1 })[0]
  expect(header).toEqual(expect.arrayContaining(["Esindaja", "Esindaja e-post", "Esindaja telefon", "Liikmete arv", "Liikmed"]))
  for (const duplicate of ["Esitaja / esindaja", "E-post", "Esindaja nimi", "Võistkonna liikmed"]) expect(header).not.toContain(duplicate)
  const registered = XLSX.utils.sheet_to_json<Record<string, unknown>>(full.Sheets.Registreerimine, { defval: "" }).find(row => row.Võistkond === "Öökullid")!
  expect([registered.Esindaja, registered["Esindaja e-post"], registered["Esindaja telefon"], registered["Liikmete arv"], registered.Liikmed])
    .toEqual(["Robi Abel", "robi.abel@example.com", "5555 1234", 2, "Katrin Liidlein (kapten), Selena Suurmaa"])
  expect(XLSX.utils.sheet_to_json(full.Sheets.Liikmed, { defval: "" })).toEqual([
    { Tähis: "01", Võistkond: "Öökullid", Klass: "", "Registreerimise staatus": "Registreeritud", Nr: 1, Nimi: "Katrin Liidlein", "E-post": "katrin@example.com", Telefon: "5841234", Sünniaeg: "04.03.2010", Kapten: "Jah" },
    { Tähis: "01", Võistkond: "Öökullid", Klass: "", "Registreerimise staatus": "Registreeritud", Nr: 2, Nimi: "Selena Suurmaa", "E-post": "selena@example.com", Telefon: "", Sünniaeg: "", Kapten: "" },
  ])
  // Ülevaate API ei saada liikmete kontakte brauserisse.
  const overview = await (await page.request.get(`${endpoint}/registration-overview`)).json()
  expect(overview.rows.every((row: Record<string, unknown>) => !("members" in row))).toBe(true)
  expect(JSON.stringify(overview)).not.toContain("5841234")
  const csv = await page.request.get(`${endpoint}/registrations/export?format=csv&status=WAITLISTED&column=name&column=waitlist`)
  expect(await csv.text()).toContain('"Ootel tiim","1"')
  expect(await csv.text()).not.toContain("Öökullid")

  await page.goto(`/dashboard/competitions/${competition.id}/registrations`)
  await expect(page.getByRole("region", { name: "Registreerimise eksport" }).getByRole("button", { name: "Ekspordi Excel" })).toBeVisible()
  await expect(page.getByRole("region", { name: "Mandaadi eksport" }).getByRole("button", { name: "Ekspordi CSV" })).toBeVisible()
  const membersCsv = page.waitForEvent("download")
  await page.getByRole("region", { name: "Registreerimise eksport" }).getByRole("button", { name: "Liikmed CSV" }).click()
  const membersCsvText = (await import("node:fs")).readFileSync((await (await membersCsv).path())!, "utf8")
  expect(membersCsvText).toContain('"01","Öökullid","","Registreeritud","1","Katrin Liidlein","katrin@example.com","5841234","04.03.2010","Jah"')
  expect((await membersCsv).suggestedFilename()).toContain("_liikmed.csv")
  await db.registrationApplicationFieldValue.deleteMany({ where: { fieldId: county.id } })
  const purged = await page.request.get(`${endpoint}/registrations/export?format=csv&column=field:${county.id}`)
  expect(await purged.text()).not.toContain("Tartu")
  expect(await purged.text()).not.toContain("Võru")

  const summaryCompetition = await db.competition.create({ data: { name: "Maakondade kokkuvõte", createdById: user.id, organizerId: user.id } })
  const summaryCounty = await db.competitionFormField.create({ data: { competitionId: summaryCompetition.id, key: "county", label: "Maakond", type: "TEXT" } })
  const classes = new Map<string, string>()
  for (const name of ["Sega", "Tüdrukud", "Poisid", "Lapsevanemad"]) {
    const item = await db.competitionClass.create({ data: { competitionId: summaryCompetition.id, name } })
    classes.set(name, item.id)
  }
  const entries = [["Järva", "Sega"], ["Viru", "Sega"], ["Alutaguse", "Tüdrukud"], ["Alutaguse", "Poisid"], ["Alutaguse", "Sega"], ["Alutaguse", "Lapsevanemad"], ["Järva", "Tüdrukud"]]
  for (const [index, [countyName, className]] of entries.entries()) {
    await db.registrationApplication.create({ data: {
      competitionId: summaryCompetition.id, submittedById: user.id, teamName: `Tiim ${index + 1}`, status: "CONFIRMED", classId: classes.get(className),
      fieldValues: { create: { fieldId: summaryCounty.id, value: JSON.stringify(countyName) } },
    } })
  }
  await page.goto(`/dashboard/competitions/${summaryCompetition.id}/registration-overview`)
  await page.getByLabel("Koonda välja järgi", { exact: true }).selectOption(`field:${summaryCounty.id}`)
  await expect(page.getByText("Näitan 7 / 7 võistkonda · 3 rühma")).toBeVisible()
  await expect(page.getByRole("table").getByRole("row")).toHaveText(["MaakondVõistkondade arv", "Alutaguse4", "Järva2", "Viru1"])
  const summaryDownload = page.waitForEvent("download")
  await page.getByRole("button", { name: "Ekspordi Excel" }).click()
  const summaryWorkbook = XLSX.readFile((await (await summaryDownload).path())!)
  expect(XLSX.utils.sheet_to_json(summaryWorkbook.Sheets.Registreerimine, { header: 1 })).toEqual([["Maakond", "Võistkondade arv"], ["Alutaguse", 4], ["Järva", 2], ["Viru", 1]])
  const summaryCsv = await page.request.get(`/api/competitions/${summaryCompetition.id}/registrations/export?format=csv&view=summary&column=field:${summaryCounty.id}`)
  expect(await summaryCsv.text()).toContain('"Maakond","Võistkondade arv"\r\n"Alutaguse","4"\r\n"Järva","2"\r\n"Viru","1"')
  await page.getByRole("checkbox", { name: "Koonda samad vastused" }).uncheck()
  await expect(page.getByRole("table").getByRole("row")).toHaveCount(8)
  await expect(page.getByRole("columnheader", { name: "Võistkondade arv" })).toHaveCount(0)
  await expect(page.getByRole("columnheader", { name: "Võistkond", exact: true })).toBeVisible()
  await page.getByRole("checkbox", { name: "Koonda samad vastused" }).check()
  await page.getByLabel("Filtreeri: Maakond", { exact: true }).selectOption("answer:Alutaguse")
  await expect(page.getByText("Näitan 4 / 7 võistkonda · 1 rühma")).toBeVisible()
  const filteredDownload = page.waitForEvent("download")
  await page.getByRole("button", { name: "Ekspordi Excel" }).click()
  const filteredWorkbook = XLSX.readFile((await (await filteredDownload).path())!)
  expect(XLSX.utils.sheet_to_json(filteredWorkbook.Sheets.Registreerimine, { header: 1 })).toEqual([["Maakond", "Võistkondade arv"], ["Alutaguse", 4]])
  const filteredCsvDownload = page.waitForEvent("download")
  await page.getByRole("button", { name: "Ekspordi CSV" }).click()
  const filteredCsvWorkbook = XLSX.readFile((await (await filteredCsvDownload).path())!)
  expect(XLSX.utils.sheet_to_json(filteredCsvWorkbook.Sheets[filteredCsvWorkbook.SheetNames[0]], { header: 1 })).toEqual([["Maakond", "Võistkondade arv"], ["Alutaguse", 4]])
  await page.getByRole("checkbox", { name: "Koonda samad vastused" }).uncheck()
  await expect(page.getByRole("table").getByRole("row")).toHaveCount(5)
  await page.getByRole("checkbox", { name: "Koonda samad vastused" }).check()
  await expect(page.getByLabel("Koonda välja järgi", { exact: true })).toHaveValue(`field:${summaryCounty.id}`)
  await page.reload()
  await expect(page.getByLabel("Koonda välja järgi", { exact: true })).toHaveValue(`field:${summaryCounty.id}`)
  for (const answer of ['invalid-json', JSON.stringify(["name", "Tiim 1"]), JSON.stringify([`field:${food.id}`, "Taimne"]), JSON.stringify([`field:${summaryCounty.id}`, 4])]) {
    const invalid = new URLSearchParams({ answer })
    expect((await page.request.get(`/api/competitions/${summaryCompetition.id}/registrations/export?${invalid}`)).status()).toBe(400)
  }
  await page.getByRole("combobox", { name: "Klass", exact: true }).selectOption("class:Sega")
  await expect(page.getByText("Näitan 3 / 7 võistkonda · 3 rühma")).toBeVisible()
  await page.getByRole("combobox", { name: "Klass", exact: true }).selectOption("all")
  await page.getByRole("checkbox", { name: "Klass", exact: true }).check()
  await expect(page.getByText("Näitan 7 / 7 võistkonda · 7 rühma")).toBeVisible()
  await page.getByRole("checkbox", { name: "Maakond", exact: true }).uncheck()
  await expect(page.getByRole("table").getByRole("row")).toHaveText(["KlassVõistkondade arv", "Sega3", "Tüdrukud2", "Lapsevanemad1", "Poisid1"])
  await page.screenshot({ path: "/tmp/registration-summary-mobile.png", fullPage: true })
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.screenshot({ path: "/tmp/registration-summary-desktop.png", fullPage: true })
})
