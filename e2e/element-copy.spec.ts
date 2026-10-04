import { test, expect } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const databaseUrl = process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/tulemuste_haldus?schema=e2e"
const parsed = new URL(databaseUrl)
if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname) || parsed.searchParams.get("schema") !== "e2e") throw new Error("Element copy tests require a local e2e schema")
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
test.afterAll(() => db.$disconnect())

test("korraldaja kopeerib mitu hindamiselementi korraga", async ({ page }, testInfo) => {
  const stamp = Date.now()
  const user = await db.user.create({ data: { email: `copy-${stamp}@example.com`, name: "Kopeerija", passwordHash: await bcrypt.hash("copy-test-password", 10) } })
  const stranger = await db.user.create({ data: { email: `copy-stranger-${stamp}@example.com`, name: "Võõras" } })
  const source = await db.competition.create({ data: { name: `Lähtevõistlus ${stamp}`, createdById: user.id, organizerId: user.id } })
  const target = await db.competition.create({ data: { name: `Sihtvõistlus ${stamp}`, createdById: user.id, organizerId: user.id } })
  const foreign = await db.competition.create({ data: { name: `Võõras võistlus ${stamp}`, createdById: stranger.id, organizerId: stranger.id } })

  const first = await db.scoringElement.create({ data: {
    competitionId: source.id, code: "KP1", name: "Esimene KP", order: 0, maxValue: 30,
    fields: { create: { name: "aeg", label: "Aeg", type: "TIME", rankingPriority: 1, order: 0 } },
    exceptions: { create: [{ label: "Ei läbinud", penalty: 40, order: 0, kind: "NOT_PASSED" }, { label: "Ebaõnnestus", penalty: 30, order: 1, kind: "FAILED" }] },
    calcMethod: { create: { type: "RELATIVE_RANKING", params: JSON.stringify({ higherIsBetter: false, minPoints: 0 }) } },
  } })
  const combined = await db.scoringElement.create({ data: { competitionId: source.id, code: "KP2", name: "Kombineeritud KP", order: 1 } })
  await db.elementSection.create({ data: {
    elementId: combined.id, name: "Osa A", order: 0, maxValue: 10,
    fields: { create: { elementId: combined.id, name: "punktid", label: "Punktid", type: "NUMBER", rankingPriority: 1, order: 0 } },
    calcMethod: { create: { type: "ABSOLUTE_POINTS", params: "{}" } },
  } })
  await db.scoringElement.create({ data: { competitionId: source.id, code: "KP3", name: "Tühistatud KP", order: 2, isCancelled: true } })
  // Sihtvõistluses on tähis KP1 juba kasutusel.
  await db.scoringElement.create({ data: { competitionId: target.id, code: "KP1", name: "Olemasolev KP", order: 0 } })
  const foreignElement = await db.scoringElement.create({ data: { competitionId: foreign.id, code: "X1", name: "Võõras element", order: 0 } })

  await page.goto("/login")
  await page.getByPlaceholder("admin@example.com").fill(user.email)
  await page.locator('input[type="password"]').fill("copy-test-password")
  await page.getByRole("button", { name: "Logi sisse" }).click()
  await page.waitForURL("**/dashboard")

  // Kõik või mitte ükski: õigusteta, olematu või tühi valik ei kopeeri midagi.
  const endpoint = `/api/competitions/${target.id}/elements/copy`
  expect((await page.request.post(endpoint, { data: { sourceElementIds: [first.id, foreignElement.id] } })).status()).toBe(403)
  expect((await page.request.post(endpoint, { data: { sourceElementIds: [first.id, "olematu"] } })).status()).toBe(404)
  expect((await page.request.post(endpoint, { data: { sourceElementIds: [] } })).status()).toBe(400)
  expect((await page.request.post(`/api/competitions/${foreign.id}/elements/copy`, { data: { sourceElementIds: [first.id] } })).status()).toBe(403)
  expect(await db.scoringElement.count({ where: { competitionId: target.id } })).toBe(1)

  await page.goto(`/dashboard/competitions/${target.id}`)
  await page.getByRole("button", { name: "+ Kopeeri elemente" }).click()
  const dialog = page.getByRole("dialog", { name: "Kopeeri hindamiselemendid" })
  await dialog.getByLabel("Lähtevõistlus").selectOption(source.id)
  const sources = dialog.getByRole("group", { name: "Hindamiselemendid" })
  await expect(sources.getByRole("checkbox")).toHaveCount(3)
  await expect(dialog.getByRole("button", { name: "Kopeeri element" })).toBeDisabled()
  await dialog.getByRole("button", { name: "Vali kõik" }).click()
  await expect(dialog.getByRole("button", { name: "Kopeeri 3 elementi" })).toBeEnabled()
  await sources.getByRole("checkbox", { name: /KP3 · Tühistatud KP/ }).uncheck()
  await expect(dialog.getByText("Valitud 2/3.", { exact: false })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await dialog.screenshot({ path: testInfo.outputPath("element-copy-dialog.png") })
  await page.setViewportSize({ width: 1280, height: 800 })

  const copyResponse = page.waitForResponse((response) => response.url().endsWith(endpoint) && response.request().method() === "POST")
  await dialog.getByRole("button", { name: "Kopeeri 2 elementi" }).click()
  expect((await copyResponse).status()).toBe(201)
  await expect(page.getByRole("status").filter({ hasText: "Kopeeriti 2 elementi." })).toBeVisible()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByText("Kombineeritud KP")).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath("element-copy-done-mobile.png") })
  await page.setViewportSize({ width: 1280, height: 800 })

  const copied = await db.scoringElement.findMany({
    where: { competitionId: target.id },
    orderBy: { order: "asc" },
    include: { fields: { where: { sectionId: null } }, exceptions: { orderBy: { order: "asc" } }, calcMethod: true, sections: { include: { fields: true, calcMethod: true } } },
  })
  expect(copied.map((element) => [element.code, element.name, element.order])).toEqual([
    ["KP1", "Olemasolev KP", 0], ["KP1-2", "Esimene KP", 1], ["KP2", "Kombineeritud KP", 2],
  ])
  expect(copied[1].fields.map((field) => field.name)).toEqual(["aeg"])
  expect(copied[1].exceptions.map((exception) => [exception.label, exception.kind])).toEqual([["Ei läbinud", "NOT_PASSED"], ["Ebaõnnestus", "FAILED"]])
  expect(copied[1].calcMethod?.type).toBe("RELATIVE_RANKING")
  expect(copied[2].sections.map((section) => [section.name, section.fields.map((field) => field.name), section.calcMethod?.type])).toEqual([["Osa A", ["punktid"], "ABSOLUTE_POINTS"]])
})
