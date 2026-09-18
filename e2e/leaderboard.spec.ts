import { test, expect } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const databaseUrl = process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/tulemuste_haldus?schema=e2e"
const parsed = new URL(databaseUrl)
if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname) || parsed.searchParams.get("schema") !== "e2e") throw new Error("Leaderboard tests require a local e2e schema")
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
test.afterAll(() => db.$disconnect())

test("leaderboard gaps, medals and class filters agree on desktop, mobile and print", async ({ page }) => {
  const user = await db.user.create({ data: { email: `leaderboard-${Date.now()}@example.com`, name: "Pingerea korraldaja", passwordHash: await bcrypt.hash("leaderboard-test-password", 10) } })
  const competition = await db.competition.create({ data: {
    name: "Klasside pingerida", createdById: user.id, organizerId: user.id, isPublic: true,
    registrationClasses: { create: [{ name: "A" }, { name: "B" }] },
  } })
  const element = await db.scoringElement.create({ data: { competitionId: competition.id, code: "KP1", name: "Esimene KP" } })
  for (const [index, [name, cls, points]] of [["Alpha", "A", 10], ["Beta", "B", 12], ["Gamma", "A", 15], ["Delta", "B", 18], ["Katkestaja", "A", 1], ["Arvestusväline", "B", 2]].entries()) {
    const team = await db.team.create({ data: { competitionId: competition.id, name: String(name), class: String(cls), code: String(index + 1), dnfFromElementOrder: name === "Katkestaja" ? 0 : null, isHorsDeCompetition: name === "Arvestusväline" } })
    await db.computedScore.create({ data: { elementId: element.id, teamId: team.id, penaltyPoints: Number(points) } })
  }
  await page.goto(`/public/${competition.id}/leaderboard`)
  const gamma = page.getByRole("row").filter({ hasText: "Gamma" })
  await expect(gamma.getByRole("cell").first()).toHaveText("3")
  await expect(gamma.locator('[title="Pronks"]')).toHaveCount(1)
  await expect(gamma.locator('[title="Hõbe"]')).toHaveCount(1)
  await expect(gamma.getByRole("cell").nth(7)).toHaveText("5.00")
  await expect(gamma.getByRole("cell").nth(10)).toHaveText("3.00")
  await page.getByRole("checkbox", { name: "Filtreeri klassi järgi" }).check()
  await expect(page.getByRole("row").filter({ hasText: "Beta" })).toHaveCount(0)
  await expect(gamma.getByRole("cell").first()).toHaveText("3")
  await page.getByRole("checkbox", { name: "B", exact: true }).check()
  await expect(page.getByRole("row").filter({ hasText: "Beta" })).toHaveCount(1)
  await page.getByRole("checkbox", { name: "Filtreeri klassi järgi" }).uncheck()
  await expect(page.getByRole("checkbox", { name: "Filtreeri klassi järgi" })).not.toBeChecked()
  await page.screenshot({ path: "/tmp/tulemuste-leaderboard-desktop.png", fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  const mobileGamma = page.locator("details").filter({ hasText: "Gamma" })
  await mobileGamma.locator("summary").click()
  await expect(mobileGamma.getByText("Vahe eelmisega (üld)")).toBeVisible()
  await expect(mobileGamma.locator('[title="Pronks"]')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: "/tmp/tulemuste-leaderboard-mobile.png", fullPage: true })

  await page.goto("/login")
  await page.getByPlaceholder("admin@example.com").fill(user.email)
  await page.locator('input[type="password"]').fill("leaderboard-test-password")
  await page.getByRole("button", { name: "Logi sisse" }).click()
  await page.waitForURL("**/dashboard")
  await page.setViewportSize({ width: 1280, height: 800 })
  for (const suffix of ["", "/print"]) {
    await page.goto(`/dashboard/competitions/${competition.id}/leaderboard${suffix}?class=A`)
    await expect(page.getByRole("row").filter({ hasText: "Beta" })).toHaveCount(0)
    const row = page.getByRole("row").filter({ hasText: "Gamma" })
    await expect(row.getByRole("cell").first()).toHaveText("3")
    await expect(row.getByRole("cell").last()).toHaveText("3.00")
    await expect(page.getByRole("row").filter({ hasText: "Katkestaja" }).getByRole("cell").first()).toHaveText("KAT")
  }
  await page.emulateMedia({ media: "print" })
  await expect(page.getByRole("group", { name: "Klassifilter" })).not.toBeVisible()
  await page.screenshot({ path: "/tmp/tulemuste-leaderboard-print.png", fullPage: true })
})
