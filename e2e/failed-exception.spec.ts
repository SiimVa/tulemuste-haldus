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
