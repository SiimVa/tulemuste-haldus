import { expect, test, type Page } from "@playwright/test"
import bcrypt from "bcryptjs"
import { prisma } from "../src/lib/prisma"
import { consumeRateLimit, purgeExpiredSecurityData, securityFingerprint } from "../src/lib/security.server"
import { apiRateLimitPolicy, LOGIN_ACCOUNT_POLICY } from "../src/lib/security"

const databaseURL = process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/tulemuste_haldus?schema=e2e"
const database = new URL(databaseURL)
if (!["127.0.0.1", "localhost", "[::1]"].includes(database.hostname) || database.searchParams.get("schema") !== "e2e") {
  throw new Error("Security tests require a local PostgreSQL schema=e2e database")
}
process.env.DATABASE_URL = databaseURL
process.env.AUTH_SECRET = "e2e-auth-secret-used-only-by-playwright-tests"

const admin = { email: "security-admin.e2e@example.com", password: "security-test-password-123" }
const member = { email: "security-member.e2e@example.com", password: "security-test-password-456" }
let adminId = ""
let memberId = ""

async function login(page: Page, account: typeof admin) {
  await page.goto("/login")
  await page.getByPlaceholder("admin@example.com").fill(account.email)
  await page.locator('input[type="password"]').fill(account.password)
  await page.getByRole("button", { name: "Logi sisse" }).click()
  await page.waitForURL("**/dashboard")
}

