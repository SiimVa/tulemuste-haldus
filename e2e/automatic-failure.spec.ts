import { test, expect, type Page } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"
import { readFileSync } from "node:fs"
import { randomUUID } from "node:crypto"

const url = process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/tulemuste_haldus?schema=e2e"
const parsed = new URL(url)
if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname) || parsed.searchParams.get("schema") !== "e2e") throw new Error("Requires isolated local e2e schema")
const db = new PrismaClient({ datasources: { db: { url } } })
const fixtures: { competitionId: string; userId: string }[] = []
test.afterEach(async () => {
  for (const f of fixtures.splice(0)) {
    await db.competition.delete({ where: { id: f.competitionId } })
    await db.user.delete({ where: { id: f.userId } })
  }
})
test.afterAll(() => db.$disconnect())

const rule = (limit: number) => ({ failureRule: { match: "ALL", conditions: [{ field: "cards", operator: "<", value: limit }] } })
async function fixture(withRule = true) {
  const password = "automatic-failure-test"
  const user = await db.user.create({ data: { email: `auto-failure-${randomUUID()}@example.com`, name: "Korraldaja", passwordHash: await bcrypt.hash(password, 10) } })
  const competition = await db.competition.create({ data: { name: "Automaatne ebaõnnestumine", createdById: user.id, organizerId: user.id, scoringMode: "PLUS", status: "ACTIVE" } })
  fixtures.push({ competitionId: competition.id, userId: user.id })
  const element = await db.scoringElement.create({ data: {
    competitionId: competition.id, name: "Meditsiin", code: "KP12", maxValue: 30, config: JSON.stringify(withRule ? rule(3) : { retained: "preserve" }),
    fields: { create: [
      { name: "cards", label: "Õigeid triaažikaarte", type: "NUMBER", isResultField: true, rankingPriority: 1, order: 0, meta: JSON.stringify({ higherIsBetter: true }) },
      { name: "evac", label: "Evakuatsiooniotsuseid", type: "NUMBER", order: 1 },
    ] },
    exceptions: { create: [{ label: "Kriteerium täitmata", kind: "FAILED", penalty: 10 }, { label: "Ei läbinud", kind: "NOT_PASSED", penalty: 40 }] },
    calcMethod: { create: { type: "RELATIVE_RANKING", params: JSON.stringify({ higherIsBetter: true, minPoints: 0 }) } },
  } })
  const teams = await Promise.all(Array.from({ length: 4 }, (_, i) => db.team.create({ data: { competitionId: competition.id, code: String(i + 1), name: `Võistkond ${i + 1}` } })))
  const token = await db.accessToken.create({ data: { competitionId: competition.id, elementId: element.id, type: "JUDGE", name: "Kohtunik" } })
  const endpoint = `/api/elements/${element.id}/results`
  return { user, password, competition, element, teams, token, endpoint }
}
async function login(page: Page, f: Awaited<ReturnType<typeof fixture>>) {
  await page.goto("/login")
  await page.getByPlaceholder("admin@example.com").fill(f.user.email)
  await page.locator('input[type="password"]').fill(f.password)
  await page.getByRole("button", { name: "Logi sisse" }).click()
  await page.waitForURL("**/dashboard")
}

