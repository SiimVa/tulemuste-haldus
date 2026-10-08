import { createServer, type Server } from "node:http"
import { test, expect } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const databaseUrl = process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/tulemuste_haldus?schema=e2e"
const parsed = new URL(databaseUrl)
if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname) || parsed.searchParams.get("schema") !== "e2e") throw new Error("Access tests require a local e2e schema")
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
const messages: { to: string[]; subject: string; text: string; html: string }[] = []
let failEmail = false
let server: Server

test.beforeAll(async () => {
  server = createServer((req, res) => {
    let body = ""
    req.on("data", chunk => { body += chunk })
    req.on("end", () => {
      messages.push(JSON.parse(body))
      res.writeHead(failEmail ? 500 : 200, { "Content-Type": "application/json" }).end(JSON.stringify({ id: "test-email" }))
    })
  })
  await new Promise<void>(resolve => server.listen(3199, "127.0.0.1", resolve))
})
test.afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()))
  await db.$disconnect()
})

test("rolliloend, nimeotsing, peakorraldaja piirang ja e-postiga kutsed", async ({ page, request, browser }, testInfo) => {
  const stamp = Date.now()
  const passwordHash = await bcrypt.hash("access-test-password", 10)
  const owner = await db.user.create({ data: { name: "Kutse Saatja", email: `owner-${stamp}@example.com`, passwordHash } })
  const organizer = await db.user.create({ data: { name: "Teine Korraldaja", email: `organizer-${stamp}@example.com` } })
  const representative = await db.user.create({ data: { name: "Mari Esindaja", email: `representative-${stamp}@example.com`, passwordHash } })
  const competitor = await db.user.create({ data: { name: "Jüri Võistleja", email: `competitor-${stamp}@example.com` } })
  const candidate = await db.user.create({ data: { name: `Nimega Leitav ${stamp}`, email: `candidate-${stamp}@example.com` } })
  const competition = await db.competition.create({ data: { name: "Sügismäng <2026>", organizerId: owner.id, createdById: owner.id } })
  for (const [user, role] of [[organizer, "ORGANIZER"], [representative, "REPRESENTATIVE"], [competitor, "COMPETITOR"]] as const) {
    await db.competitionMember.create({ data: { competitionId: competition.id, userId: user.id, roles: { create: { role } } } })
  }
  for (let i = 0; i < 10; i++) {
    const user = await db.user.create({ data: { name: `Lisaliige ${i}`, email: `extra-${i}-${stamp}@example.com` } })
    await db.competitionMember.create({ data: { competitionId: competition.id, userId: user.id, roles: { create: { role: "COMPETITOR" } } } })
  }
  const endpoint = `/api/competitions/${competition.id}`
  expect((await request.get(`${endpoint}/role-users?q=Nimega`)).status()).toBe(401)
  await page.goto("/login")
  await page.getByPlaceholder("admin@example.com").fill(owner.email)
  await page.locator('input[type="password"]').fill("access-test-password")
  await page.getByRole("button", { name: "Logi sisse", exact: true }).click()
  await page.waitForURL("/dashboard")
  await page.goto(`/dashboard/competitions/${competition.id}/access`)
  await expect(page.getByText(organizer.name, { exact: true })).toBeVisible()
  await expect(page.getByText(representative.name, { exact: true })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Määra peakorraldajaks" })).toHaveCount(1)
  await page.getByRole("button", { name: /Kuva kõik/ }).click()
  await expect(page.getByText(representative.name, { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Määra peakorraldajaks" })).toHaveCount(1)
  await expect(page.getByText("Lisaliige 9", { exact: true })).toHaveCount(0)
  await page.getByRole("button", { name: /Kuva veel/ }).click()
  await expect(page.getByText("Lisaliige 9", { exact: true })).toBeVisible()
  await page.getByRole("textbox", { name: "Otsi rolliloendist" }).fill("Mari")
  await expect(page.getByText(organizer.name, { exact: true })).toHaveCount(0)
  await expect(page.getByText(representative.name, { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Kuva ainult korraldajad" }).click()
  for (const user of [representative, competitor, candidate]) {
    const denied = await page.request.patch(`${endpoint}/roles`, { data: { userId: user.id } })
    expect(denied.status()).toBe(400)
    expect((await db.competition.findUniqueOrThrow({ where: { id: competition.id } })).organizerId).toBe(owner.id)
  }
  expect(await (await page.request.get(`${endpoint}/role-users?q=N`)).json()).toEqual([])
  const byEmail = await (await page.request.get(`${endpoint}/role-users?q=${candidate.email}`)).json()
  expect(byEmail).toEqual([{ id: candidate.id, name: candidate.name, email: candidate.email }])
  await page.getByRole("button", { name: "Lisa kasutajale rollid", exact: true }).click()
  const search = page.getByRole("combobox", { name: "Kasutaja nimi või e-post" })
  await search.fill(candidate.name.toLowerCase())
  await expect(page.getByRole("option", { name: new RegExp(candidate.name) })).toBeVisible()
  await search.press("ArrowDown")
  await search.press("Enter")
  await page.getByRole("checkbox", { name: /^Korraldaja/ }).check()
  await page.getByRole("button", { name: "Salvesta õigused" }).click()
  await expect(page.getByText("Kasutaja õigused on salvestatud.")).toBeVisible()
  await expect(page.getByText(candidate.name, { exact: true })).toBeVisible()
  // Selecting an existing member must preserve the currently assigned roles.
  await search.fill(candidate.name)
  await page.getByRole("option", { name: new RegExp(candidate.name) }).click()
  await expect(page.getByRole("checkbox", { name: /^Korraldaja/ })).toBeChecked()
  await page.getByRole("button", { name: "Tühista muutmine" }).click()
  const invitedEmail = `invited-${stamp}@example.com`
  await search.fill(invitedEmail)
  await page.getByRole("checkbox", { name: /^Korraldaja/ }).check()
  await page.getByRole("button", { name: "Salvesta õigused" }).click()
  await expect(page.getByText("Kutse on e-postiga saadetud")).toBeVisible()
  expect(messages).toHaveLength(1)
  expect(messages[0].to).toEqual([invitedEmail])
  expect(messages[0].text).toContain(owner.name)
  expect(messages[0].text).toContain(competition.name)
  expect(messages[0].text).toContain("korraldaja")
  expect(messages[0].text).toMatch(/http:\/\/127.0.0.1:3100\/invitations\/[\w-]+/)
  expect(messages[0].html).toContain("&lt;2026&gt;")
  const firstHash = (await db.competitionRoleInvitation.findUniqueOrThrow({ where: { competitionId_email: { competitionId: competition.id, email: invitedEmail } } })).tokenHash
  failEmail = true
  await page.getByText(/Vastuvõtmist ootavad kutsed/).click()
  await page.getByRole("button", { name: "Saada uus kutse" }).click()
  await page.getByRole("button", { name: "Salvesta õigused" }).click()
  await expect(page.getByText("Kutse on loodud, kuid e-kiri jäi saatmata")).toBeVisible()
  await expect(page.getByRole("button", { name: "Kopeeri link", exact: true })).toBeVisible()
  expect((await db.competitionRoleInvitation.findUniqueOrThrow({ where: { competitionId_email: { competitionId: competition.id, email: invitedEmail } } })).tokenHash).not.toBe(firstHash)
  await page.getByRole("button", { name: "Sulge vorm" }).click()
  await page.screenshot({ path: testInfo.outputPath("access-desktop.png"), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: testInfo.outputPath("access-mobile.png"), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  const repContext = await browser.newContext()
  const repPage = await repContext.newPage()
  await repPage.goto("/login")
  await repPage.getByPlaceholder("admin@example.com").fill(representative.email)
  await repPage.locator('input[type="password"]').fill("access-test-password")
  await repPage.getByRole("button", { name: "Logi sisse", exact: true }).click()
  await repPage.waitForURL("/dashboard")
  expect((await repPage.request.get(`${endpoint}/role-users?q=Nimega`)).status()).toBe(403)
  await repContext.close()
  expect((await page.request.patch(`${endpoint}/roles`, { data: { userId: candidate.id } })).status()).toBe(200)
  expect((await db.competition.findUniqueOrThrow({ where: { id: competition.id } })).organizerId).toBe(candidate.id)
})
