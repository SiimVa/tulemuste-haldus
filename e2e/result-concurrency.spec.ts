import { test, expect, type APIRequestContext } from "@playwright/test"
import { PrismaClient, type Team } from "@prisma/client"
import { randomUUID } from "node:crypto"
import bcrypt from "bcryptjs"

const databaseUrl = process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/tulemuste_haldus?schema=e2e"
const parsed = new URL(databaseUrl)
if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname) || parsed.searchParams.get("schema") !== "e2e") {
  throw new Error("Concurrent result tests require a local PostgreSQL e2e schema")
}
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
const fixtures: { competitionId: string; userId: string }[] = []
test.afterEach(async () => {
  for (const fixture of fixtures.splice(0)) {
    await db.competition.deleteMany({ where: { id: fixture.competitionId } })
    await db.user.deleteMany({ where: { id: fixture.userId } })
  }
})
test.afterAll(() => db.$disconnect())

async function fixture(teamCount = 2) {
  const user = await db.user.create({ data: {
    email: `concurrent-${randomUUID()}@example.com`, name: "Kohtunik",
    passwordHash: await bcrypt.hash("concurrent-test-password", 10),
  } })
  const competition = await db.competition.create({ data: {
    name: "Samaaegsete tulemuste test", createdById: user.id, organizerId: user.id,
    scoringMode: "PLUS", status: "ACTIVE",
  } })
  fixtures.push({ competitionId: competition.id, userId: user.id })
  const element = await db.scoringElement.create({ data: {
    competitionId: competition.id, code: "KP1", name: "Tabamused", maxValue: 90,
    fields: { create: { name: "hits", label: "Tabamused", type: "NUMBER", isResultField: true, rankingPriority: 1, meta: JSON.stringify({ higherIsBetter: true }) } },
    calcMethod: { create: { type: "RELATIVE_RANKING", params: JSON.stringify({ higherIsBetter: true, minPoints: 0 }) } },
  } })
  const teams: Team[] = []
  for (let index = 0; index < teamCount; index++) {
    teams.push(await db.team.create({ data: { competitionId: competition.id, code: String(index + 1), name: `Võistkond ${index + 1}` } }))
  }
  const token = await db.accessToken.create({ data: { competitionId: competition.id, elementId: element.id, type: "JUDGE", name: "Testkohtunik" } })
  const save = (request: APIRequestContext, index: number, values: Record<string, string>, version?: string | null) => request.post(`/api/elements/${element.id}/results`, {
    headers: { "x-access-token": token.token },
    data: { teamId: teams[index].id, values, exceptionLabel: null, ...(version !== undefined ? { expectedUpdatedAt: version } : {}) },
  })
  return { user, competition, element, teams, token, save }
}

test("ten simultaneous saves and recalculation retain every result and the latest complete ranking", async ({ page }) => {
  const f = await fixture(10)
  await page.goto("/login")
  await page.getByPlaceholder("admin@example.com").fill(f.user.email)
  await page.locator('input[type="password"]').fill("concurrent-test-password")
  await page.getByRole("button", { name: "Logi sisse" }).click()
  await page.waitForURL("**/dashboard")

  const responses = await Promise.all([
    ...f.teams.map((_, index) => f.save(page.request, index, { hits: String(index + 1) })),
    page.request.post(`/api/competitions/${f.competition.id}/recalculate`),
  ])
  expect(responses.map((response) => response.status())).toEqual(Array(11).fill(200))
  const results = await db.result.findMany({ where: { elementId: f.element.id } })
  const scores = await db.computedScore.findMany({ where: { elementId: f.element.id } })
  expect(results).toHaveLength(10)
  expect(scores).toHaveLength(10)
  for (let index = 0; index < f.teams.length; index++) {
    expect(JSON.parse(results.find((result) => result.teamId === f.teams[index].id)!.values)).toEqual({ hits: String(index + 1) })
    // Independently: ten distinct positions spread PLUS points 90..0.
    expect(scores.find((score) => score.teamId === f.teams[index].id)!.penaltyPoints).toBe(index * 10)
  }
})

