import { test, expect, type Page } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

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

// [võistkonna nimi, klass, KP1–KP3 punktid, KP3 erand]
type TeamSeed = [string, string, [number, number, number], string | null]

async function seedCompetition(name: string, ownerId: string, teams: TeamSeed[]) {
  const competition = await db.competition.create({ data: { name, createdById: ownerId, organizerId: ownerId, scoringMode: "PLUS", status: "FINISHED" } })
  const elements: string[] = []
  for (const [order, code] of ["KP1", "KP2", "KP3"].entries()) {
    elements.push((await db.scoringElement.create({ data: {
      competitionId: competition.id, code, name: `Ülesanne ${code}`, order,
      exceptions: { create: [{ label: "Ei läbinud", penalty: -5, order: 0, kind: "NOT_PASSED" }] },
      fields: { create: { name: "points", label: "Punktid", type: "NUMBER", isResultField: true, order: 0 } },
      calcMethod: { create: { type: "ABSOLUTE_POINTS", params: "{}" } },
    } })).id)
  }
  const teamIds: Record<string, string> = {}
  for (const [index, [teamName, cls, points, exception]] of teams.entries()) {
    const team = await db.team.create({ data: { competitionId: competition.id, code: `${name.slice(0, 1)}${index + 1}`, name: teamName, class: cls } })
    teamIds[teamName] = team.id
    for (const [kpIndex, value] of points.entries()) {
      const exceptionLabel = kpIndex === 2 ? exception : null
      await db.result.create({ data: { elementId: elements[kpIndex], teamId: team.id, values: JSON.stringify({ points: value }), exceptionLabel, exceptionPenalty: exceptionLabel ? value : null } })
      await db.computedScore.create({ data: { elementId: elements[kpIndex], teamId: team.id, penaltyPoints: value } })
    }
  }
  return { competition, elements, teamIds }
}