test("server decides failure, preserves scores and values, and protects override retries and concurrent edits", async ({ page }) => {
  const f = await fixture()
  const save = (index: number, data: Record<string, unknown>) => page.request.post(f.endpoint, { headers: { "x-access-token": f.token.token }, data: { teamId: f.teams[index].id, ...data } })
  const missing = await save(0, { values: { evac: "10" }, failureMode: "AUTO" })
  expect(missing.status()).toBe(422)
  expect((await missing.json()).error).toContain("Automaatseks kontrolliks puudub")
  const first = await save(0, { values: { cards: "2", evac: "10" }, failureMode: "AUTO", expectedUpdatedAt: null })
  expect(first.status()).toBe(200)
  const failed = await first.json()
  expect(failed).toMatchObject({ failureMode: "AUTO", exceptionLabel: "Kriteerium täitmata" })
  expect(JSON.parse(failed.values)).toEqual({ cards: "2", evac: "10" })
  expect(failed.failureReason).toContain("Õigeid triaažikaarte: 2")
  expect((await save(1, { values: { cards: "3" }, failureMode: "AUTO" })).status()).toBe(200)
  const scores = await db.computedScore.findMany({ where: { elementId: f.element.id } })
  expect(scores.find(s => s.teamId === f.teams[0].id)?.penaltyPoints).toBe(0)
  expect(scores.find(s => s.teamId === f.teams[1].id)?.penaltyPoints).toBe(30)

  const override = await save(0, { values: { cards: "2" }, failureMode: "FORCE_SUCCESS", expectedUpdatedAt: failed.updatedAt })
  expect(override.status()).toBe(200)
  const saved = await override.json()
  expect(saved.exceptionLabel).toBeNull()
  const retry = await save(0, { values: { cards: "2" }, failureMode: "FORCE_SUCCESS", expectedUpdatedAt: failed.updatedAt })
  expect(retry.status()).toBe(200)
  expect((await retry.json()).updatedAt).toBe(saved.updatedAt)
  const competing = await Promise.all([
    save(0, { values: { cards: "10" }, failureMode: "FORCE_FAILED", expectedUpdatedAt: saved.updatedAt }),
    save(0, { values: { cards: "0" }, failureMode: "AUTO", expectedUpdatedAt: saved.updatedAt }),
  ])
  expect(competing.map(r => r.status()).sort()).toEqual([200, 409])
  expect((await save(2, { values: { cards: "10" }, failureMode: "FORCE_FAILED" })).status()).toBe(200)
  const stillForced = await save(2, { values: { cards: "11" } })
  expect((await stillForced.json()).failureMode).toBe("FORCE_FAILED")
  expect((await save(2, { values: { cards: "11" }, failureMode: "AUTO" })).status()).toBe(200)
  expect((await db.result.findFirstOrThrow({ where: { elementId: f.element.id, teamId: f.teams[2].id } })).exceptionLabel).toBeNull()
  const other = await save(3, { values: { cards: "0" }, failureMode: "AUTO", exceptionLabel: "Ei läbinud" })
  expect((await other.json()).values).toBe("{}")
  expect((await save(0, { values: {}, failureMode: "AUTO" })).status()).toBe(200)
  expect(await db.result.count({ where: { elementId: f.element.id, teamId: f.teams[0].id } })).toBe(0)
})

test("organizer config and both judge and table forms show automatic decisions and retain manual overrides", async ({ page }, testInfo) => {
  const f = await fixture(false)
  await login(page, f)
  await page.goto(`/dashboard/competitions/${f.competition.id}/elements/${f.element.id}/edit`)
  await page.getByLabel("Kasuta automaatset tingimust").check()
  await page.getByLabel("Tingimuse 1 võrdlus").selectOption("<")
  await page.getByLabel("Tingimuse 1 piirväärtus").fill("3")
  await page.getByRole("heading", { name: "Automaatne ebaõnnestumine", exact: true }).locator("..").screenshot({ path: testInfo.outputPath("failure-rule-editor.png") })
  await page.getByRole("button", { name: /Salvesta/ }).last().click()
  await page.waitForURL(`**/elements/${f.element.id}`)
  const config = JSON.parse((await db.scoringElement.findUniqueOrThrow({ where: { id: f.element.id } })).config)
  expect(config).toEqual({ retained: "preserve", ...rule(3) })
  await page.goto(`/judge/${f.token.token}`)
  await page.getByRole("button", { name: /Võistkond 1/ }).click()
  await page.locator('form input[type="number"]').first().fill("2")
  await expect(page.locator("form").getByRole("status")).toContainText("Ebaõnnestus: Õigeid triaažikaarte: 2")
  await page.locator("form").screenshot({ path: testInfo.outputPath("judge-automatic-failure.png") })
  await page.getByRole("button", { name: "✓ Salvesta tulemus" }).click()
  await expect(page.getByRole("button", { name: /Võistkond 1/ })).toContainText("Kriteerium täitmata")
  await page.getByRole("button", { name: /Võistkond 1/ }).click()
  await expect(page.getByLabel("Ebaõnnestumise otsus")).toHaveValue("AUTO")
  await page.getByLabel("Ebaõnnestumise otsus").selectOption("FORCE_SUCCESS")
  await page.getByRole("button", { name: "✓ Salvesta tulemus" }).click()
  await expect(page.getByRole("button", { name: /Võistkond 1/ })).toContainText("Sisestatud")
  await page.goto(`/dashboard/competitions/${f.competition.id}/elements/${f.element.id}`)
  const row = page.locator("table").filter({ has: page.getByRole("columnheader", { name: "Erand", exact: true }) }).locator("tbody tr").filter({ hasText: "Võistkond 1" })
  await row.getByRole("button", { name: "Muuda" }).click()
  await expect(row.getByLabel("Ebaõnnestumise otsus")).toHaveValue("FORCE_SUCCESS")
  await row.locator('input[type="number"]').first().fill("1")
  await row.getByRole("button", { name: "Salvesta", exact: true }).click()
  await expect(row.getByRole("button", { name: "Muuda" })).toBeVisible()
  expect((await db.result.findFirstOrThrow({ where: { elementId: f.element.id } })).failureMode).toBe("FORCE_SUCCESS")
  await row.getByRole("button", { name: "Muuda" }).click()
  await row.getByLabel("Ebaõnnestumise otsus").selectOption("AUTO")
  await row.getByRole("button", { name: "Salvesta", exact: true }).click()
  await expect(row).toContainText("Kriteerium täitmata")
  await page.goto(`/dashboard/judge/${f.competition.id}`)
  await page.getByRole("button", { name: /Võistkond 1/ }).click()
  await expect(page.getByLabel("Ebaõnnestumise otsus")).toHaveValue("AUTO")
})

