import { test, expect, type Page } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"
import * as XLSX from "xlsx"

const databaseUrl = process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/tulemuste_haldus?schema=e2e"
const parsed = new URL(databaseUrl)
if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname) || parsed.searchParams.get("schema") !== "e2e") throw new Error("Series tests require a local e2e schema")
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
test.afterAll(() => db.$disconnect())

async function login(page: Page, email: string, password: string) {
  await page.goto("/login")
  await page.getByPlaceholder("admin@example.com").fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole("button", { name: "Logi sisse" }).click()
  await page.waitForURL("**/dashboard")
}

const exceptions = [
  { label: "Ei läbinud", penalty: 10, order: 0, kind: "NOT_PASSED" },
  { label: "Ebaõnnestus", penalty: 0, order: 1, kind: "FAILED" },
]

// [KP tähis, punktid, erand]
type Entry = [string, number, string | null]

async function seedCompetition(name: string, ownerId: string, status: string, maxByCode: Record<string, number> = {}) {
  const competition = await db.competition.create({ data: { name, createdById: ownerId, organizerId: ownerId, scoringMode: "PLUS", status } })
  const elements: Record<string, string> = {}
  for (const [order, code] of ["KP1", "KP2", "KP3", "KP4"].entries()) {
    elements[code] = (await db.scoringElement.create({ data: {
      competitionId: competition.id, code, name: `Ülesanne ${code}`, order, maxValue: maxByCode[code] ?? null,
      exceptions: { create: exceptions },
      calcMethod: { create: { type: "RELATIVE_RANKING", params: JSON.stringify({ higherIsBetter: true, minPoints: 0 }) } },
    } })).id
  }
  elements.HL = (await db.scoringElement.create({ data: { competitionId: competition.id, code: "HL", name: "Hilinemine", type: "LATENESS", order: 10, config: JSON.stringify({ mode: "ONE_TIME" }) } })).id
  const addTeam = async (code: string, teamName: string, cls: string, list: Entry[], extra: Entry[] = []) => {
    const team = await db.team.create({ data: { competitionId: competition.id, code, name: teamName, class: cls } })
    for (const [elementCode, points, exceptionLabel] of [...list, ...extra]) {
      if (elementCode !== "HL") await db.result.create({ data: { elementId: elements[elementCode], teamId: team.id, values: "{}", exceptionLabel, exceptionPenalty: exceptionLabel ? 0 : null } })
      await db.computedScore.create({ data: { elementId: elements[elementCode], teamId: team.id, penaltyPoints: points } })
    }
    return team
  }
  return { competition, addTeam }
}

