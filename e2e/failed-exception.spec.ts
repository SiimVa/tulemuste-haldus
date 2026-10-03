import { test, expect } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const databaseUrl = process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/tulemuste_haldus?schema=e2e"
const parsed = new URL(databaseUrl)
if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname) || parsed.searchParams.get("schema") !== "e2e") throw new Error("Failed exception tests require a local e2e schema")
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
test.afterAll(() => db.$disconnect())

test("ebaõnnestunud võistkond on pingereas viimane ja teiste miinimum tõuseb", async ({ page }) => {
  const user = await db.user.create({ data: { email: `failed-${Date.now()}@example.com`, name: "Hindaja", passwordHash: await bcrypt.hash("failed-test-password", 10) } })
  const competition = await db.competition.create({ data: { name: "Ebaõnnestumise võistlus", createdById: user.id, organizerId: user.id, scoringMode: "PLUS", defaultKPMaxValue: 30, defaultHigherIsBetter: true } })
  const element = await db.scoringElement.create({ data: {
    competitionId: competition.id, code: "KP1", name: "Täpsusülesanne", maxValue: 30,
    fields: { create: { name: "punktid", label: "Punktid", type: "NUMBER", rankingPriority: 1, meta: JSON.stringify({ higherIsBetter: true }) } },
    calcMethod: { create: { type: "RELATIVE_RANKING", params: JSON.stringify({ higherIsBetter: true, minPoints: 0 }) } },
    exceptions: { create: [
      { label: "Ei läbinud", penalty: 40, order: 0, kind: "NOT_PASSED" },
      { label: "Läbis aga ei sooritanud", penalty: 35, order: 1, kind: "PASSED_NOT_DONE" },
      { label: "Kriteeriumid täitmata", penalty: 0, order: 2, kind: "FAILED" },
    ] },
  } })
  // Vanem KP ilma ebaõnnestumise erandita: „Rakenda kõigile” lisab selle.
  const older = await db.scoringElement.create({ data: {
    competitionId: competition.id, code: "KP2", name: "Vanem KP", order: 1,
    exceptions: { create: [{ label: "Ei läbinud", penalty: 40, order: 0 }] },
  } })
  // Enne liiki „Ebaõnnestus” loodud samanimeline erand: saab liigi, ei teki kordust.
  const named = await db.scoringElement.create({ data: {
    competitionId: competition.id, code: "KP3", name: "Samanimelise erandiga KP", order: 2,
    exceptions: { create: [{ label: "Ei läbinud", penalty: 40, order: 0, kind: "NOT_PASSED" }, { label: "Ebaõnnestus", penalty: 12, order: 1, kind: "OTHER" }] },
  } })
  const teams: Record<string, string> = {}
  for (const [index, name] of ["Alfa", "Beeta", "Gamma", "Delta"].entries()) {
    teams[name] = (await db.team.create({ data: { competitionId: competition.id, code: String(index + 1), name } })).id
  }
  for (const [name, points] of [["Alfa", 30], ["Beeta", 20], ["Gamma", 10]] as const) {
    await db.result.create({ data: { elementId: element.id, teamId: teams[name], values: JSON.stringify({ punktid: String(points) }) } })
  }
  await db.result.create({ data: { elementId: element.id, teamId: teams.Delta, values: "{}", exceptionLabel: "Kriteeriumid täitmata", exceptionPenalty: 0 } })

  await page.goto("/login")
  await page.getByPlaceholder("admin@example.com").fill(user.email)
  await page.locator('input[type="password"]').fill("failed-test-password")
  await page.getByRole("button", { name: "Logi sisse" }).click()
  await page.waitForURL("**/dashboard")

  const recalculated = await page.request.post(`/api/competitions/${competition.id}/recalculate`)
  expect(recalculated.status(), await recalculated.text()).toBe(200)
  const scores = await db.computedScore.findMany({ where: { elementId: element.id } })
  const byTeam = Object.fromEntries(scores.map((score) => [score.teamId, score.penaltyPoints]))
  // 4 kohta: Alfa 30, Beeta 20, Gamma 10 (mitte 0), ebaõnnestunud Delta 0.
  expect([byTeam[teams.Alfa], byTeam[teams.Beeta], byTeam[teams.Gamma], byTeam[teams.Delta]]).toEqual([30, 20, 10, 0])

  await page.goto(`/dashboard/competitions/${competition.id}/elements/${element.id}`)
  await page.getByText("Arvutuste ülevaade").click()
  await expect(page.getByText(/Ebaõnnestus "Kriteeriumid täitmata": pingerea viimane koht \(4\/4\) → 0p/)).toBeVisible()
  await expect(page.getByText(/Koht 3\/4 .*1 ebaõnnestunut viimastel kohtadel → 10p/)).toBeVisible()

  // Uuel kontrollpunktil on erand „Ebaõnnestus” vaikimisi olemas.
  await page.goto(`/dashboard/competitions/${competition.id}/elements/new`)
  const labels = page.getByPlaceholder("Erand (nt Ei läbinud)")
  await expect(labels).toHaveCount(3)
  await expect(labels.nth(2)).toHaveValue("Ebaõnnestus")
  await expect(page.getByRole("combobox", { name: "Erandi liik", exact: true }).nth(2)).toHaveValue("FAILED")

  await page.goto(`/dashboard/competitions/${competition.id}/settings`)
  page.once("dialog", (dialog) => dialog.accept())
  await page.getByRole("button", { name: "Rakenda kõigile" }).click()
  await expect(page.getByText(/lisatud 1 erandit „Ebaõnnestus”, 1 olemasolevale erandile määrati liik „Ebaõnnestus”/)).toBeVisible()
  const exceptionsOf = async (elementId: string) => (await db.elementException.findMany({ where: { elementId }, orderBy: { order: "asc" } }))
    .map((exception) => [exception.label, exception.kind, exception.penalty])
  expect(await exceptionsOf(older.id)).toEqual([["Ei läbinud", null, 40], ["Ebaõnnestus", "FAILED", 0]])
  expect(await exceptionsOf(named.id)).toEqual([["Ei läbinud", "NOT_PASSED", 40], ["Ebaõnnestus", "FAILED", 0]])
  // „Rakenda kõigile” arvutas punktid uuesti; ebaõnnestumise loogika kehtib edasi.
  const after = await db.computedScore.findFirstOrThrow({ where: { elementId: element.id, teamId: teams.Gamma } })
  expect(after.penaltyPoints).toBe(10)
})