test("rule changes re-evaluate AUTO results atomically and guard deleted fields including sections", async ({ page }) => {
  const f = await fixture()
  await login(page, f)
  for (const [index, mode] of ["AUTO", "FORCE_SUCCESS", "FORCE_FAILED"].entries()) {
    expect((await page.request.post(f.endpoint, { data: { teamId: f.teams[index].id, values: { cards: "2" }, failureMode: mode } })).status()).toBe(200)
  }
  expect((await page.request.patch(`/api/elements/${f.element.id}`, { data: { config: rule(2), maxValue: 30 } })).status()).toBe(200)
  const results = await db.result.findMany({ where: { elementId: f.element.id } })
  expect(results.find(r => r.teamId === f.teams[0].id)?.exceptionLabel).toBeNull()
  expect(results.find(r => r.teamId === f.teams[1].id)?.exceptionLabel).toBeNull()
  expect(results.find(r => r.teamId === f.teams[2].id)?.exceptionLabel).toBe("Kriteerium täitmata")
  expect((await page.request.patch(`/api/elements/${f.element.id}`, { data: { fields: [] } })).status()).toBe(422)
  expect(await db.fieldDefinition.count({ where: { elementId: f.element.id } })).toBe(2)
  const section = await db.elementSection.create({ data: { elementId: f.element.id, name: "Lisaosa", fields: { create: { elementId: f.element.id, name: "extra", label: "Lisa", type: "NUMBER" } } } })
  expect((await page.request.patch(`/api/elements/${f.element.id}`, { data: { config: { failureRule: { match: "ALL", conditions: [{ field: "extra", operator: "=", value: 0 }] } } } })).status()).toBe(422)
  // A missing input in an existing AUTO result rolls back the new condition.
  expect(JSON.parse((await db.scoringElement.findUniqueOrThrow({ where: { id: f.element.id } })).config)).toEqual(rule(2))
  for (const result of results.filter(r => r.failureMode === "AUTO")) await db.result.update({ where: { id: result.id }, data: { values: JSON.stringify({ cards: "2", extra: "0" }) } })
  expect((await page.request.patch(`/api/elements/${f.element.id}`, { data: { config: { failureRule: { match: "ALL", conditions: [{ field: "extra", operator: "=", value: 0 }] } } } })).status()).toBe(200)
  expect((await page.request.delete(`/api/elements/${f.element.id}/sections/${section.id}`)).status()).toBe(422)
  expect((await page.request.patch(`/api/elements/${f.element.id}/sections/${section.id}`, { data: { fields: [] } })).status()).toBe(422)
  expect(await db.elementSection.count({ where: { id: section.id } })).toBe(1)
  expect((await page.request.patch(`/api/elements/${f.element.id}`, { data: { config: { failureRule: null } } })).status()).toBe(200)
  expect((await page.request.delete(`/api/elements/${f.element.id}/sections/${section.id}`)).status()).toBe(200)
})