test.describe.serial("turvalogi ja päringupiirangud", () => {
  test.beforeAll(async () => {
    for (const [account, role] of [[admin, "ADMIN"], [member, "USER"]] as const) {
      const passwordHash = await bcrypt.hash(account.password, 12)
      const user = await prisma.user.upsert({
        where: { email: account.email },
        create: { email: account.email, name: role === "ADMIN" ? "Turvatesti admin" : "Turvatesti kasutaja", passwordHash, role },
        update: { passwordHash, role },
      })
      if (role === "ADMIN") adminId = user.id
      else memberId = user.id
    }
  })
  test.afterAll(async () => { await prisma.$disconnect() })

  test("PostgreSQL piirang on atomaarne ja aegunud aken algab uuesti", async () => {
    const policy = { scope: "e2e-concurrency", limit: 5, seconds: 60 }
    const identity = `concurrent-${Date.now()}`
    const results = await Promise.all(Array.from({ length: 30 }, () => consumeRateLimit(policy, identity)))
    expect(results.filter(result => result.allowed)).toHaveLength(5)
    expect(results.filter(result => result.firstBlocked)).toHaveLength(1)
    expect(results.every(result => result.retryAfter > 0 && result.retryAfter <= 60)).toBe(true)
    const key = securityFingerprint(policy.scope, identity)
    await prisma.rateLimitBucket.update({ where: { key }, data: { expiresAt: new Date(0) } })
    expect((await consumeRateLimit(policy, identity)).allowed).toBe(true)
    expect((await prisma.rateLimitBucket.findUniqueOrThrow({ where: { key } })).count).toBe(1)
  })

  test("turvalogi on ainult administraatorile ja ei salvesta saladusi", async ({ page, browser, request }, testInfo) => {
    expect((await request.get("/api/security-events")).status()).toBe(401)
    const context = await browser.newContext()
    const memberPage = await context.newPage()
    await login(memberPage, member)
    expect((await memberPage.request.get("/api/security-events")).status()).toBe(403)
    await memberPage.goto("/dashboard/security")
    await expect(memberPage).toHaveURL(/\/dashboard$/)
    const secret = "private-value-not-for-security-logs"
    expect((await memberPage.request.post(`/api/competitions?token=${secret}`, {
      headers: { "x-access-token": secret }, data: { name: secret },
    })).status()).toBe(403)
    await login(page, admin)
    const response = await page.request.post("/api/users", {
      data: { email: `audit-${Date.now()}@example.com`, name: "Audit test", password: secret },
    })
    expect(response.status()).toBe(200)
    const created = await response.json()
    const event = await prisma.securityEvent.findFirstOrThrow({
      where: { action: "ACCOUNT_CHANGE", actorUserId: adminId, targetIds: { path: ["userId"], equals: created.id } },
    })
    expect(event.outcome).toBe("SUCCEEDED")
    expect(event.status).toBe(200)
    const logs = await page.request.get("/api/security-events")
    expect(logs.status()).toBe(200)
    expect(logs.headers()["cache-control"]).toContain("no-store")
    const allEvents = JSON.stringify(await prisma.securityEvent.findMany())
    for (const privateValue of [secret, admin.password, member.password, admin.email, member.email]) {
      expect(allEvents).not.toContain(privateValue)
    }
    await page.goto("/dashboard/security")
    await expect(page.getByRole("heading", { name: "Turvalogi" })).toBeVisible()
    await expect(page.getByText("Laadin turvalogi…")).toBeHidden()
    await page.getByLabel("Tulemus", { exact: true }).selectOption("DENIED")
    await expect(page.getByText("Laadin turvalogi…")).toBeHidden()
    await expect(page.getByText("Keeldutud · HTTP 403").first()).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath("security-desktop.png"), fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath("security-mobile.png"), fullPage: true })
    await context.close()
  })

  test("API 429 ei muuda andmeid ja õiguse eemaldamine jõustub olemasolevas sessioonis", async ({ page }) => {
    await login(page, admin)
    const policy = apiRateLimitPolicy("/api/users", "POST", true)
    const key = securityFingerprint(policy.scope, `user:${adminId}`)
    await prisma.rateLimitBucket.upsert({ where: { key },
      create: { key, count: policy.limit, expiresAt: new Date(Date.now() + 60000) },
      update: { count: policy.limit, expiresAt: new Date(Date.now() + 60000) },
    })
    const email = `blocked-${Date.now()}@example.com`
    const response = await page.request.post("/api/users", { data: { email, name: "Blocked", password: "not-saved-password" } })
    expect(response.status()).toBe(429)
    expect(Number(response.headers()["retry-after"])).toBeGreaterThan(0)
    expect(await prisma.user.findUnique({ where: { email } })).toBeNull()
    expect(await prisma.securityEvent.count({ where: { actorUserId: adminId, outcome: "RATE_LIMITED" } })).toBeGreaterThan(0)
    await prisma.rateLimitBucket.update({ where: { key }, data: { expiresAt: new Date(0) } })
    await prisma.user.update({ where: { id: adminId }, data: { role: "USER" } })
    try {
      expect((await page.request.get("/api/security-events")).status()).toBe(403)
      expect((await page.request.get("/api/users")).status()).toBe(403)
    } finally {
      await prisma.user.update({ where: { id: adminId }, data: { role: "ADMIN" } })
    }
  })

  test("sisselogimiskatsed piiratakse ka õige parooli korral ja kustutatud konto sessioon aegub", async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await login(page, member)
    const temporary = await prisma.user.create({ data: { email: `deleted-${Date.now()}@example.com`, name: "Temporary", passwordHash: await bcrypt.hash(member.password, 12) } })
    const temporaryContext = await browser.newContext()
    const temporaryPage = await temporaryContext.newPage()
    await login(temporaryPage, { email: temporary.email, password: member.password })
    await prisma.user.delete({ where: { id: temporary.id } })
    expect((await temporaryPage.request.get("/api/representative/teams")).status()).toBe(401)
    await temporaryContext.close()
    const key = securityFingerprint(LOGIN_ACCOUNT_POLICY.scope, member.email)
    await prisma.rateLimitBucket.upsert({ where: { key },
      create: { key, count: LOGIN_ACCOUNT_POLICY.limit, expiresAt: new Date(Date.now() + 900000) },
      update: { count: LOGIN_ACCOUNT_POLICY.limit, expiresAt: new Date(Date.now() + 900000) },
    })
    const freshContext = await browser.newContext()
    const fresh = await freshContext.newPage()
    await fresh.goto("/login")
    await fresh.getByPlaceholder("admin@example.com").fill(member.email)
    await fresh.locator('input[type="password"]').fill(member.password)
    await fresh.getByRole("button", { name: "Logi sisse" }).click()
    await expect(fresh.getByText("Vale e-post või parool")).toBeVisible()
    expect((await fresh.request.get("/api/representative/teams")).status()).toBe(401)
    expect(await prisma.securityEvent.count({ where: { action: "LOGIN", outcome: "RATE_LIMITED" } })).toBeGreaterThan(0)
    await prisma.rateLimitBucket.update({ where: { key }, data: { expiresAt: new Date(0) } })
    await freshContext.close()
    await context.close()
  })

  test("turvapäised säilitavad avaliku manustamise ja cron-koristus eemaldab aegunud kirjed", async ({ request }) => {
    const loginResponse = await request.get("/login")
    expect(loginResponse.headers()["x-content-type-options"]).toBe("nosniff")
    expect(loginResponse.headers()["referrer-policy"]).toBe("no-referrer")
    expect(loginResponse.headers()["content-security-policy"]).toContain("frame-ancestors 'self'")
    expect(loginResponse.headers()["x-powered-by"]).toBeUndefined()
    const publicResponse = await request.get("/competitions")
    expect(publicResponse.headers()["x-frame-options"]).toBeUndefined()
    const old = await prisma.securityEvent.create({ data: { action: "API_READ", outcome: "DENIED", route: "/api/users", method: "GET", createdAt: new Date(0) } })
    const recent = await prisma.securityEvent.create({ data: { action: "API_READ", outcome: "DENIED", route: "/api/users", method: "GET", actorUserId: memberId } })
    await purgeExpiredSecurityData()
    expect(await prisma.securityEvent.findUnique({ where: { id: old.id } })).toBeNull()
    expect(await prisma.securityEvent.findUnique({ where: { id: recent.id } })).not.toBeNull()
    expect(await prisma.rateLimitBucket.count({ where: { expiresAt: { lt: new Date() } } })).toBe(0)
  })

  test("logi alustamise tõrge peatab muudatuse ja handleri viga salvestub", async ({ page }) => {
    await login(page, admin)
    const email = `audit-unavailable-${Date.now()}@example.com`
    // Test-only database constraint, removed even when the assertion fails.
    await prisma.$executeRaw`ALTER TABLE "SecurityEvent" ADD CONSTRAINT "e2e_reject_account_audit" CHECK ("action" <> 'ACCOUNT_CHANGE') NOT VALID`
    try {
      const response = await page.request.post("/api/users", { data: { email, name: "Not created", password: "not-saved-password" } })
      expect(response.status()).toBe(503)
      expect(await prisma.user.findUnique({ where: { email } })).toBeNull()
    } finally {
      await prisma.$executeRaw`ALTER TABLE "SecurityEvent" DROP CONSTRAINT "e2e_reject_account_audit"`
    }
    const missingId = "c" + "z".repeat(24)
    const response = await page.request.patch(`/api/users/${missingId}`, { data: { password: "not-logged-password" } })
    expect(response.status()).toBe(500)
    const event = await prisma.securityEvent.findFirstOrThrow({ where: { actorUserId: adminId, targetIds: { path: ["id"], equals: missingId } }, orderBy: { createdAt: "desc" } })
    expect(event.outcome).toBe("FAILED")
    expect(event.status).toBe(500)
  })

  test("tokeniga kohtuniku tegutsejat ei omistata õigusteta sessioonile", async ({ page }) => {
    await login(page, member)
    const competition = await prisma.competition.create({ data: { name: "Security token test", organizerId: adminId } })
    const element = await prisma.scoringElement.create({ data: { competitionId: competition.id, name: "Token test", code: "T1" } })
    const team = await prisma.team.create({ data: { competitionId: competition.id, name: "Token team", code: "T1" } })
    const token = await prisma.accessToken.create({ data: { competitionId: competition.id, elementId: element.id, type: "JUDGE", name: "Security judge" } })
    const response = await page.request.post(`/api/elements/${element.id}/results`, { headers: { "x-access-token": token.token }, data: { teamId: team.id, values: {} } })
    expect(response.status(), await response.text()).toBe(200)
    const event = await prisma.securityEvent.findFirstOrThrow({ where: { actorTokenId: token.id } })
    expect(event.actorUserId).toBeNull()
    expect(event.outcome).toBe("SUCCEEDED")
    expect(event.targetIds).toMatchObject({ competitionId: competition.id, teamId: team.id, elementId: element.id })
    expect(JSON.stringify(event)).not.toContain(token.token)
  })
})
