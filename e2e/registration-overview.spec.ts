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
  const team = await db.team.create({ data: {
    competitionId: competition.id, code: "01", name: "Öökullid", class: "Noored", registrationStatus: "APPROVED", mandateStatus: "SUBMITTED",
    formValues: { create: [{ fieldId: county.id, value: JSON.stringify("Harju") }, { fieldId: food.id, value: JSON.stringify("Taimne") }] },
    members: { create: { name: "Mari", email: "mari@example.com", isCaptain: true, assignmentRole: "Navigeerija" } },
  } })
  await db.registrationApplication.create({ data: {
    competitionId: competition.id, submittedById: user.id, teamName: team.name, teamId: team.id, status: "CONFIRMED", submittedAt: new Date(),
    fieldValues: { create: { fieldId: county.id, value: JSON.stringify("Tartu") } },
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
  expect(mandateRows[0]["Mandaadi koosseis"]).toContain("Mari · mari@example.com · Võistleja · Kapten · Navigeerija")
  const csv = await page.request.get(`${endpoint}/registrations/export?format=csv&status=WAITLISTED&column=name&column=waitlist`)
  expect(await csv.text()).toContain('"Ootel tiim","1"')
  expect(await csv.text()).not.toContain("Öökullid")

  await page.goto(`/dashboard/competitions/${competition.id}/registrations`)
  await expect(page.getByRole("region", { name: "Registreerimise eksport" }).getByRole("button", { name: "Ekspordi Excel" })).toBeVisible()
  await expect(page.getByRole("region", { name: "Mandaadi eksport" }).getByRole("button", { name: "Ekspordi CSV" })).toBeVisible()
  await db.registrationApplicationFieldValue.deleteMany({ where: { fieldId: county.id } })
  const purged = await page.request.get(`${endpoint}/registrations/export?format=csv&column=field:${county.id}`)
  expect(await purged.text()).not.toContain("Tartu")
  expect(await purged.text()).not.toContain("Võru")
})
