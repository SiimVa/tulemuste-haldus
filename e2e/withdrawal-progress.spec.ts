import { test, expect } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const url = process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/tulemuste_haldus?schema=e2e"
const parsed = new URL(url)
if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname) || parsed.searchParams.get("schema") !== "e2e") throw new Error("Withdrawal tests require a local e2e schema")
const db = new PrismaClient({ datasources: { db: { url } } })
test.afterAll(() => db.$disconnect())

test("withdrawn teams are explicit in progress and both judge views from the withdrawal element onward", async ({ page }) => {
  const user = await db.user.create({ data: { email: `withdrawal-${Date.now()}@example.com`, name: "Katkestamise test", passwordHash: await bcrypt.hash("withdrawal-test-password", 10) } })
  const competition = await db.competition.create({ data: { name: "Katkestamise võistlus", createdById: user.id, organizerId: user.id, isPublic: true } })
  const active = await db.team.create({ data: { competitionId: competition.id, name: "Jätkaja", code: "1" } })
  const withdrawn = await db.team.create({ data: { competitionId: competition.id, name: "Katkestaja", code: "2", dnfFromElementOrder: 1 } })
  const elements = []
  for (let order = 0; order < 2; order++) {
    const element = await db.scoringElement.create({ data: { competitionId: competition.id, name: `Etapp ${order + 1}`, code: `KP${order + 1}`, order,
      fields: { create: { name: "points", label: "Punktid", type: "NUMBER" } },
    } })
    elements.push(element)
    await db.result.create({ data: { elementId: element.id, teamId: active.id, values: '{"points":"5"}' } })
  }
  const token = await db.accessToken.create({ data: { competitionId: competition.id, type: "JUDGE", name: "Kohtunik" } })
  await page.goto(`/public/${competition.id}/dashboard`)
  const stage = page.locator("div").filter({ has: page.getByText("Etapp 2", { exact: true }) }).filter({ hasText: "1/1" }).last()
  await expect(stage).toContainText("1 KAT")

  await page.goto(`/judge/${token.token}`)
  await page.getByRole("button", { name: "[KP2] Etapp 2", exact: true }).click()
  await expect(page.getByRole("button", { name: /Katkestaja/ })).toContainText("KAT · tulemust ei oodata")
  await page.getByRole("button", { name: /Katkestaja/ }).click()
  await expect(page.getByText(/KAT — võistkond/)).toBeVisible()
  await page.getByRole("button", { name: "[KP1] Etapp 1", exact: true }).click()
  await expect(page.getByRole("button", { name: /Katkestaja/ })).toContainText("Sisestamata")
  await expect(page.getByRole("button", { name: /Katkestaja/ })).toContainText("KAT hilisemas elemendis")

  await page.goto("/login")
  await page.getByPlaceholder("admin@example.com").fill(user.email)
  await page.locator('input[type="password"]').fill("withdrawal-test-password")
  await page.getByRole("button", { name: "Logi sisse" }).click()
  await page.waitForURL("**/dashboard")
  await page.goto(`/dashboard/competitions/${competition.id}`)
  await expect(page.getByRole("link", { name: /Etapp 2/ }).locator("..")).toContainText("1/11 KAT")
  await page.goto(`/dashboard/competitions/${competition.id}/elements/${elements[1].id}`)
  await expect(page.getByText("1 / 1 sisestatud", { exact: false })).toBeVisible()
  await expect(page.getByText(/Lisa kõigile sisestamata/)).toHaveCount(0)
  await page.goto(`/dashboard/judge/${competition.id}`)
  await page.getByRole("button", { name: "[KP2] Etapp 2", exact: true }).click()
  await expect(page.getByRole("button", { name: /Katkestaja/ })).toContainText("KAT · tulemust ei oodata")
  await page.screenshot({ path: "/tmp/tulemuste-dnf-judge.png", fullPage: true })
  await db.team.update({ where: { id: withdrawn.id }, data: { dnfFromElementOrder: null } })
  await page.reload()
  await page.getByRole("button", { name: "[KP2] Etapp 2", exact: true }).click()
  await expect(page.getByRole("button", { name: /Katkestaja/ })).toContainText("Sisestamata")
  await expect(page.getByText("1/2 sisestatud", { exact: true })).toBeVisible()
})
