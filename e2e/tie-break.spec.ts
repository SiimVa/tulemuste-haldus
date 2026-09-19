import { test, expect } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"
import * as XLSX from "xlsx"

const url = process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/tulemuste_haldus?schema=e2e"
const parsed = new URL(url)
if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname) || parsed.searchParams.get("schema") !== "e2e") throw new Error("Tie-break tests require local e2e schema")
const db = new PrismaClient({ datasources: { db: { url } } })
test.afterAll(() => db.$disconnect())

test("organizer settings, priority, explanations, exports and athlete standings use the same tie-break", async ({ page, request }) => {
  const password = "tie-break-test-password"
  const user = await db.user.create({ data: { email: `tie-${Date.now()}@example.com`, name: "Viigilahutuse korraldaja", role: "ADMIN", passwordHash: await bcrypt.hash(password, 10) } })
  const competition = await db.competition.create({ data: { name: "Viigilahutuse võistlus", createdById: user.id, organizerId: user.id, scoringMode: "PLUS", isPublic: true, athleteShowRank: true, athleteShowTotal: true, athletePointsMode: "EXACT" } })
  const elements = []
  for (let i = 0; i < 3; i++) elements.push(await db.scoringElement.create({ data: {
    competitionId: competition.id, code: `KP${i + 1}`, name: `Ülesanne ${i + 1}`, order: i,
    fields: { create: { name: "points", label: "Punktid", type: "NUMBER", isResultField: true } },
    calcMethod: { create: { type: "ABSOLUTE_POINTS", params: "{}" } },
  } }))
  const teams = []
  const values = [[10, 10, 0], [7, 7, 6], [6, 6, 5], [5, 5, 4], [4, 4, 3]]
  for (let i = 0; i < 5; i++) {
    const team = await db.team.create({ data: { competitionId: competition.id, name: `Tiim ${i + 1}`, code: String(i + 1), class: "A" } })
    teams.push(team)
    for (let j = 0; j < 3; j++) {
      await db.computedScore.create({ data: { teamId: team.id, elementId: elements[j].id, penaltyPoints: values[i][j] } })
      await db.result.create({ data: { teamId: team.id, elementId: elements[j].id, values: JSON.stringify({ points: String(values[i][j]) }) } })
    }
  }
  const endpoint = `/api/competitions/${competition.id}/tie-break`
  expect((await request.put(endpoint, { data: {} })).status()).toBe(401)
  await page.goto("/login")
  await page.getByPlaceholder("admin@example.com").fill(user.email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole("button", { name: "Logi sisse" }).click()
  await page.waitForURL("**/dashboard")
  await page.goto(`/dashboard/competitions/${competition.id}/settings`)
  const settings = page.getByRole("region", { name: "Viigilahutuse seaded" })
  await expect(settings.getByLabel("Lülita viigilahutus sisse")).not.toBeChecked()
  await settings.getByLabel("Lülita viigilahutus sisse").check()
  await expect(settings.getByLabel("Kõik kontrollpunktid (vaikimisi)")).toBeChecked()
  await settings.getByLabel("Rohkem kõrgemaid kohti", { exact: true }).check()
  await settings.getByLabel("Parem halvim koht", { exact: true }).check()
  await settings.getByRole("button", { name: "Parem halvim koht üles", exact: true }).click()
  await settings.getByRole("button", { name: "Salvesta viigilahutus", exact: true }).click()
  await expect(settings.getByRole("status")).toHaveText("Viigilahutuse seaded salvestatud.")
  await page.reload()
  await expect(settings.getByLabel("Parem halvim koht", { exact: true })).toBeChecked()
  await settings.screenshot({ path: "/tmp/tulemuste-tiebreak-settings.png" })
  const saved = (await (await page.request.get(endpoint)).json()).config
  expect(saved.rules[0].kind).toBe("BEST_WORST")
  async function standings() { return (await (await page.request.get(`/api/competitions/${competition.id}/leaderboard`)).json()).leaderboard }
  expect((await standings())[0].team.id).toBe(teams[1].id)
  for (const path of [`/public/${competition.id}/leaderboard`, `/dashboard/competitions/${competition.id}/leaderboard`, `/dashboard/competitions/${competition.id}/leaderboard/print`]) {
    await page.goto(path)
    const teamRow = page.locator("tbody > tr").first()
    await expect(teamRow.getByRole("cell").nth(path.endsWith("/print") ? 3 : 2)).toContainText("Tiim 2")
    await expect(teamRow.getByRole("cell").first()).toHaveText("1")
    await expect(teamRow).toContainText("Parem halvim koht")
  }
  await page.goto(`/public/${competition.id}/leaderboard`)
  await page.screenshot({ path: "/tmp/tulemuste-tiebreak-leaderboard.png", fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  const card = page.locator(`details[data-lb-team="${teams[1].id}"]`)
  await card.locator("summary").click()
  await expect(card.getByText(/Parem halvim koht/).first()).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: "/tmp/tulemuste-tiebreak-mobile.png", fullPage: true })
  await page.setViewportSize({ width: 1280, height: 800 })
  const csv = await (await page.request.get(`/api/competitions/${competition.id}/export?format=csv`)).text()
  expect(csv).toContain("Viigilahutus (üld)")
  expect(csv.indexOf('"Tiim 2"')).toBeLessThan(csv.indexOf('"Tiim 1"'))
  expect(csv).toContain("Parem halvim koht")
  const xlsx = await page.request.get(`/api/competitions/${competition.id}/export?format=xlsx`)
  const book = XLSX.read(await xlsx.body(), { type: "buffer" })
  expect(XLSX.utils.sheet_to_csv(book.Sheets[book.SheetNames[0]])).toContain("Parem halvim koht")
  const token = await db.accessToken.create({ data: { competitionId: competition.id, teamId: teams[1].id, type: "ATHLETE", name: "Võistleja" } })
  await page.goto(`/athlete/${token.token}`)
  await expect(page.getByText(/Parem halvim koht/).first()).toBeVisible()
  const simulation = await page.request.post(`/api/competitions/${competition.id}/simulate`, { data: { teamId: teams[1].id, overrides: {} } })
  expect((await simulation.json()).rank).toBe(1)
  await page.goto(`/public/${competition.id}/analysis`)
  await page.getByRole("combobox").first().selectOption(teams[1].id)
  await expect(page.getByText(/Parem halvim koht/).first()).toBeVisible()

  // Preferred and manual rule editors, with an explicit public explanation.
  await page.goto(`/dashboard/competitions/${competition.id}/settings`)
  await settings.getByLabel("Parem halvim koht", { exact: true }).uncheck()
  await settings.getByLabel("Rohkem kõrgemaid kohti", { exact: true }).uncheck()
  await settings.getByLabel("Eelistatud ülesanne", { exact: true }).check()
  await settings.getByLabel("Eelistatud element").selectOption(elements[0].id)
  await settings.getByLabel("Muu (käsitsi)", { exact: true }).check()
  await settings.getByLabel("Avalik põhjendus").fill("Lisaküsimuse vastus")
  await settings.getByLabel("Lisa võistkond järjekorda").selectOption(teams[1].id)
  await settings.getByLabel("Lisa võistkond järjekorda").selectOption(teams[0].id)
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await settings.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  await settings.screenshot({ path: "/tmp/tulemuste-tiebreak-manual-mobile.png" })
  await page.setViewportSize({ width: 1280, height: 800 })
  await settings.getByRole("button", { name: "Salvesta viigilahutus", exact: true }).click()
  await expect(settings.getByRole("status")).toHaveText("Viigilahutuse seaded salvestatud.")
  expect((await standings())[0].team.id).toBe(teams[0].id)
  await settings.getByLabel("Eelistatud ülesanne", { exact: true }).uncheck()
  await settings.getByRole("button", { name: "Salvesta viigilahutus", exact: true }).click()
  await expect(settings.getByRole("status")).toHaveText("Viigilahutuse seaded salvestatud.")
  expect((await standings())[0].tieBreakReason).toContain("Lisaküsimuse vastus")
  expect((await standings())[0].team.id).toBe(teams[1].id)
  const manualConfig = (await (await page.request.get(endpoint)).json()).config
  expect((await page.request.put(endpoint, { data: { ...manualConfig, elementIds: ["foreign-element"] } })).status()).toBe(400)
  expect((await page.request.put(endpoint, { data: { ...manualConfig, rules: [{ kind: "MANUAL", enabled: true, teamOrder: [teams[0].id, "foreign-team"], reason: "Test" }] } })).status()).toBe(400)
  expect((await page.request.put(endpoint, { data: { ...manualConfig, rules: [{ kind: "MANUAL", enabled: true }] } })).status()).toBe(400)
  await settings.getByLabel("Lülita viigilahutus sisse").uncheck()
  await settings.getByRole("button", { name: "Salvesta viigilahutus", exact: true }).click()
  await expect(settings.getByRole("status")).toHaveText("Viigilahutuse seaded salvestatud.")
  expect((await standings()).slice(0, 3).map((row: { rank: number }) => row.rank)).toEqual([1, 1, 3])

  // Copied competitions retain rule priority but use their own element IDs and no manual decisions.
  const copyResponse = await page.request.post(`/api/competitions/${competition.id}/copy`, { data: { includeElements: true } })
  expect(copyResponse.status()).toBe(201)
  const copiedId = (await copyResponse.json()).id
  const copied = await db.competition.findUniqueOrThrow({ where: { id: copiedId }, include: { elements: true } })
  const copiedConfig = JSON.parse(copied.tieBreakConfig)
  expect(copiedConfig.rules.find((rule: { kind: string }) => rule.kind === "MANUAL")).toEqual({ kind: "MANUAL", enabled: false })
  const preferredId = copiedConfig.rules.find((rule: { kind: string }) => rule.kind === "PREFERRED_ELEMENT").elementId
  expect(copied.elements.map(element => element.id)).toContain(preferredId)
  expect(preferredId).not.toBe(elements[0].id)

  // Another ordinary account cannot configure the competition.
  const outsider = await db.user.create({ data: { email: `tie-outsider-${Date.now()}@example.com`, name: "Kõrvaline", passwordHash: await bcrypt.hash(password, 10) } })
  await page.context().clearCookies()
  await page.goto("/login")
  await page.getByPlaceholder("admin@example.com").fill(outsider.email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole("button", { name: "Logi sisse" }).click()
  await page.waitForURL("**/dashboard")
  expect((await page.request.put(endpoint, { data: manualConfig })).status()).toBe(403)
})
