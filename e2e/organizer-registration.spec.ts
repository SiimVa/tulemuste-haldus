import { test, expect } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const databaseUrl = process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/tulemuste_haldus?schema=e2e"
const parsed = new URL(databaseUrl)
if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname) || parsed.searchParams.get("schema") !== "e2e") throw new Error("Organizer tests require a local e2e schema")
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
test.afterAll(() => db.$disconnect())

test("organizer edits full registrations after closing and adds and edits teams during mandate", async ({ page, request, browser }) => {
  const passwordHash = await bcrypt.hash("organizer-test-password", 10)
  const owner = await db.user.create({ data: { name: "Korraldaja", email: `organizer-${Date.now()}@example.com`, passwordHash } })
  const representative = await db.user.create({ data: { name: "Esindaja", email: `representative-${Date.now()}@example.com`, passwordHash } })
  const competition = await db.competition.create({ data: {
    name: "Korraldaja registreerimine", organizerId: owner.id, createdById: owner.id,
    registrationOverride: "CLOSED", registrationClosesAt: new Date("2020-01-01"), registrationApprovalMode: "MANUAL", mandateOverride: "OPEN",
  } })
  const other = await db.competition.create({ data: { name: "Teine võistlus", organizerId: representative.id, createdById: representative.id } })
  await db.competitionMember.create({ data: { competitionId: competition.id, userId: representative.id, roles: { create: { role: "REPRESENTATIVE" } } } })
  const firstClass = await db.competitionClass.create({ data: { competitionId: competition.id, name: "Noored" } })
  const secondClass = await db.competitionClass.create({ data: { competitionId: competition.id, name: "Täiskasvanud" } })
  const county = await db.competitionFormField.create({ data: { competitionId: competition.id, key: "county", label: "Maakond", type: "TEXT", requiredInRegistration: true } })
  const members = await db.competitionFormField.create({ data: { competitionId: competition.id, key: "members", label: "Võistkonna liikmed", type: "MEMBER_LIST", memberFields: '["name","email","phone"]', memberMaxCount: 4, showInMandate: true } })
  const food = await db.competitionFormField.create({ data: { competitionId: competition.id, key: "food", label: "Toidueelistus", type: "TEXT", showInRegistration: false, showInMandate: true, editableInMandate: false } })
  const application = await db.registrationApplication.create({ data: {
    competitionId: competition.id, submittedById: representative.id, teamName: "Algne võistkond", classId: firstClass.id, status: "CONFIRMED", submittedAt: new Date(),
    fieldValues: { create: [{ fieldId: county.id, value: '"Harju"' }, { fieldId: members.id, value: '[{"name":"Mari","phone":"55512345"}]' }] },
  } })
  const endpoint = `/api/competitions/${competition.id}/registrations`
  const payload = { applicationId: application.id, teamName: "Muudetud võistkond", classId: secondClass.id, answers: { county: "Tartu", members: [{ name: "Mari Muudetud", phone: "55512345" }] } }
  expect((await request.post(endpoint, { data: payload })).status()).toBe(401)
  await page.goto("/login")
  await page.getByPlaceholder("admin@example.com").fill(owner.email)
  await page.locator('input[type="password"]').fill("organizer-test-password")
  await page.getByRole("button", { name: "Logi sisse" }).click()
  await page.waitForURL("**/dashboard")
  expect((await page.request.post(`/api/competitions/${other.id}/registrations`, { data: payload })).status()).toBe(403)
  expect((await page.request.post(endpoint, { data: { ...payload, applicationId: "foreign-application" } })).status()).toBe(404)
  expect((await page.request.post(endpoint, { data: { ...payload, answers: { county: "" } } })).status()).toBe(400)
  expect((await db.registrationApplication.findUniqueOrThrow({ where: { id: application.id } })).teamName).toBe("Algne võistkond")

  await page.goto(`/dashboard/competitions/${competition.id}/registrations`)
  await page.locator("article").filter({ hasText: "Algne võistkond" }).getByRole("button", { name: "Muuda võistkonda" }).click()
  const form = page.getByRole("form", { name: "Võistkonna andmete muutmine" })
  await form.getByLabel("Võistkonna nimi").fill(payload.teamName)
  await form.getByLabel("Klass", { exact: true }).selectOption(secondClass.id)
  await form.getByLabel("Maakond").fill("Tartu")
  await form.getByLabel("Liige 1 nimi").fill("Mari Muudetud")
  await form.getByRole("button", { name: "Salvesta võistkond" }).click()
  await expect(form).toHaveCount(0)
  const updated = await db.registrationApplication.findUniqueOrThrow({ where: { id: application.id }, include: { fieldValues: true, events: true } })
  expect(updated).toMatchObject({ teamName: payload.teamName, classId: secondClass.id, status: "CONFIRMED", submittedById: representative.id })
  expect(updated.events.some((event) => event.actorId === owner.id && event.note === "Korraldaja muutis registreeringut")).toBe(true)
  expect(updated.fieldValues.find((value) => value.fieldId === members.id)?.value).toContain("55512345")

  await page.getByRole("button", { name: "Lisa võistkond", exact: true }).click()
  await form.getByLabel("Võistkonna nimi").fill("Hiline registreering")
  await form.getByLabel("Klass", { exact: true }).selectOption(firstClass.id)
  await form.getByLabel("Maakond").fill("Pärnu")
  await form.getByRole("button", { name: "Salvesta võistkond" }).click()
  await expect(form).toHaveCount(0)
  expect(await db.registrationApplication.count({ where: { competitionId: competition.id } })).toBe(2)
  const finalized = await page.request.post(`/api/competitions/${competition.id}/registration-applications/finalize`)
  expect(finalized.status(), await finalized.text()).toBe(200)
  const linked = await db.registrationApplication.findUniqueOrThrow({ where: { id: application.id } })
  const teamId = linked.teamId!
  await db.team.update({ where: { id: teamId }, data: { mandateStatus: "APPROVED", members: { create: { name: "Tugiliige", role: "SUPPORT" } } } })

  await page.reload()
  await expect(page.getByTestId("mandate-counter")).toContainText("1/2")
  // The application shortcut opens the current team data during mandate.
  await page.locator("article").filter({ hasText: "Muudetud võistkond" }).first().getByRole("button", { name: "Muuda võistkonda" }).click()
  await form.getByLabel("Võistkonna nimi").fill("Mandaadis muudetud")
  await form.getByLabel("Maakond").fill("Võru")
  await form.getByLabel("Toidueelistus").fill("Taimne")
  await form.getByLabel("Liige 1 nimi").fill("Mari Mandaadis")
  await form.getByRole("button", { name: "Salvesta võistkond" }).click()
  await expect(form).toHaveCount(0)
  const mandateTeam = await db.team.findUniqueOrThrow({ where: { id: teamId }, include: { members: true, formValues: true, representative: true } })
  expect(mandateTeam).toMatchObject({ name: "Mandaadis muudetud", registrationStatus: "APPROVED", mandateStatus: "APPROVED" })
  expect(mandateTeam.members.map((member) => member.name).sort()).toEqual(["Mari Mandaadis", "Tugiliige"])
  expect(mandateTeam.formValues.find((value) => value.fieldId === food.id)?.value).toBe('"Taimne"')
  expect(mandateTeam.representative).not.toBeNull()
  // Registration exports retain the registration snapshot; mandate uses live data.
  expect((await db.registrationApplication.findUniqueOrThrow({ where: { id: application.id } })).teamName).toBe("Muudetud võistkond")

  await page.getByRole("button", { name: "Lisa võistkond", exact: true }).click()
  await form.getByLabel("Võistkonna nimi").fill("Mandaadis lisatud")
  await form.getByLabel("Klass", { exact: true }).selectOption(secondClass.id)
  await form.getByLabel("Maakond").fill("Saare")
  await form.getByRole("button", { name: "+ Lisa liige" }).click()
  await form.getByLabel("Liige 1 nimi").fill("Jüri")
  await form.getByRole("button", { name: "Salvesta võistkond" }).click()
  await expect(form).toHaveCount(0)
  const lateTeam = await db.team.findFirstOrThrow({ where: { competitionId: competition.id, name: "Mandaadis lisatud" }, include: { members: true } })
  expect(lateTeam.registrationStatus).toBe("APPROVED")
  expect(lateTeam.members[0].name).toBe("Jüri")
  expect(await db.registrationApplication.count({ where: { competitionId: competition.id } })).toBe(2)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator("article").filter({ hasText: "Mandaadis lisatud" }).getByRole("button", { name: "Muuda võistkonda" }).click()
  await expect(form.getByLabel("Liige 1 nimi")).toHaveValue("Jüri")
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: "/tmp/organizer-registration-mobile.png", fullPage: true })

  const repContext = await browser.newContext()
  const repPage = await repContext.newPage()
  await repPage.goto("/login")
  await repPage.getByPlaceholder("admin@example.com").fill(representative.email)
  await repPage.locator('input[type="password"]').fill("organizer-test-password")
  await repPage.getByRole("button", { name: "Logi sisse" }).click()
  await repPage.waitForURL("**/dashboard")
  expect((await repPage.request.post(endpoint, { data: payload })).status()).toBe(403)
  await repContext.close()
})

