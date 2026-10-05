import { createServer, type Server } from "node:http"
import { test, expect } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const databaseUrl = process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/tulemuste_haldus?schema=e2e"
const parsed = new URL(databaseUrl)
if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname) || parsed.searchParams.get("schema") !== "e2e") throw new Error("Message tests require a local e2e schema")
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
const cronSecret = "e2e-cron-secret-used-only-by-playwright-tests"

// Võltsitud Resend (playwright.config.ts: RESEND_API_URL).
type Captured = { path: string; idempotencyKey: string | undefined; body: unknown }
const captured: Captured[] = []
let failNextBatch = false
let server: Server
test.beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = ""
    req.on("data", (chunk) => { raw += chunk })
    req.on("end", () => {
      const path = req.url ?? ""
      if (path === "/emails/batch" && failNextBatch) {
        failNextBatch = false
        captured.push({ path, idempotencyKey: req.headers["idempotency-key"] as string | undefined, body: JSON.parse(raw) })
        res.writeHead(500, { "Content-Type": "application/json" }).end(JSON.stringify({ message: "Ajutine viga" }))
        return
      }
      captured.push({ path, idempotencyKey: req.headers["idempotency-key"] as string | undefined, body: JSON.parse(raw) })
      const count = Array.isArray(JSON.parse(raw)) ? JSON.parse(raw).length : 1
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(path === "/emails/batch" ? { data: Array.from({ length: count }, (_, index) => ({ id: `mock-${index}` })) } : { id: "mock" }))
    })
  })
  await new Promise<void>((resolve) => server.listen(3199, "127.0.0.1", resolve))
})
test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await db.$disconnect()
})