test("üleriiklik arvestus: avaldamine, avalik pingerida, ülevaade, analüüsi ligipääs ja külmutused", async ({ page, browser }, testInfo) => {
  const stamp = Date.now()
  const admin = await db.user.create({ data: { email: `series-public-${stamp}@example.com`, name: "Admin", role: "ADMIN", passwordHash: await bcrypt.hash("series-public-password", 10) } })
  // Lõuna: Alfa läbis 3, Beeta 2 → 2,5 → 3. Kirde: 3 ja 3 → 3. N = 3.
  const south = await seedCompetition(`Lõuna OV ${stamp}`, admin.id, [["Alfa", "KT", [30, 20, 10], null], ["Beeta", "NK", [25, 25, -5], "Ei läbinud"]])
  const north = await seedCompetition(`Kirde OV ${stamp}`, admin.id, [["Gamma", "KT", [20, 20, 20], null], ["Delta", "KT", [10, 10, 10], null]])
  const series = await db.competitionSeries.create({ data: {
    name: `Jäljed metsas avalik ${stamp}`,
    competitions: { create: [{ competitionId: north.competition.id, order: 0 }, { competitionId: south.competition.id, order: 1 }] },
  } })
  const publicUrl = `/public/series/${series.id}`

  const anonymousContext = await browser.newContext()
  const anonymous = await anonymousContext.newPage()
  expect((await anonymous.goto(publicUrl))?.status()).toBe(404)

  await login(page, admin.email, "series-public-password")
  await page.goto(publicUrl)
  await expect(page.getByText("Eelvaade: arvestus ei ole avaldatud.")).toBeVisible()

  const analysisSettings = page.getByRole("region", { name: "Analüüsi ligipääs", exact: true })
  const settingsUrl = `/dashboard/series/${series.id}/public`
  await page.goto(settingsUrl)
  await page.getByRole("button", { name: "Avalda" }).click()
  await expect(page.getByText("Arvestus on avaldatud.")).toBeVisible()

  // Avalik pingerida: N parimat KP-d, võrdne tulemus jagab kohta.
  const rows = anonymous.locator("tr[data-team]")
  const ranking = async () => Promise.all((await rows.all()).map(async (row) => [
    await row.getAttribute("data-team"),
    (await row.getByRole("cell").nth(0).textContent())?.trim(),
    (await row.getByRole("cell").nth(9).textContent())?.trim(),
  ]))
  await anonymous.goto(publicUrl)
  await expect(anonymous.getByRole("heading", { name: series.name })).toBeVisible()
  await expect(rows).toHaveCount(4)
  expect(await ranking()).toEqual([["Gamma", "1", "60.00"], ["Alfa", "1", "60.00"], ["Beeta", "3", "45.00"], ["Delta", "4", "30.00"]])
  await expect(anonymous.getByRole("navigation", { name: "Üleriikliku arvestuse vaated" }).getByRole("link", { name: "Analüüs" })).toBeVisible()
  await anonymous.setViewportSize({ width: 390, height: 844 })
  expect(await anonymous.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await anonymous.screenshot({ path: testInfo.outputPath("series-public-mobile.png"), fullPage: true })
  await anonymous.setViewportSize({ width: 1280, height: 800 })
  await anonymous.screenshot({ path: testInfo.outputPath("series-public-desktop.png"), fullPage: true })

  // Avalik ülevaade: ainult avalikuks märgitud vidinad.
  await anonymous.goto(`${publicUrl}/overview`)
  await expect(anonymous.locator('[data-widget="summary"]')).toBeVisible()
  await expect(anonymous.locator('[data-widget="topTeams"]')).toBeVisible()
  await expect(anonymous.locator('[data-widget="kpComparison"]')).toHaveCount(0)
  await page.getByLabel("KP-d osavõistlustes: avalikus vaates").check()
  await page.getByRole("button", { name: "Salvesta vidinad" }).click()
  await expect(page.getByText("Salvestatud.")).toBeVisible()
  await anonymous.reload()
  await expect(anonymous.locator('[data-widget="kpComparison"]')).toBeVisible()
  await expect(anonymous.locator('[data-widget="kpComparison"] tr[data-kp="KP3"]')).toContainText("(50%)")
  await anonymous.screenshot({ path: testInfo.outputPath("series-public-overview.png"), fullPage: true })
  await anonymous.goto(`${publicUrl}/screen`)
  await expect(anonymous.getByRole("heading", { name: series.name })).toBeVisible()

  // Analüüs: avalik → suletud → ainult lingiga.
  await anonymous.goto(`${publicUrl}/analysis`)
  await anonymous.getByLabel("Võistkond").selectOption({ label: `3. Beeta · NK · Lõuna OV ${stamp}` })
  await anonymous.waitForURL(/team=/)
  const analysis = anonymous.locator('[data-team-analysis="Beeta"]')
  await expect(analysis).toContainText("üldkoht")
  await expect(analysis.locator('tr[data-kp="KP3"]')).toContainText("Ei läbinud")
  await analysisSettings.getByLabel("Suletud").check()
  await analysisSettings.getByRole("button", { name: "Salvesta", exact: true }).click()
  await expect(page.getByText("Salvestatud", { exact: true })).toBeVisible()
  expect((await anonymous.goto(`${publicUrl}/analysis`))?.status()).toBe(404)
  await analysisSettings.getByLabel("Ainult lingiga").check()
  await analysisSettings.getByRole("button", { name: "Salvesta", exact: true }).click()
  const linkInput = page.getByLabel("Analüüsilink")
  await expect(linkInput).toHaveValue(/\/analysis\/series\//)
  const analysisLink = new URL(await linkInput.inputValue()).pathname
  await anonymous.goto(analysisLink)
  await expect(anonymous.getByRole("navigation", { name: "Analüüsi vaade" })).toBeVisible()
  expect((await anonymous.goto(`${publicUrl}/analysis`))?.status()).toBe(404)
  expect((await anonymous.goto("/analysis/series/" + "x".repeat(43)))?.status()).toBe(404)

  // Üleriikliku arvestuse külmutus: hilisem muudatus ei paista avalikult.
  await page.getByRole("button", { name: "Külmuta kohe" }).click()
  await expect(page.getByText(/Avalik pingerida on külmutatud seisuga/)).toBeVisible()
  await db.result.update({ where: { elementId_teamId: { elementId: north.elements[0], teamId: north.teamIds.Delta } }, data: { values: JSON.stringify({ points: 40 }) } })
  await anonymous.goto(publicUrl)
  await expect(anonymous.getByText(/Üleriiklik arvestus on külmutatud seisuga/)).toBeVisible()
  expect((await ranking()).find(([team]) => team === "Delta")).toEqual(["Delta", "4", "30.00"])
  await anonymous.goto(analysisLink)
  await expect(anonymous.getByText("Analüüs avaneb pärast tulemuste avalikustamist.")).toBeVisible()
  await page.goto(`/dashboard/series/${series.id}`)
  await expect(page.locator('tr[data-team="Delta"]').getByRole("cell").nth(9)).toHaveText("60.00")
  await page.goto(settingsUrl)
  page.once("dialog", (dialog) => dialog.accept())
  await page.getByRole("button", { name: "Avalikusta tulemused" }).click()
  await expect(page.getByText("Pingerida ei ole külmutatud.")).toBeVisible()
  await anonymous.goto(publicUrl)
  expect((await ranking()).find(([team]) => team === "Delta")).toEqual(["Delta", "1", "60.00"])

  // Osavõistluse külmutus kehtib ka üleriiklikus avalikus vaates.
  expect((await page.request.put(`/api/competitions/${south.competition.id}/leaderboard-freeze`, { data: { now: true } })).status()).toBe(200)
  await db.result.update({ where: { elementId_teamId: { elementId: south.elements[0], teamId: south.teamIds.Beeta } }, data: { values: JSON.stringify({ points: 35 }) } })
  await anonymous.goto(publicUrl)
  await expect(anonymous.getByText(`Osavõistluse Lõuna OV ${stamp} pingerida on külmutatud`)).toBeVisible()
  expect((await ranking()).find(([team]) => team === "Beeta")).toEqual(["Beeta", "4", "45.00"])
  await page.goto(`/dashboard/series/${series.id}`)
  await expect(page.locator('tr[data-team="Beeta"]').getByRole("cell").nth(9)).toHaveText("55.00")
  expect((await page.request.delete(`/api/competitions/${south.competition.id}/leaderboard-freeze`)).status()).toBe(200)
  await anonymous.goto(publicUrl)
  expect((await ranking()).find(([team]) => team === "Beeta")).toEqual(["Beeta", "4", "55.00"])

  // Administraatori ülevaade ja analüüs näitavad jooksvat seisu kõigi vidinatega.
  await page.goto(`/dashboard/series/${series.id}/overview`)
  for (const widget of ["summary", "topTeams", "competitions", "classComparison", "closeContests", "kpComparison"]) {
    await expect(page.locator(`[data-widget="${widget}"]`)).toBeVisible()
  }
  await page.goto(`/dashboard/series/${series.id}/analysis?team=${south.teamIds.Alfa}`)
  await expect(page.locator('[data-team-analysis="Alfa"]')).toContainText("üldkoht")
  await page.screenshot({ path: testInfo.outputPath("series-internal-analysis.png"), fullPage: true })
  await page.goto(`/dashboard/series/${series.id}/analysis?vaade=kp`)
  await expect(page.locator('[data-widget="kpComparison"]')).toBeVisible()
  await page.goto(settingsUrl)
  await page.screenshot({ path: testInfo.outputPath("series-settings.png"), fullPage: true })

  // Peitmine: avalikud lingid lakkavad töötamast.
  await page.goto(settingsUrl)
  page.once("dialog", (dialog) => dialog.accept())
  await page.getByRole("button", { name: "Peida avalikust vaatest" }).click()
  await expect(page.getByText("Arvestus ei ole avaldatud.")).toBeVisible()
  expect((await anonymous.goto(publicUrl))?.status()).toBe(404)
  expect((await anonymous.goto(analysisLink))?.status()).toBe(404)
  expect((await anonymous.request.put(`/api/series/${series.id}/publish`, { data: { isPublished: true } })).status()).toBe(401)
  await anonymousContext.close()
})

test("pingerida ja analüüs on eraldi avalikud, lingiga või suletud", async ({ page, browser }, testInfo) => {
  const stamp = Date.now()
  const admin = await db.user.create({ data: { email: `series-sharing-${stamp}@example.com`, name: "Admin", role: "ADMIN", passwordHash: await bcrypt.hash("series-sharing-password", 10) } })
  const ov = await seedCompetition(`Jagamise OV ${stamp}`, admin.id, [["Alfa", "KT", [30, 20, 10], null], ["Beeta", "KT", [20, 10, -5], "Ei läbinud"]])
  const series = await db.competitionSeries.create({ data: { name: `Eraldi vaated ${stamp}`, isPublished: true, competitions: { create: { competitionId: ov.competition.id } } } })
  const base = `/public/series/${series.id}`
  const settings = `/dashboard/series/${series.id}/public`
  const anonymousContext = await browser.newContext()
  const anonymous = await anonymousContext.newPage()
  await login(page, admin.email, "series-sharing-password")
  await page.goto(settings)
  const leaderboardSettings = page.getByRole("region", { name: "Pingerea ja ülevaate ligipääs" })
  const analysisSettings = page.getByRole("region", { name: "Analüüsi ligipääs", exact: true })
  await leaderboardSettings.getByLabel("Ainult lingiga").check()
  await leaderboardSettings.getByRole("button", { name: "Salvesta", exact: true }).click()
  await expect(leaderboardSettings.getByLabel("Pingerealink")).toHaveValue(/\/ranking\/series\//)
  const tokenPath = new URL(await leaderboardSettings.getByLabel("Pingerealink").inputValue()).pathname
  for (const suffix of ["", "/overview", "/screen"]) expect((await anonymous.goto(`${base}${suffix}`))?.status()).toBe(404)
  await anonymous.goto(tokenPath)
  await expect(anonymous.locator("tr[data-team]")).toHaveCount(2)
  await expect(anonymous.getByRole("link", { name: "Ülevaade", exact: true })).toHaveAttribute("href", `${tokenPath}/overview`)
  await anonymous.getByRole("link", { name: "Ülevaade", exact: true }).click()
  await expect(anonymous.locator('[data-widget="summary"]')).toBeVisible()
  await anonymous.goto(`${tokenPath}/screen`)
  await expect(anonymous.getByRole("heading", { name: series.name })).toBeVisible()

  // Avalik analüüs ei avalda lingiga kaitstud pingerea aadressi.
  await anonymous.goto(`${base}/analysis`)
  await expect(anonymous.getByRole("button", { name: "Võistkonna vaade" })).toBeVisible()
  await expect(anonymous.getByRole("link", { name: "Pingerida", exact: true })).toHaveCount(0)
  await anonymous.getByRole("button", { name: "KP võrdlus" }).click()
  await anonymous.getByLabel("KP", { exact: true }).selectOption("KP1")
  await expect(anonymous.getByRole("row").filter({ hasText: "Alfa" })).toHaveCount(1)
  await anonymous.setViewportSize({ width: 390, height: 844 })
  expect(await anonymous.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await anonymous.screenshot({ path: testInfo.outputPath("series-shared-analysis-mobile.png"), fullPage: true })

  await analysisSettings.getByLabel("Ainult lingiga").check()
  await analysisSettings.getByRole("button", { name: "Salvesta", exact: true }).click()
  await expect(analysisSettings.getByLabel("Analüüsilink")).toHaveValue(/\/analysis\/series\//)
  const analysisPath = new URL(await analysisSettings.getByLabel("Analüüsilink").inputValue()).pathname
  expect((await anonymous.goto(`${base}/analysis`))?.status()).toBe(404)
  await anonymous.goto(analysisPath)
  await expect(anonymous.getByRole("button", { name: "Võistkonna vaade" })).toBeVisible()
  await expect(anonymous.getByRole("link", { name: "Pingerida", exact: true })).toHaveCount(0)
  // Kahe eri lingi tunnuseid ei saa vahetada.
  expect((await anonymous.goto(`/ranking/series/${analysisPath.split("/").pop()}`))?.status()).toBe(404)
  expect((await anonymous.goto(`/analysis/series/${tokenPath.split("/").pop()}`))?.status()).toBe(404)

  // Uue pingerealingi loomine tühistab vana, analüüsilink jääb kehtima.
  await leaderboardSettings.getByRole("button", { name: "Loo uus link" }).click()
  await expect(leaderboardSettings.getByLabel("Pingerealink")).not.toHaveValue(new RegExp(tokenPath.split("/").pop()!))
  const replacement = new URL(await leaderboardSettings.getByLabel("Pingerealink").inputValue()).pathname
  expect((await anonymous.goto(tokenPath))?.status()).toBe(404)
  expect((await anonymous.goto(analysisPath))?.status()).toBe(200)
  await leaderboardSettings.getByLabel("Suletud").check()
  const closed = page.waitForResponse((response) => response.url().endsWith(`/api/series/${series.id}/leaderboard-access`) && response.request().method() === "PATCH")
  await leaderboardSettings.getByRole("button", { name: "Salvesta", exact: true }).click()
  expect((await closed).status()).toBe(200)
  expect((await anonymous.goto(replacement))?.status()).toBe(404)
  expect((await anonymous.goto(analysisPath))?.status()).toBe(200)
  // Külmutus sulgeb ka eraldi lingiga jagatud analüüsi.
  expect((await page.request.put(`/api/series/${series.id}/freeze`, { data: { now: true } })).status()).toBe(200)
  await anonymous.goto(analysisPath)
  await expect(anonymous.getByText("Analüüs avaneb pärast tulemuste avalikustamist.")).toBeVisible()
  expect((await anonymous.request.patch(`/api/series/${series.id}/leaderboard-access`, { data: { leaderboardAccessMode: "PUBLIC" } })).status()).toBe(401)
  await page.goto(`/dashboard/series/${series.id}/analysis`)
  await expect(page.getByRole("button", { name: "KP võrdlus" })).toBeVisible()
  await anonymousContext.close()
})