test("lost-response retries preserve timestamps and stale edits or deletions cannot overwrite newer results", async ({ page }) => {
  const f = await fixture()
  const first = await f.save(page.request, 0, { hits: "4" }, null)
  expect(first.status()).toBe(200)
  const saved = await first.json()
  const before = await db.result.findUniqueOrThrow({ where: { elementId_teamId: { elementId: f.element.id, teamId: f.teams[0].id } } })
  const repeated = await Promise.all([
    f.save(page.request, 0, { hits: "4" }, null),
    f.save(page.request, 0, { hits: "4" }, null),
  ])
  expect(repeated.map((response) => response.status())).toEqual([200, 200])
  expect(await db.result.findUniqueOrThrow({ where: { id: before.id } })).toEqual(before)

  // Both clients edited the same original version. Exactly one may commit.
  const competing = await Promise.all([
    f.save(page.request, 0, { hits: "7" }, saved.updatedAt),
    f.save(page.request, 0, { hits: "8" }, saved.updatedAt),
  ])
  expect(competing.map((response) => response.status()).sort()).toEqual([200, 409])
  const newer = await db.result.findUniqueOrThrow({ where: { id: before.id } })
  expect((await f.save(page.request, 0, { hits: "4" }, null)).status()).toBe(409)
  expect((await f.save(page.request, 0, {}, saved.updatedAt)).status()).toBe(409)
  expect(await db.result.findUniqueOrThrow({ where: { id: before.id } })).toEqual(newer)

  expect((await f.save(page.request, 0, {}, newer.updatedAt.toISOString())).status()).toBe(200)
  expect((await f.save(page.request, 0, {}, newer.updatedAt.toISOString())).status()).toBe(200)
  expect(await db.result.count({ where: { elementId: f.element.id, teamId: f.teams[0].id } })).toBe(0)
  expect(await db.computedScore.count({ where: { elementId: f.element.id, teamId: f.teams[0].id } })).toBe(0)
  expect((await f.save(page.request, 0, { hits: "9" }, null)).status()).toBe(200)
  expect((await f.save(page.request, 0, {}, newer.updatedAt.toISOString())).status()).toBe(409)
  expect(JSON.parse((await db.result.findUniqueOrThrow({ where: { elementId_teamId: { elementId: f.element.id, teamId: f.teams[0].id } } })).values)).toEqual({ hits: "9" })
})

test("a failed score replacement rolls back the input and every previously computed score", async ({ page }) => {
  const f = await fixture()
  expect((await f.save(page.request, 0, { hits: "1" })).status()).toBe(200)
  expect((await f.save(page.request, 1, { hits: "2" })).status()).toBe(200)
  const resultBefore = await db.result.findMany({ where: { elementId: f.element.id }, orderBy: { id: "asc" } })
  const scoresBefore = await db.computedScore.findMany({ where: { elementId: f.element.id }, orderBy: { id: "asc" } })
  const triggerName = `e2e_score_failure_${randomUUID().replaceAll("-", "")}`
  const elementArgument = f.element.id.replaceAll("'", "''")
  // The local-schema guard above and the fixture-specific trigger argument
  // ensure this fault injection cannot affect another element or production.
  await db.$executeRawUnsafe(`CREATE FUNCTION "e2e"."${triggerName}"() RETURNS trigger LANGUAGE plpgsql AS $fn$
    BEGIN
      IF NEW."elementId" = TG_ARGV[0] THEN RAISE EXCEPTION 'Intentional e2e score replacement failure'; END IF;
      RETURN NEW;
    END
    $fn$`)
  try {
    await db.$executeRawUnsafe(`CREATE TRIGGER "${triggerName}" BEFORE INSERT ON "e2e"."ComputedScore" FOR EACH ROW EXECUTE FUNCTION "e2e"."${triggerName}"('${elementArgument}')`)
    expect((await f.save(page.request, 0, { hits: "99" })).status()).toBe(500)
    expect(await db.result.findMany({ where: { elementId: f.element.id }, orderBy: { id: "asc" } })).toEqual(resultBefore)
    expect(await db.computedScore.findMany({ where: { elementId: f.element.id }, orderBy: { id: "asc" } })).toEqual(scoresBefore)
  } finally {
    await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${triggerName}" ON "e2e"."ComputedScore"`)
    await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "e2e"."${triggerName}"()`)
  }
})

test("a judge can repeat a save after its committed response is lost", async ({ page }) => {
  const f = await fixture()
  let loseFirstResponse = true
  await page.route(`**/api/elements/${f.element.id}/results`, async (route) => {
    const response = await route.fetch()
    expect(response.status()).toBe(200)
    if (loseFirstResponse) {
      loseFirstResponse = false
      await route.abort("failed")
    } else {
      await route.fulfill({ response })
    }
  })
  await page.goto(`/judge/${f.token.token}`)
  await page.getByRole("button", { name: /Võistkond 1/ }).click()
  await page.locator('input[type="number"]').fill("3")
  await page.getByRole("button", { name: "✓ Salvesta tulemus" }).click()
  await expect(page.getByText("Salvestuse kinnitust ei saadud. Kontrolli ühendust ja proovi uuesti.")).toBeVisible()
  const first = await db.result.findUniqueOrThrow({ where: { elementId_teamId: { elementId: f.element.id, teamId: f.teams[0].id } } })
  await expect(page.locator('input[type="number"]')).toHaveValue("3")
  await page.getByRole("button", { name: "✓ Salvesta tulemus" }).click()
  await expect(page.getByText(/Viimati salvestatud: Võistkond 1/)).toBeVisible()
  expect(await db.result.findUniqueOrThrow({ where: { id: first.id } })).toEqual(first)
})
