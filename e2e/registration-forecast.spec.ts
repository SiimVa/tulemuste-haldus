import { test, expect } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

// Same isolated local schema as playwright.config.ts; never use the app's DATABASE_URL.
const databaseUrl = process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/tulemuste_haldus?schema=e2e"
const parsed = new URL(databaseUrl)
if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname) || parsed.searchParams.get("schema") !== "e2e") throw new Error("Forecast tests require a local e2e schema")
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
const DAY = 86_400_000

test("organizer forecasts, private comparisons and archived statistics survive personal-data cleanup", async ({ page, request }) => {
  const now = new Date()
  const at = (offset: number) => new Date(now.getTime() + offset * DAY)
  const user = await db.user.create({ data: { email: `forecast-${Date.now()}@example.com`, name: "Prognoosi korraldaja", passwordHash: await bcrypt.hash("forecast-test-password", 10) } })
  const other = await db.user.create({ data: { email: `forecast-other-${Date.now()}@example.com`, name: "Teine korraldaja" } })
  const create = (name: string, owner: string, start: number, close: number) => db.competition.create({ data: {
    name, createdById: owner, organizerId: owner, registrationOpensAt: at(start), registrationClosesAt: at(close),
    registrationOverride: "AUTO", endDate: at(-100), registrationCapacity: 100,
  } })
  const current = await create("Sügisvõistluse prognoos", user.id, -15, 15)
  const historical = await create("Varasem sügisvõistlus", user.id, -380, -350)
  const privateCompetition = await create("Teise korraldaja privaatne võistlus", other.id, -380, -350)
  for (const [competition, count, start] of [[current, 15, -15], [historical, 30, -380]] as const) {
    for (let i = 0; i < count; i++) {
      const submittedAt = at(start + i)
      await db.registrationApplication.create({ data: {
        competitionId: competition.id, submittedById: user.id, teamName: `Võistkond ${i + 1}`,
        submittedAt, status: "CONFIRMED",
        events: { create: { createdAt: submittedAt, fromStatus: null, toStatus: "CONFIRMED" } },
      } })
    }
  }
  const field = await db.competitionFormField.create({ data: { competitionId: historical.id, key: "email", label: "E-post", type: "EMAIL", purgeAfterCompetition: true } })
  const application = await db.registrationApplication.findFirstOrThrow({ where: { competitionId: historical.id } })
  await db.registrationApplicationFieldValue.create({ data: { applicationId: application.id, fieldId: field.id, value: JSON.stringify("private@example.com") } })

  expect((await request.get(`/api/competitions/${current.id}/registration-forecast`)).status()).toBe(401)
  await page.goto("/login")
  await page.getByPlaceholder("admin@example.com").fill(user.email)
  await page.locator('input[type="password"]').fill("forecast-test-password")
  await page.getByRole("button", { name: "Logi sisse" }).click()
  await page.waitForURL("**/dashboard")
  expect((await page.request.get(`/api/competitions/${privateCompetition.id}/registration-forecast`)).status()).toBe(403)
  expect((await page.request.get(`/api/competitions/${current.id}/registration-forecast?compare=${privateCompetition.id}`)).status()).toBe(403)

  await page.goto(`/dashboard/competitions/${current.id}/registration-forecast`)
  await expect(page.getByRole("heading", { name: "Senise tempo prognoos" })).toBeVisible()
  await expect(page.getByText(privateCompetition.name)).toHaveCount(0)
  await page.getByRole("checkbox", { name: /Varasem sügisvõistlus/ }).check()
  await expect(page.getByText("Arvutusse sobis 1 / 1 valitud võistlust.")).toBeVisible()
  await page.reload()
  await expect(page.getByRole("checkbox", { name: /Varasem sügisvõistlus/ })).toBeChecked()
  await expect(page.getByText("Arvutusse sobis 1 / 1 valitud võistlust.")).toBeVisible()
  await page.screenshot({ path: "/tmp/tulemuste-forecast-desktop.png", fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole("heading", { name: "Ajalooline prognoos" })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: "/tmp/tulemuste-forecast-mobile.png", fullPage: true })

  const finalize = await page.request.post(`/api/competitions/${historical.id}/registration-applications/finalize`)
  expect(finalize.status(), await finalize.text()).toBe(200)
  const before = await db.competition.findUniqueOrThrow({ where: { id: historical.id } })
  expect(before.registrationStatistics).toBeTruthy()
  const purge = await page.request.post(`/api/competitions/${historical.id}/personal-data/purge`)
  expect(purge.status(), await purge.text()).toBe(200)
  expect(await db.registrationApplicationFieldValue.count({ where: { fieldId: field.id } })).toBe(0)
  const after = await db.competition.findUniqueOrThrow({ where: { id: historical.id } })
  expect(after.registrationStatistics).toBe(before.registrationStatistics)
  const archive = JSON.parse(after.registrationStatistics!)
  expect(archive.days.at(-1).active).toBe(30)
  expect(after.registrationStatistics).not.toContain("private@example.com")
  const response = await page.request.get(`/api/competitions/${current.id}/registration-forecast?compare=${historical.id}`)
  expect(response.status()).toBe(200)
  const body = await response.json()
  expect(body.references[0].statistics.days.at(-1).active).toBe(30)
  expect(body.references[0].statistics.undatedTeams).toBe(0)
  expect(body.references[0].statistics.incompleteHistories).toBe(0)
  await db.$disconnect()
})