test("korraldaja saadab kirja registreerunud võistkondade esindajatele ja liikmetele", async ({ page, browser }, testInfo) => {
  const stamp = Date.now()
  const organizer = await db.user.create({ data: { email: `korraldaja-${stamp}@example.com`, name: "Korraldaja", passwordHash: await bcrypt.hash("messages-test-password", 10) } })
  const stranger = await db.user.create({ data: { email: `vooras-${stamp}@example.com`, name: "Võõras", passwordHash: await bcrypt.hash("messages-test-password", 10) } })
  const valgaRep = await db.user.create({ data: { email: `valga-${stamp}@example.com`, name: "Valga esindaja" } })
  const waitingRep = await db.user.create({ data: { email: `ootel-${stamp}@example.com`, name: "Ootel esindaja" } })
  const competition = await db.competition.create({ data: { name: `Kirjade võistlus ${stamp}`, createdById: organizer.id, organizerId: organizer.id } })
  const memberList = await db.competitionFormField.create({ data: {
    competitionId: competition.id, key: "members", label: "Võistkonna liikmed", type: "MEMBER_LIST", memberFields: JSON.stringify(["name", "email"]),
  } })
  await db.team.create({ data: {
    competitionId: competition.id, code: "REG-001", name: "Osula sega", class: "KT", pendingRepresentativeEmail: `sega-${stamp}@example.com`, pendingRepresentativeName: "Sega esindaja",
    members: { create: [{ name: "Mari", email: `mari-${stamp}@example.com` }, { name: "Jüri" }] },
  } })
  await db.team.create({ data: {
    competitionId: competition.id, code: "REG-002", name: "Osula NK", class: "NK",
    members: { create: [{ name: "Kati", email: `kati-${stamp}@example.com` }] },
  } })
  await db.registrationApplication.create({ data: {
    competitionId: competition.id, submittedById: valgaRep.id, teamName: "Valga KT", status: "CONFIRMED", submittedAt: new Date(),
    fieldValues: { create: { fieldId: memberList.id, value: JSON.stringify([{ name: "Liis", email: `liis-${stamp}@example.com` }]) } },
  } })
  await db.registrationApplication.create({ data: { competitionId: competition.id, submittedById: waitingRep.id, teamName: "Ootajad", status: "WAITLISTED", submittedAt: new Date() } })

  await page.goto("/login")
  await page.getByPlaceholder("admin@example.com").fill(organizer.email)
  await page.locator('input[type="password"]').fill("messages-test-password")
  await page.getByRole("button", { name: "Logi sisse" }).click()
  await page.waitForURL("**/dashboard")
  await page.goto(`/dashboard/competitions/${competition.id}`)
  await page.getByRole("button", { name: "Registreerimine" }).click()
  await page.getByRole("menuitem", { name: "Kirjad võistkondadele" }).click()
  await page.waitForURL("**/messages")

  // Vaikimisi võistkonnad ja registreeritud avaldused; ootenimekiri ei ole valitud.
  const summary = page.getByRole("status").filter({ hasText: "saajat" })
  await expect(page.getByLabel("Võistkonnad (2)")).toBeChecked()
  await expect(page.getByLabel("Registreeritud (1)")).toBeChecked()
  await expect(page.getByLabel("Ootenimekirjas (1)")).not.toBeChecked()
  await expect(summary).toHaveText("5 saajat · 3 võistkonda")
  await page.getByLabel("Liikmed").uncheck()
  await expect(summary).toHaveText("2 saajat · 2 võistkonda")
  await page.getByLabel("Liikmed").check()
  await page.getByText("Vaata saajaid (5)").click()
  await page.getByLabel(`kati-${stamp}@example.com`).uncheck()
  await expect(summary).toHaveText("4 saajat · 2 võistkonda")

  await page.getByLabel("Teema").fill("Stardiinfo")
  await page.getByLabel("Sisu").fill("Tere!\n\nStart on laupäeval kell 10. Info: https://www.matkamang.ee/info")
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.screenshot({ path: testInfo.outputPath("messages-compose.png"), fullPage: true })
  await page.getByRole("button", { name: "Saada proovikiri mulle" }).click()
  await expect(page.getByText(`Proovikiri saadeti aadressile ${organizer.email}.`)).toBeVisible()
  const testEmail = captured.at(-1)!
  expect(testEmail.path).toBe("/emails")
  expect(testEmail.body).toMatchObject({ to: [organizer.email], subject: "[Proov] Stardiinfo", reply_to: organizer.email })

  // Esimene partii ebaõnnestub; kiri jääb ootele ja cron saadab uuesti.
  failNextBatch = true
  page.once("dialog", (dialog) => dialog.accept())
  await page.getByRole("button", { name: "Saada 4 saajale" }).click()
  await expect(page.getByText("Saadetud 0/4. Ülejäänud saadetakse mõne minuti jooksul.")).toBeVisible()
  const message = await db.competitionMessage.findFirstOrThrow({ where: { competitionId: competition.id }, include: { recipients: { orderBy: { email: "asc" } } } })
  expect(message.recipients.map((recipient) => [recipient.email, recipient.status, recipient.context])).toEqual([
    [`liis-${stamp}@example.com`, "FAILED", "Valga KT (liige)"],
    [`mari-${stamp}@example.com`, "FAILED", "Osula sega (liige)"],
    [`sega-${stamp}@example.com`, "FAILED", "Osula sega (esindaja)"],
    [`valga-${stamp}@example.com`, "FAILED", "Valga KT (esindaja)"],
  ])
  await expect(page.locator(`[data-message="Stardiinfo"] [data-message-status]`)).toHaveText("Saadetud 0/4 · ootel 4")
  const failedAttempt = captured.at(-1)!

  await db.competitionMessageRecipient.updateMany({ where: { messageId: message.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } })
  const cron = await page.request.get("/api/internal/notifications/deliver", { headers: { Authorization: `Bearer ${cronSecret}` } })
  expect(cron.status()).toBe(200)
  expect((await cron.json()).competitionMessages).toMatchObject({ sent: 4, failed: 0 })
  const batch = captured.at(-1)!
  expect(batch.path).toBe("/emails/batch")
  expect(batch.idempotencyKey).toBe(failedAttempt.idempotencyKey)
  const emails = batch.body as { to: string[]; subject: string; reply_to: string; text: string; html: string }[]
  expect(emails.map((email) => email.to)).toEqual([[`liis-${stamp}@example.com`], [`mari-${stamp}@example.com`], [`sega-${stamp}@example.com`], [`valga-${stamp}@example.com`]])
  expect(emails.every((email) => email.subject === "Stardiinfo" && email.reply_to === organizer.email)).toBe(true)
  expect(emails[2].text).toContain(`sest oled registreerunud: Osula sega (esindaja).`)
  expect(emails[0].html).toContain('<a href="https://www.matkamang.ee/info"')

  await page.reload()
  await expect(page.locator(`[data-message="Stardiinfo"] [data-message-status]`)).toHaveText("Saadetud 4/4")

  // Server saadab ainult arvutatud saajatele ja ainult korraldaja nimel.
  const forged = await page.request.post(`/api/competitions/${competition.id}/messages`, {
    data: { subject: "Võlts", body: "Sisu", filters: { groups: ["TEAM"], roles: ["MEMBER"], classes: null }, emails: ["attacker@example.com"] },
  })
  expect(forged.status()).toBe(400)
  expect((await forged.json()).error).toBe("Vali vähemalt üks saaja")
  const strangerContext = await browser.newContext()
  const strangerPage = await strangerContext.newPage()
  await strangerPage.goto("/login")
  await strangerPage.getByPlaceholder("admin@example.com").fill(stranger.email)
  await strangerPage.locator('input[type="password"]').fill("messages-test-password")
  await strangerPage.getByRole("button", { name: "Logi sisse" }).click()
  await strangerPage.waitForURL("**/dashboard")
  const denied = await strangerPage.request.post(`/api/competitions/${competition.id}/messages`, { data: { subject: "x", body: "y", test: true } })
  expect(denied.status()).toBe(403)
  await strangerContext.close()
})
