import { test, expect } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const databaseUrl = process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/tulemuste_haldus?schema=e2e"
const parsed = new URL(databaseUrl)
if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname) || parsed.searchParams.get("schema") !== "e2e") throw new Error("Result delete tests require a local e2e schema")
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
test.afterAll(() => db.$disconnect())

test("proovitulemused saab kustutada ka siis, kui elemendil on kohustuslik väli", async ({ page }) => {
  const stamp = Date.now()
  const user = await db.user.create({ data: { email: `delete-${stamp}@example.com`, name: "Kustutaja", passwordHash: await bcrypt.hash("delete-test-password", 10) } })
  const competition = await db.competition.create({ data: { name: "Kustutamise võistlus", createdById: user.id, organizerId: user.id, scoringMode: "PLUS" } })
  const element = await db.scoringElement.create({ data: {
    competitionId: competition.id, code: "KP1", name: "Šifreerimine", maxValue: 30,
    fields: { create: [
      { name: "nato", label: "Kasutab NATO tähestikku?", type: "POINTS_SELECT", order: 0, validation: JSON.stringify({ required: true }),
        meta: JSON.stringify({ options: [{ id: "alati", label: "Alati", points: 2 }, { id: "mitte", label: "Mitte", points: 0 }] }) },
      { name: "sedel", label: "Õigesti avatud sedel", type: "NUMBER", order: 1, rankingPriority: 1, meta: JSON.stringify({ higherIsBetter: true }) },
    ] },
    calcMethod: { create: { type: "RELATIVE_RANKING", params: JSON.stringify({ higherIsBetter: true, minPoints: 0 }) } },
  } })
  const teams: Record<string, string> = {}
  for (const [code, name, sedel] of [["REG-001", "Osula sega", "9"], ["REG-002", "Osula NK", "90"], ["REG-003", "Valga KT", "50"]]) {
    teams[name] = (await db.team.create({ data: { competitionId: competition.id, code, name } })).id
    await db.result.create({ data: { elementId: element.id, teamId: teams[name], values: JSON.stringify({ nato: "alati", sedel }) } })
  }
  const judge = await db.accessToken.create({ data: { competitionId: competition.id, elementId: element.id, type: "JUDGE", name: "KP1 kohtunik" } })
  const resultCount = (name: string) => db.result.count({ where: { elementId: element.id, teamId: teams[name] } })
  const scoreCount = (name: string) => db.computedScore.count({ where: { elementId: element.id, teamId: teams[name] } })

  await page.goto("/login")
  await page.getByPlaceholder("admin@example.com").fill(user.email)
  await page.locator('input[type="password"]').fill("delete-test-password")
  await page.getByRole("button", { name: "Logi sisse" }).click()
  await page.waitForURL("**/dashboard")
  expect((await page.request.post(`/api/competitions/${competition.id}/recalculate`)).status()).toBe(200)
  expect(await scoreCount("Osula sega")).toBe(1)

  await page.goto(`/dashboard/competitions/${competition.id}/elements/${element.id}`)
  const row = (name: string) => page.getByRole("row").filter({ hasText: name })

  // Kohustuslik väli kehtib edasi, kui sisestus pole tühi.
  await row("Valga KT").getByRole("button", { name: "Muuda" }).click()
  await row("Valga KT").getByLabel("Kasutab NATO tähestikku?").selectOption("")
  await row("Valga KT").getByRole("button", { name: "Salvesta" }).click()
  await expect(page.getByText("Kasutab NATO tähestikku? on kohustuslik")).toBeVisible()
  expect(await resultCount("Valga KT")).toBe(1)

  // Kõigi väljade tühjendamine kustutab tulemuse.
  await row("Valga KT").locator('input[type="number"]').fill("")
  await row("Valga KT").getByRole("button", { name: "Salvesta" }).click()
  await expect(row("Valga KT").getByRole("button", { name: "Sisesta" })).toBeVisible()
  expect([await resultCount("Valga KT"), await scoreCount("Valga KT")]).toEqual([0, 0])

  // Nupp „Kustuta” kinnitusega.
  await row("Osula sega").getByRole("button", { name: "Muuda" }).click()
  page.once("dialog", (dialog) => dialog.dismiss())
  await row("Osula sega").getByRole("button", { name: "Kustuta" }).click()
  expect(await resultCount("Osula sega")).toBe(1)
  page.once("dialog", (dialog) => dialog.accept())
  await row("Osula sega").getByRole("button", { name: "Kustuta" }).click()
  await expect(row("Osula sega").getByRole("button", { name: "Sisesta" })).toBeVisible()
  expect([await resultCount("Osula sega"), await scoreCount("Osula sega")]).toEqual([0, 0])
  await expect(page.getByText("1 / 3 sisestatud")).toBeVisible()

  // Kohtunik kustutab vale sisestuse oma vaates.
  await page.goto(`/judge/${judge.token}`)
  await page.getByRole("button", { name: /Osula NK/ }).click()
  page.once("dialog", (dialog) => dialog.accept())
  await page.getByRole("button", { name: "Kustuta tulemus" }).click()
  await expect(page.getByText(/Osula NK \(tulemus kustutatud\)/)).toBeVisible()
  await expect(page.getByRole("button", { name: /Osula NK/ })).toContainText("Sisestamata")
  expect([await resultCount("Osula NK"), await scoreCount("Osula NK")]).toEqual([0, 0])
})