test("import preview and actual save agree; manual decisions persist and bulk values detect failure", async ({ page }) => {
  const f = await fixture()
  await login(page, f)
  await page.request.post(f.endpoint, { data: { teamId: f.teams[0].id, values: { cards: "1" }, failureMode: "FORCE_SUCCESS" } })
  const csv = "Tähis,Õigeid triaažikaarte,Evakuatsiooniotsuseid,Ebaõnnestumise otsus\n1,2,,\n2,2,,Automaatne\n3,,10,Automaatne\n"
  const importPath = `/api/competitions/${f.competition.id}/elements/${f.element.id}/results/import`
  const upload = (dryRun: boolean) => page.request.post(importPath, { multipart: { file: { name: "results.csv", mimeType: "text/csv", buffer: Buffer.from(csv) }, dryRun: String(dryRun) } })
  const preview = await (await upload(true)).json()
  expect(preview.summary).toMatchObject({ imported: 2, errors: 1 })
  expect(preview.rows[0]).toMatchObject({ failureMode: "FORCE_SUCCESS" })
  expect(preview.rows[0].exceptionLabel).toBeUndefined()
  expect(preview.rows[1]).toMatchObject({ failureMode: "AUTO", exceptionLabel: "Kriteerium täitmata" })
  expect(preview.rows[2].message).toContain("Automaatseks kontrolliks puudub")
  const actual = await (await upload(false)).json()
  expect(actual.rows).toEqual(preview.rows)
  expect((await db.result.findFirstOrThrow({ where: { elementId: f.element.id, teamId: f.teams[0].id } })).failureMode).toBe("FORCE_SUCCESS")
  expect((await db.result.findFirstOrThrow({ where: { elementId: f.element.id, teamId: f.teams[1].id } })).exceptionLabel).toBe("Kriteerium täitmata")
  await page.goto(`/dashboard/competitions/${f.competition.id}/elements/${f.element.id}`)
  const bulk = page.locator("div").filter({ has: page.getByText("Lisa kõigile sisestamata (2):", { exact: true }) }).last()
  await bulk.locator('input[type="number"]').first().fill("0")
  await page.getByRole("button", { name: "Lisa 2 võistkonnale", exact: true }).click()
  await expect(page.getByText("4 / 4 sisestatud")).toBeVisible()
  const results = await db.result.findMany({ where: { elementId: f.element.id } })
  expect(results.filter(r => r.exceptionLabel === "Kriteerium täitmata")).toHaveLength(3)
})

test("migration preserves named and legacy failures without reclassifying an explicitly different exception", async () => {
  const sql = readFileSync("prisma/migrations/20261014190000_automatic_failure/migration.sql", "utf8")
  await db.$transaction(async tx => {
    // Temporary tables shadow the real tables only inside this connection.
    await tx.$executeRawUnsafe('CREATE TEMP TABLE "Result" ("id" TEXT, "elementId" TEXT, "exceptionLabel" TEXT) ON COMMIT DROP')
    await tx.$executeRawUnsafe('CREATE TEMP TABLE "ElementException" ("elementId" TEXT, "label" TEXT, "kind" TEXT) ON COMMIT DROP')
    await tx.$executeRawUnsafe(`INSERT INTO "ElementException" VALUES ('kp', 'Kriteerium täitmata', 'FAILED'), ('kp', 'Ebaõnnestus muu', 'OTHER')`)
    await tx.$executeRawUnsafe(`INSERT INTO "Result" VALUES ('custom', 'kp', 'Kriteerium täitmata'), ('legacy', 'kp', ' Ebaõnnestunud sooritus '), ('other', 'kp', 'Ebaõnnestus muu'), ('normal', 'kp', NULL)`)
    for (const statement of sql.split(";").filter(s => s.trim())) await tx.$executeRawUnsafe(statement)
    const rows = await tx.$queryRawUnsafe<{ id: string; failureMode: string }[]>('SELECT "id", "failureMode" FROM "Result" ORDER BY "id"')
    expect(rows).toEqual([{ id: "custom", failureMode: "FORCE_FAILED" }, { id: "legacy", failureMode: "FORCE_FAILED" }, { id: "normal", failureMode: "AUTO" }, { id: "other", failureMode: "AUTO" }])
  })
})