test("ebaõnnestunud tulemusel jääb sisestatud tulemus alles koos märkega", async ({ page }, testInfo) => {
  const user = await db.user.create({ data: { email: `failed-values-${Date.now()}@example.com`, name: "Sisestaja", passwordHash: await bcrypt.hash("failed-values-password", 10) } })
  const competition = await db.competition.create({ data: { name: "Ebaõnnestunud tulemusega võistlus", createdById: user.id, organizerId: user.id, scoringMode: "PLUS", defaultKPMaxValue: 30, defaultHigherIsBetter: true } })
  const element = await db.scoringElement.create({ data: {
    competitionId: competition.id, code: "KP1", name: "Esemete paigutus", maxValue: 30,
    fields: { create: [
      { name: "esemed", label: "Õigesti paigutatud esemete arv", type: "NUMBER", rankingPriority: 1, order: 0, meta: JSON.stringify({ higherIsBetter: true }) },
      { name: "aeg", label: "Soorituse aeg", type: "TIME", order: 1 },
    ] },
    calcMethod: { create: { type: "RELATIVE_RANKING", params: JSON.stringify({ higherIsBetter: true, minPoints: 0 }) } },
    exceptions: { create: [
      { label: "Ei läbinud", penalty: 40, order: 0, kind: "NOT_PASSED" },
      { label: "Ebaõnnestus", penalty: 10, order: 1, kind: "FAILED" },
    ] },
  } })
  const teams: Record<string, string> = {}
  for (const [code, name] of [["REG-001", "Osula sega"], ["REG-002", "Osula NK"], ["REG-003", "Valga KT"]]) {
    teams[name] = (await db.team.create({ data: { competitionId: competition.id, code, name } })).id
  }
  await db.result.create({ data: { elementId: element.id, teamId: teams["Osula NK"], values: JSON.stringify({ esemed: "3", aeg: "2:00" }) } })
  const judge = await db.accessToken.create({ data: { competitionId: competition.id, elementId: element.id, type: "JUDGE", name: "KP1 kohtunik" } })
  const stored = async (teamName: string) => {
    const result = await db.result.findUniqueOrThrow({ where: { elementId_teamId: { elementId: element.id, teamId: teams[teamName] } } })
    return [JSON.parse(result.values), result.exceptionLabel]
  }

  await page.goto("/login")
  await page.getByPlaceholder("admin@example.com").fill(user.email)
  await page.locator('input[type="password"]').fill("failed-values-password")
  await page.getByRole("button", { name: "Logi sisse" }).click()
  await page.waitForURL("**/dashboard")

  // Korraldaja tabel: väljad jäävad „Ebaõnnestus” valimisel alles.
  await page.goto(`/dashboard/competitions/${competition.id}/elements/${element.id}`)
  await expect(page.getByText("Ebaõnnestunud võistkond jääb pingerea viimasele kohale; sisestatud tulemus jääb alles.")).toBeVisible()
  const row = page.getByRole("row").filter({ hasText: "Osula sega" })
  await row.getByRole("button", { name: "Sisesta" }).click()
  await expect(row.locator("select option", { hasText: "Ebaõnnestus" })).toHaveText("Ebaõnnestus (viimane koht)")
  await row.locator("select").selectOption("Ebaõnnestus")
  await row.locator('input[type="number"]').fill("1")
  await row.getByPlaceholder("m:ss").fill("123")
  await page.screenshot({ path: testInfo.outputPath("failed-result-editing.png") })
  await row.getByRole("button", { name: "Salvesta" }).click()
  await expect(row.getByRole("button", { name: "Muuda" })).toBeVisible()
  // Veerud: koht, võistkond, esemed, aeg, erand, punktid.
  const cells = row.getByRole("cell")
  await expect(cells.nth(2)).toHaveText("1")
  await expect(cells.nth(3)).toHaveText("1:23")
  await expect(cells.nth(4)).toHaveText("Ebaõnnestus")
  await page.screenshot({ path: testInfo.outputPath("failed-result-saved.png") })
  expect(await stored("Osula sega")).toEqual([{ esemed: "1", aeg: "1:23" }, "Ebaõnnestus"])
  const scores = Object.fromEntries((await db.computedScore.findMany({ where: { elementId: element.id } })).map((score) => [score.teamId, score.penaltyPoints]))
  expect([scores[teams["Osula NK"]], scores[teams["Osula sega"]]]).toEqual([30, 0])

  // Eksport näitab tulemust koos märkega.
  const csv = await (await page.request.get(`/api/competitions/${competition.id}/elements/${element.id}/export?format=csv`)).text()
  expect(csv.split("\n").find((line) => line.includes("Osula sega"))).toContain('"1","83","Ebaõnnestus","0"')

  // Kohtuniku vaade: sama loogika ja vihje.
  await page.goto(`/judge/${judge.token}`)
  await page.getByRole("button", { name: /Valga KT/ }).click()
  const form = page.locator("form")
  await expect(form.locator("select option", { hasText: "Ebaõnnestus" })).toHaveText("Ebaõnnestus (viimane koht)")
  await form.locator("select").selectOption("Ebaõnnestus")
  await expect(form.getByText("Sisesta tulemus nagu tavaliselt. See salvestatakse koos märkega „Ebaõnnestus”.")).toBeVisible()
  await form.locator('input[type="number"]').fill("2")
  await form.getByPlaceholder("m:ss").fill("245")
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await form.screenshot({ path: testInfo.outputPath("failed-result-judge.png") })
  await page.setViewportSize({ width: 1280, height: 800 })
  await form.getByRole("button", { name: "✓ Salvesta tulemus" }).click()
  await expect(page.getByText(/Viimati salvestatud: Valga KT/)).toBeVisible()
  await expect(page.getByRole("button", { name: /Valga KT/ })).toContainText("Ebaõnnestus")
  expect(await stored("Valga KT")).toEqual([{ esemed: "2", aeg: "2:45" }, "Ebaõnnestus"])

  // Teise erandi valimisel väärtusi ei hoita.
  await page.goto(`/dashboard/competitions/${competition.id}/elements/${element.id}`)
  await row.getByRole("button", { name: "Muuda" }).click()
  await row.locator("select").selectOption("Ei läbinud")
  await expect(row.locator('input[type="number"]')).toHaveCount(0)
  await row.getByRole("button", { name: "Salvesta" }).click()
  await expect(row.getByRole("button", { name: "Muuda" })).toBeVisible()
  expect(await stored("Osula sega")).toEqual([{}, "Ei läbinud"])
})