test("korraldaja esitab mandaadi samade andmekontrollide ja kinnitamisreeglitega", async ({ page, request }) => {
  const stamp = Date.now()
  const passwordHash = await bcrypt.hash("organizer-mandate-password", 10)
  const owner = await db.user.create({ data: { name: "Omanik", email: `mandate-owner-${stamp}@example.com`, passwordHash } })
  const organizer = await db.user.create({ data: { name: "Korraldaja", email: `mandate-organizer-${stamp}@example.com`, passwordHash } })
  const competition = await db.competition.create({ data: {
    name: `Korraldaja mandaat ${stamp}`, createdById: owner.id, organizerId: owner.id,
    registrationFinalizedAt: new Date(), mandateOverride: "OPEN", mandateApprovalMode: "MANUAL",
    members: { create: { userId: organizer.id, roles: { create: { role: "ORGANIZER" } } } },
  } })
  const team = await db.team.create({ data: {
    competitionId: competition.id, name: "Korraldaja esitatav", code: "K1", registrationStatus: "APPROVED",
    members: { create: { name: "Mari", role: "COMPETITOR" } },
  } })
  await db.registrationApplication.create({ data: { competitionId: competition.id, submittedById: owner.id, teamName: team.name, teamId: team.id, status: "CONFIRMED" } })
  const required = await db.competitionFormField.create({ data: {
    competitionId: competition.id, key: "contact", label: "Kontakttelefon", type: "TEXT",
    showInRegistration: false, showInMandate: true, requiredInMandate: true,
  } })
  const submitUrl = `/api/representative/teams/${team.id}/submit`
  expect((await request.post(submitUrl, { data: { phase: "MANDATE" } })).status()).toBe(401)
  await page.goto("/login")
  await page.getByPlaceholder("admin@example.com").fill(organizer.email)
  await page.locator('input[type="password"]').fill("organizer-mandate-password")
  await page.getByRole("button", { name: "Logi sisse" }).click()
  await page.waitForURL("**/dashboard")
  await page.goto(`/dashboard/competitions/${competition.id}/registrations`)
  await page.getByRole("tab", { name: /Mandaat/ }).click()
  const card = page.locator("article").filter({ hasText: team.name })
  await card.getByRole("button", { name: "Esita mandaat", exact: true }).click()
  await expect(page.getByText(/Kontakttelefon:.*kohustuslik/)).toBeVisible()
  expect((await db.team.findUniqueOrThrow({ where: { id: team.id } })).mandateStatus).toBe("DRAFT")
  await db.teamFormFieldValue.create({ data: { teamId: team.id, fieldId: required.id, value: '"55512345"' } })
  await card.getByRole("button", { name: "Esita mandaat", exact: true }).click()
  await expect(page.getByText("Mandaat esitatud", { exact: true })).toBeVisible()
  await expect(card.getByRole("button", { name: "Esita mandaat", exact: true })).toHaveCount(0)
  await expect(card.getByRole("button", { name: "Kinnita mandaat", exact: true })).toBeVisible()
  const submitted = await db.team.findUniqueOrThrow({ where: { id: team.id } })
  expect(submitted.mandateStatus).toBe("SUBMITTED")
  expect(submitted.mandateSubmittedAt).not.toBeNull()
  expect(submitted.mandateReviewedAt).toBeNull()
  expect((await page.request.post(submitUrl, { data: { phase: "MANDATE" } })).status()).toBe(409)

  // Tagasi saadetud mandaadi saab korraldaja uuesti esitada ka suletud perioodil.
  await db.competition.update({ where: { id: competition.id }, data: { mandateOverride: "CLOSED", mandateApprovalMode: "AUTOMATIC" } })
  await db.team.update({ where: { id: team.id }, data: { mandateStatus: "CHANGES_REQUESTED", mandateReviewNote: "Täienda andmeid" } })
  await page.reload()
  await card.getByRole("button", { name: "Esita mandaat", exact: true }).click()
  await expect(page.getByText("Mandaat esitatud ja automaatselt kinnitatud", { exact: true })).toBeVisible()
  const approved = await db.team.findUniqueOrThrow({ where: { id: team.id } })
  expect(approved.mandateStatus).toBe("APPROVED")
  expect(approved.mandateSubmittedAt).toEqual(approved.mandateReviewedAt)
  expect(approved.mandateReviewNote).toBeNull()
  await expect(card.getByRole("button", { name: "Esita mandaat", exact: true })).toHaveCount(0)

  // Tavalist mustandit suletud perioodil ei esitata.
  await db.team.update({ where: { id: team.id }, data: { mandateStatus: "DRAFT" } })
  await page.reload()
  await expect(card.getByRole("button", { name: "Muuda võistkonda" })).toBeVisible()
  await expect(card.getByRole("button", { name: "Esita mandaat", exact: true })).toHaveCount(0)
  expect((await page.request.post(submitUrl, { data: { phase: "MANDATE" } })).status()).toBe(409)
  // Korraldajaroll ei anna õigust teise võistluse võistkonna mandaadile.
  const foreign = await db.competition.create({ data: { name: "Võõras võistlus", organizerId: owner.id, createdById: owner.id } })
  const foreignTeam = await db.team.create({ data: { competitionId: foreign.id, code: "V1", name: "Võõras", registrationStatus: "APPROVED" } })
  expect((await page.request.post(`/api/representative/teams/${foreignTeam.id}/submit`, { data: { phase: "MANDATE" } })).status()).toBe(403)
})
