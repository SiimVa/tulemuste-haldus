import { test, expect } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const databaseUrl = process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/tulemuste_haldus?schema=e2e"
const parsed = new URL(databaseUrl)
if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname) || parsed.searchParams.get("schema") !== "e2e") throw new Error("Organizer tests require a local e2e schema")
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
test.afterAll(() => db.$disconnect())

test("organizer subscribes to and cancels a registration digest", async ({ page, request }) => {
  const passwordHash = await bcrypt.hash("digest-test-password", 10)
  const owner = await db.user.create({ data: { name: "Korraldaja", email: `digest-${Date.now()}@example.com`, passwordHash } })
  const outsider = await db.user.create({ data: { name: "Võõras", email: `digest-other-${Date.now()}@example.com`, passwordHash } })
  const competition = await db.competition.create({ data: { name: "Kokkuvõtte võistlus", organizerId: owner.id, createdById: owner.id } })
  const other = await db.competition.create({ data: { name: "Võõras võistlus", organizerId: outsider.id, createdById: outsider.id } })
  const endpoint = `/api/competitions/${competition.id}/notification-subscription`
  expect((await request.put(endpoint, { data: { registration: true, mandate: true, interval: "DAILY" } })).status()).toBe(401)

  await page.goto("/login")
  await page.getByPlaceholder("admin@example.com").fill(owner.email)
  await page.locator('input[type="password"]').fill("digest-test-password")
  await page.getByRole("button", { name: "Logi sisse" }).click()
  await page.waitForURL("**/dashboard")
  expect((await page.request.put(`/api/competitions/${other.id}/notification-subscription`, { data: { registration: true, mandate: true, interval: "DAILY" } })).status()).toBe(403)
  expect((await page.request.put(endpoint, { data: { registration: false, mandate: false, interval: "DAILY" } })).status()).toBe(400)
  expect((await page.request.put(endpoint, { data: { registration: true, mandate: false, interval: "MONTHLY" } })).status()).toBe(400)

  await page.goto(`/dashboard/competitions/${competition.id}/registrations`)
  await page.locator("summary", { hasText: "E-posti teavitused" }).click()
  await expect(page.getByText(owner.email)).toBeVisible()
  await page.getByLabel("Mandaat", { exact: true }).uncheck()
  await page.getByLabel("Kui tihti").selectOption("HOURLY")
  await page.getByRole("button", { name: "Telli" }).click()
  await expect(page.getByRole("status").filter({ hasText: "Tellimus salvestatud" })).toBeVisible()
  const subscription = await db.organizerDigestSubscription.findUniqueOrThrow({ where: { competitionId_userId: { competitionId: competition.id, userId: owner.id } } })
  expect(subscription).toMatchObject({ registration: true, mandate: false, interval: "HOURLY" })
  expect(subscription.nextSendAt.getTime()).toBeGreaterThan(Date.now())

  await page.reload()
  await page.locator("summary", { hasText: "E-posti teavitused" }).click()
  await expect(page.getByLabel("Mandaat", { exact: true })).not.toBeChecked()
  await expect(page.getByLabel("Kui tihti")).toHaveValue("HOURLY")
  await page.getByRole("button", { name: "Lõpeta tellimus" }).click()
  await expect(page.getByRole("status").filter({ hasText: "Tellimus lõpetatud" })).toBeVisible()
  expect(await db.organizerDigestSubscription.count({ where: { competitionId: competition.id } })).toBe(0)
})