test("administraator loob üleriikliku arvestuse ja näeb keskmisi, reeglite kontrolli ning pingerida", async ({ page, browser }, testInfo) => {
  const stamp = Date.now()
  const admin = await db.user.create({ data: { email: `series-admin-${stamp}@example.com`, name: "Arvestaja", role: "ADMIN", passwordHash: await bcrypt.hash("series-admin-password", 10) } })
  const organizer = await db.user.create({ data: { email: `series-user-${stamp}@example.com`, name: "Korraldaja", passwordHash: await bcrypt.hash("series-user-password", 10) } })

  // Lõuna: mõlemad läbisid 3 KP-d → keskmine 3.
  const south = await seedCompetition(`Lõuna OV ${stamp}`, organizer.id, "FINISHED")
  const a1 = await south.addTeam("A1", "Alfa", "KT", [["KP1", 30, null], ["KP2", 20, null], ["KP3", 0, "Ebaõnnestus"], ["KP4", -10, "Ei läbinud"]], [["HL", -5, null]])
  await db.manualPenalty.create({ data: { competitionId: south.competition.id, teamId: a1.id, description: "Prügi", points: 2, enteredById: admin.id } })
  await south.addTeam("A2", "Beeta", "NK", [["KP1", 25, null], ["KP2", 15, null], ["KP3", -10, "Ei läbinud"], ["KP4", 28, null]])
  // Kirde: 4 ja 3 läbitud → keskmine 3,5 → 4. KP2 maksimum erineb.
  const north = await seedCompetition(`Kirde OV ${stamp}`, organizer.id, "ACTIVE", { KP2: 25 })
  await north.addTeam("B1", "Gamma", "KT", [["KP1", 10, null], ["KP2", 20, null], ["KP3", 30, null], ["KP4", 5, null]])
  await north.addTeam("B2", "Delta", "KT", [["KP1", 30, null], ["KP2", 30, null], ["KP3", 0, null], ["KP4", -10, "Ei läbinud"]])

  // Tavakasutaja arvestust ei näe ega loo.
  const userContext = await browser.newContext()
  const userPage = await userContext.newPage()
  await login(userPage, organizer.email, "series-user-password")
  await userPage.goto("/dashboard/series")
  await userPage.waitForURL("**/dashboard")
  expect((await userPage.request.post("/api/series", { data: { name: "Keelatud", competitionIds: [south.competition.id] } })).status()).toBe(403)
  await userContext.close()

  await login(page, admin.email, "series-admin-password")
  await page.getByRole("navigation", { name: "Administraatori tööriistad" }).getByRole("link", { name: "Üleriiklik arvestus" }).click()
  await page.waitForURL("**/dashboard/series")
  expect((await page.request.post("/api/series", { data: { name: "Tühi", competitionIds: [] } })).status()).toBe(400)
  await page.getByLabel("Arvestuse nimi").fill(`Jäljed metsas ${stamp}`)
  await page.getByRole("searchbox", { name: "Otsi võistlust" }).fill(String(stamp))
  await page.getByRole("checkbox", { name: new RegExp(`Lõuna OV ${stamp}`) }).check()
  await page.getByRole("checkbox", { name: new RegExp(`Kirde OV ${stamp}`) }).check()
  await page.getByRole("button", { name: "Loo arvestus" }).click()
  await page.waitForURL(/\/dashboard\/series\/c[a-z0-9]+$/)
  const seriesId = page.url().split("/").pop()!

  await expect(page.getByRole("heading", { name: `Jäljed metsas ${stamp}` })).toBeVisible()
  await expect(page.getByRole("status")).toContainText(`Kirde OV ${stamp} (toimub) pole veel lõppenud`)
  // Osavõistluste tabelis on nimi lingiks; pingerea ridades on see tavatekst.
  const competitionRow = (name: string) => page.getByRole("row").filter({ has: page.getByRole("link", { name }) })
  await expect(competitionRow(`Lõuna OV ${stamp}`).getByRole("cell")).toHaveText([`Lõuna OV ${stamp}`, "Lõppenud", "4", "2", "6", "3", "3"])
  await expect(competitionRow(`Kirde OV ${stamp}`).getByRole("cell")).toHaveText([`Kirde OV ${stamp}`, "Toimub", "4", "2", "7", "3,5", "4"])
  await expect(page.getByTestId("counted-kp")).toContainText(`Arvestatav KP-de arv: 3 (väikseim ümardatud keskmine: Lõuna OV ${stamp})`)

  // Reeglite kontroll leiab KP2 erineva maksimumi.
  const difference = page.getByRole("listitem").filter({ hasText: "KP2 · Ülesanne KP2 — Maksimum" })
  await expect(difference).toContainText(`Lõuna OV ${stamp}: 30 p`)
  await expect(difference).toContainText(`Kirde OV ${stamp}: 25 p`)

  // 3 parimat KP-d + karistused: Beeta 68, Gamma 60, Delta 60, Alfa 50 − 5 − 2 = 43.
  const rankingRows = page.locator("tr[data-team]")
  await expect(rankingRows).toHaveCount(4)
  // Veerud: üldkoht, klassikoht, võistkond, klass, läbitud, KP1–KP4, karistused, kokku, vahed.
  const summary = async () => (await rankingRows.all()).map(async (row) => [
    await row.getAttribute("data-team"),
    (await row.getByRole("cell").nth(0).textContent())?.trim(),
    (await row.getByRole("cell").nth(1).textContent())?.trim(),
    (await row.getByRole("cell").nth(10).textContent())?.trim(),
  ])
  expect(await Promise.all(await summary())).toEqual([
    ["Beeta", "1", "1", "68.00"], ["Gamma", "2", "1", "60.00"], ["Delta", "2", "1", "60.00"], ["Alfa", "4", "3", "43.00"],
  ])
  const alfaCells = page.locator('tr[data-team="Alfa"]').getByRole("cell")
  await expect(alfaCells.nth(4)).toHaveText("3")
  await expect(alfaCells.nth(5)).toHaveText("30.0")
  await expect(alfaCells.nth(8)).toHaveText("-10.0")
  await expect(alfaCells.nth(8)).toHaveAttribute("title", "Ei lähe arvesse")
  await expect(alfaCells.nth(9)).toHaveText("-7.0")

  // Klassifilter nagu võistluse pingereas: kohad ja vahed jäävad kogu pingerea järgi.
  await page.getByLabel("Filtreeri klassi järgi").check()
  await page.waitForURL(/class=KT/)
  expect(await Promise.all(await summary())).toEqual([["Gamma", "2", "1", "60.00"], ["Delta", "2", "1", "60.00"], ["Alfa", "4", "3", "43.00"]])

  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath("series-mobile.png"), fullPage: true })
  await page.setViewportSize({ width: 1280, height: 800 })

  // Eksport sisaldab sama pingerida.
  const exported = await page.request.get(`/api/series/${seriesId}/export`)
  expect(exported.status()).toBe(200)
  const workbook = XLSX.read(await exported.body(), { type: "buffer" })
  expect(workbook.SheetNames).toEqual(["Pingerida", "Osavõistlused", "Reeglite kontroll"])
  const sheet = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets.Pingerida, { header: 1 })
  expect(sheet[1]).toEqual(["Arvestatav KP-de arv: 3"])
  expect(sheet.slice(4).map((row) => [row[0], row[4], row[10]])).toEqual([[1, "Beeta", 68], [2, "Gamma", 60], [2, "Delta", 60], [4, "Alfa", 43]])

  // Muutmine: ainult Lõuna jääb alles.
  await page.goto(`/dashboard/series/${seriesId}`)
  await page.getByRole("button", { name: "Muuda arvestust" }).click()
  await page.getByRole("searchbox", { name: "Otsi võistlust" }).fill(String(stamp))
  await page.getByRole("checkbox", { name: new RegExp(`Kirde OV ${stamp}`) }).uncheck()
  await page.getByRole("button", { name: "Salvesta muudatused" }).click()
  await expect(rankingRows).toHaveCount(2)
  await expect(page.getByText("Kõik 5 võrreldud elementi vastavad kõigil osavõistlustel samadele reeglitele.", { exact: false })).toBeVisible()

  page.once("dialog", (dialog) => dialog.accept())
  await page.getByRole("button", { name: "Muuda arvestust" }).click()
  await page.getByRole("button", { name: "Kustuta arvestus" }).click()
  await page.waitForURL("**/dashboard/series")
  expect(await db.competitionSeries.count({ where: { id: seriesId } })).toBe(0)
  expect(await db.competition.count({ where: { id: { in: [south.competition.id, north.competition.id] } } })).toBe(2)
})
