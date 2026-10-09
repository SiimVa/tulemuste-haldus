import { test, expect, type Browser, type Page } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const databaseUrl = process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/tulemuste_haldus?schema=e2e"
const parsed = new URL(databaseUrl)
if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname) || parsed.searchParams.get("schema") !== "e2e") throw new Error("Dashboard tests require a local e2e schema")
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
test.afterAll(() => db.$disconnect())

const PASSWORD = "dashboard-test-password"
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000)

async function login(page: Page, email: string) {
  await page.goto("/login")
  await page.getByPlaceholder("admin@example.com").fill(email)
  await page.locator('input[type="password"]').fill(PASSWORD)
  await page.getByRole("button", { name: "Logi sisse" }).click()
  await page.waitForURL("**/dashboard")
}

async function anonymousPage(browser: Browser) {
  const context = await browser.newContext()
  return { page: await context.newPage(), close: () => context.close() }
}

// Kaks klassi vastassuunas, erandid, katkestanud liige, kohtuniku link ja punktid.
async function seedCompetition(label: string, role: "USER" | "ADMIN" = "USER") {
  const user = await db.user.create({ data: { email: `${label}-${Date.now()}@example.com`, name: "Statistika korraldaja", role, passwordHash: await bcrypt.hash(PASSWORD, 10) } })
  const competition = await db.competition.create({ data: {
    name: `Statistika ${label}`, createdById: user.id, organizerId: user.id, isPublic: true, status: "ACTIVE",
    registrationClasses: { create: [{ name: "KT", order: 0 }, { name: "NK", order: 1 }] },
    dashboardConfig: JSON.stringify({ routes: { NK: { mode: "REVERSE", elementIds: [] } } }),
  } })
  const elements = []
  for (let order = 0; order < 5; order++) {
    elements.push(await db.scoringElement.create({ data: {
      competitionId: competition.id, code: `KP${order + 1}`, name: ["Kadad", "Kimi", "Takistusrada", "Vaatlus", "Alias"][order], order, maxValue: 30,
      fields: { create: { name: "aeg", label: "Aeg", type: "TIME_RANGE", rankingPriority: 1, meta: JSON.stringify({ higherIsBetter: false }) } },
      calcMethod: { create: { type: "RELATIVE_RANKING", params: JSON.stringify({ higherIsBetter: false }) } },
      exceptions: { create: [{ label: "Ei läbinud", penalty: 40, order: 0 }, { label: "Läbis aga ei sooritanud", penalty: 35, order: 1, kind: "PASSED_NOT_DONE" }, { label: "Puudus", penalty: 40, order: 2 }] },
    } }))
  }
  const counter = await db.scoringElement.create({ data: {
    competitionId: competition.id, code: "VT", name: "Vastutegevus", type: "COUNTER_ACTION", order: 5,
    fields: { create: { name: "elud", label: "Kaotatud elud", type: "NUMBER", rankingPriority: 1 } },
  } })
  const abandonment = await db.scoringElement.create({ data: { competitionId: competition.id, code: "KAT", name: "Katkestamine", type: "ABANDONMENT", order: 6 } })
  const token = await db.accessToken.create({ data: { competitionId: competition.id, type: "JUDGE", name: "KP1 kohtunik", elementId: elements[0].id, lastUsedAt: minutesAgo(10) } })

  const teams: Record<string, string> = {}
  for (const [index, [name, cls]] of [["Jõgeva KT", "KT"], ["Viru KT", "KT"], ["Põlva KT", "KT"], ["Põlva NK", "NK"], ["Lääne NK", "NK"], ["Pärnu NK", "NK"], ["Hiiumaa KT", "KT"]].entries()) {
    teams[name] = (await db.team.create({ data: { competitionId: competition.id, name, class: cls, code: String(index + 1), dnsFlag: name === "Hiiumaa KT" } })).id
  }
  // [võistkond, KP indeks, minutit tagasi, erand, karistuspunktid]
  const entries: [string, number, number, string | null, number][] = [
    ["Jõgeva KT", 0, 100, null, 2], ["Jõgeva KT", 1, 80, null, 5], ["Jõgeva KT", 2, 60, null, 1], ["Jõgeva KT", 3, 40, null, 4], ["Jõgeva KT", 4, 20, null, 3],
    ["Viru KT", 0, 95, null, 6], ["Viru KT", 1, 75, null, 2], ["Viru KT", 3, 30, null, 8],
    ["Põlva KT", 0, 90, null, 9],
    ["Põlva NK", 4, 85, null, 1], ["Põlva NK", 3, 65, null, 2], ["Põlva NK", 2, 45, "Läbis aga ei sooritanud", 35],
    ["Lääne NK", 4, 80, null, 4], ["Lääne NK", 3, 50, "Ei läbinud", 40],
  ]
  for (const [team, index, ago, exception, points] of entries) {
    const at = minutesAgo(ago)
    await db.result.create({ data: {
      elementId: elements[index].id, teamId: teams[team], exceptionLabel: exception, exceptionPenalty: exception ? points : null,
      values: exception ? "{}" : JSON.stringify({ aeg_start: "12:00:00", aeg_end: `12:0${index + 2}:30` }),
      enteredAt: at, updatedAt: at, enteredByTokenId: index === 0 ? token.id : null,
    } })
    await db.computedScore.create({ data: { elementId: elements[index].id, teamId: teams[team], penaltyPoints: points } })
  }
  await db.result.create({ data: { elementId: counter.id, teamId: teams["Viru KT"], values: JSON.stringify({ elud: "2" }), enteredAt: minutesAgo(70), updatedAt: minutesAgo(70) } })
  await db.computedScore.create({ data: { elementId: counter.id, teamId: teams["Viru KT"], penaltyPoints: 10 } })
  await db.miscEntry.create({ data: { elementId: abandonment.id, teamId: teams["Viru KT"], points: 10, description: "Mari Maasikas", reason: "Väsimus", abandonElementId: elements[1].id, abandonTime: "12:30" } })
  return { user, competition, elements, teams }
}

async function noHorizontalScroll(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
}

test("korraldaja näeb võistluse seisu ja avalik vaade näitab ainult avalikke vidinaid", async ({ page, browser }, testInfo) => {
  const { user, competition } = await seedCompetition("toolaud")
  await login(page, user.email)
  await page.goto(`/dashboard/competitions/${competition.id}/overview`)

  const summary = page.locator('[data-widget="summary"]')
  await expect(summary).toContainText("Tulemusi sisestatud")
  await expect(summary).toContainText("3 ohutushoiatust")
  const tracker = page.locator('[data-widget="teamTracker"]')
  await expect(tracker.getByRole("row").filter({ hasText: "Põlva KT" })).toContainText("Pole nähtud 1 h 30 min")
  await expect(tracker.getByRole("row").filter({ hasText: "Pärnu NK" })).toContainText("Pole ühestki KP-st läbi käinud")
  // NK liigub vastupidi: Põlva NK järgmine KP on KP2.
  await expect(tracker.getByRole("row").filter({ hasText: "Põlva NK" })).toContainText("KP2 Kimi")
  await expect(tracker.getByRole("row").filter({ hasText: "Jõgeva KT" })).toContainText("Lõpetanud")
  await expect(page.locator('[data-widget="missingResults"]')).toContainText("puudu: KP3")
  await expect(page.locator('[data-widget="freshness"]').getByRole("row").filter({ hasText: "Kadad" })).toContainText("Vaikib")
  const table = page.locator('[data-widget="elementTable"]').getByRole("row").filter({ hasText: "Vaatlus" })
  // Veerud: element, oodatud, tulemusi, sooritas, ebaõnnestus, läbis-ei-sooritanud, ei läbinud, muu, käis, andmed.
  await expect(table.getByRole("cell").nth(6)).toHaveText("1")
  await expect(page.locator('[data-widget="judges"]')).toContainText("KP1 kohtunik")
  await expect(page.locator('[data-widget="withdrawals"]')).toContainText("Mari Maasikas")
  await expect(page.locator('[data-widget="topTeams"]')).toContainText("Jõgeva KT")
  await expect(page.locator('[data-widget="map"]')).toContainText("Kaardil pole veel ühtegi KP-d")
  await page.screenshot({ path: testInfo.outputPath("dashboard-desktop.png"), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await noHorizontalScroll(page)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath("dashboard-mobile.png"), fullPage: true })
  await page.setViewportSize({ width: 1280, height: 800 })

  await page.getByRole("link", { name: "Kohanda vaadet" }).click()
  await page.getByRole("button", { name: /Avalik ekraan/ }).click()
  await page.getByRole("button", { name: "Salvesta" }).click()
  await expect(page.getByText("Salvestatud.")).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath("dashboard-settings.png"), fullPage: true })
  const stored = await db.competition.findUniqueOrThrow({ where: { id: competition.id }, select: { dashboardConfig: true } })
  expect(JSON.parse(stored.dashboardConfig).routes).toEqual({ NK: { mode: "REVERSE", elementIds: [] } })

  const visitor = await anonymousPage(browser)
  await visitor.page.goto(`/public/${competition.id}/dashboard`)
  await expect(visitor.page.locator('[data-widget="topTeams"]')).toContainText("Jõgeva KT")
  await expect(visitor.page.locator('[data-widget="closeContests"]')).toBeVisible()
  await expect(visitor.page.locator('[data-widget="teamTracker"]')).toHaveCount(0)
  await expect(visitor.page.locator('[data-widget="withdrawals"]')).toHaveCount(0)
  await expect(visitor.page.getByText("Mari Maasikas")).toHaveCount(0)
  // Kaart näitab KP-de asukohti ja on enne võistluse lõppu avalikult peidetud.
  await expect(visitor.page.locator('[data-widget="map"]')).toHaveCount(0)
  await expect(visitor.page.locator('[data-widget="summary"]')).not.toContainText("ohutushoiatus")
  await visitor.page.goto(`/public/${competition.id}/screen`)
  await expect(visitor.page.getByRole("heading", { name: competition.name })).toBeVisible()
  await expect(visitor.page.locator('[data-widget="summary"]')).toBeVisible()
  await visitor.page.keyboard.press("ArrowRight")
  await expect(visitor.page.locator('[data-widget="topTeams"]')).toBeVisible()
  await visitor.page.screenshot({ path: testInfo.outputPath("public-screen.png") })
  await visitor.close()

  const outsider = await db.user.create({ data: { email: `outsider-${Date.now()}@example.com`, name: "Kõrvaline", passwordHash: await bcrypt.hash(PASSWORD, 10) } })
  const config = { widgets: [{ id: "teamTracker", internal: true, public: true }], thresholds: { freshnessWarnMinutes: 20, freshnessAlertMinutes: 45, safetyMinutes: 60, topCount: 5, closeGap: 3, screenRotateSeconds: 20 }, routes: {}, finishElementId: null, mapColorMode: "RESULT", mapPublicWhileActive: false }
  const response = await page.request.put(`/api/competitions/${competition.id}/dashboard-config`, { data: config })
  expect(response.ok()).toBe(true)
  expect((await response.json()).widgets[0]).toEqual({ id: "teamTracker", internal: true, public: false })
  expect((await page.request.put(`/api/competitions/${competition.id}/dashboard-config`, { data: { widgets: "x" } })).status()).toBe(400)
  const anonymous = await anonymousPage(browser)
  expect((await anonymous.page.request.put(`/api/competitions/${competition.id}/dashboard-config`, { data: config })).status()).toBe(401)
  await anonymous.close()
  const other = await anonymousPage(browser)
  await login(other.page, outsider.email)
  expect((await other.page.request.put(`/api/competitions/${competition.id}/dashboard-config`, { data: config })).status()).toBe(403)
  await other.page.goto(`/dashboard/competitions/${competition.id}/overview`)
  await expect(other.page.locator('[data-widget="summary"]')).toHaveCount(0)
  await other.close()
})

test("kaart: pilt, KP-de märkimine, MGRS-import ja avalik pilt alles pärast võistlust", async ({ page, browser }, testInfo) => {
  const { user, competition } = await seedCompetition("kaart")
  await login(page, user.email)

  // Kaardipildiks sobib iga PNG; teeme selle brauseris.
  await page.setContent('<div style="width:1200px;height:900px;background:linear-gradient(135deg,#d9f99d,#86efac 60%,#93c5fd)"></div>')
  const png = await page.locator("div").screenshot()
  await page.goto(`/dashboard/competitions/${competition.id}/map`)
  await page.getByText("Lae kaart üles").locator("input[type=file]").setInputFiles({ name: "kaart.png", mimeType: "image/png", buffer: png })
  await expect(page.getByText("Kaart on üles laaditud")).toBeVisible()
  await page.getByText("Asenda kaart").locator("input[type=file]").setInputFiles({ name: "pilt.svg", mimeType: "image/png", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') })
  await expect(page.getByText("Kaart peab olema PNG-, JPEG- või WebP-pilt.")).toBeVisible()

  const csv = ["Tähis,Nimi,Tüüp,MGRS", "KP1,Kadad,KP,35VLF 70000 89000", "KP2,Kimi,KP,35VLF 70800 89400", "KP3,Takistusrada,KP,35VLF 70400 89900", ",Start KT,Märk,35VLF 70100 88900"].join("\n")
  await page.getByText("Impordi koordinaadid").locator("input[type=file]").setInputFiles({ name: "asukohad.csv", mimeType: "text/csv", buffer: Buffer.from(csv) })
  await expect(page.getByText("Imporditud 4 koordinaati.")).toBeVisible()
  await expect(page.locator('[data-map-element="KP1"] input')).toHaveValue("35VLF 70000 89000")

  const broken = ["Tähis,Nimi,Tüüp,MGRS", "KP4,Vaatlus,KP,35VLF 7000 890", "KP9,Puudub,KP,35VLF 70000 89000"].join("\n")
  await page.getByText("Impordi koordinaadid").locator("input[type=file]").setInputFiles({ name: "vigane.csv", mimeType: "text/csv", buffer: Buffer.from(broken) })
  await expect(page.getByText("Rida 2: MGRS-koordinaat „35VLF 7000 890” on vigane.")).toBeVisible()
  await expect(page.getByText("Rida 3: tähist „KP9” ei leitud.")).toBeVisible()
  expect((await db.scoringElement.findFirstOrThrow({ where: { competitionId: competition.id, code: "KP4" } })).mgrs).toBeNull()

  const map = page.getByRole("img", { name: "Kaart KP-de asukohtadega" })
  await page.locator('[data-map-element="KP1"]').getByRole("button", { name: "Märgi kaardile" }).click()
  const box = (await map.boundingBox())!
  await map.click({ position: { x: box.width * 0.3, y: box.height * 0.7 } })
  await expect(page.getByText(/KP1 märgitud kaardile\. Järgmisena klõpsa kohta, kus asub KP2 Kimi\./)).toBeVisible()
  await map.click({ position: { x: box.width * 0.7, y: box.height * 0.4 } })
  await expect(page.getByText("KP2 märgitud kaardile.", { exact: false })).toBeVisible()
  await expect(page.locator('[data-map-element="KP3"]')).toContainText("Koordinaadi järgi")
  await expect(page.getByText(/Kaart on koordinaatidega seotud 2 punkti abil/)).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath("map-editor.png"), fullPage: true })
  const kp1 = await db.scoringElement.findFirstOrThrow({ where: { competitionId: competition.id, code: "KP1" } })
  expect(kp1.mapX).toBeCloseTo(0.3, 1)
  expect(kp1.latitude).toBeCloseTo(59.4195, 3)

  const template = await page.request.get(`/api/competitions/${competition.id}/map/template`)
  expect(template.ok()).toBe(true)
  expect(template.headers()["content-type"]).toContain("spreadsheetml")

  await page.goto(`/dashboard/competitions/${competition.id}/overview`)
  const mapWidget = page.locator('[data-widget="map"]')
  await expect(mapWidget.locator("circle")).not.toHaveCount(0)
  await expect(mapWidget.locator("text", { hasText: "Start KT" })).toBeVisible()
  await mapWidget.screenshot({ path: testInfo.outputPath("dashboard-map.png") })

  const config = JSON.parse((await db.competition.findUniqueOrThrow({ where: { id: competition.id }, select: { dashboardConfig: true } })).dashboardConfig)
  await db.competition.update({ where: { id: competition.id }, data: { dashboardConfig: JSON.stringify({ ...config, widgets: [{ id: "map", internal: true, public: true }] }) } })
  const visitor = await anonymousPage(browser)
  expect((await visitor.page.request.get(`/api/public/competitions/${competition.id}/map-image`)).status()).toBe(404)
  expect((await visitor.page.request.get(`/api/competitions/${competition.id}/map/image`)).status()).toBe(401)
  await db.competition.update({ where: { id: competition.id }, data: { status: "FINISHED" } })
  const image = await visitor.page.request.get(`/api/public/competitions/${competition.id}/map-image`)
  expect(image.status()).toBe(200)
  expect(image.headers()["content-type"]).toBe("image/png")
  await visitor.page.goto(`/public/${competition.id}/dashboard`)
  await expect(visitor.page.locator('[data-widget="map"]')).toContainText("Kaart")
  await visitor.close()

  await page.goto(`/dashboard/competitions/${competition.id}/map`)
  page.once("dialog", (dialog) => dialog.accept())
  await page.getByRole("button", { name: "Eemalda kaart" }).click()
  await expect(page.getByText("Kaardipilt eemaldatud.")).toBeVisible()
  const cleared = await db.scoringElement.findFirstOrThrow({ where: { competitionId: competition.id, code: "KP1" } })
  expect([cleared.mapX, cleared.mgrs]).toEqual([null, "35VLF 70000 89000"])
})

test("külmutatud pingerida peidab hilisemad muudatused avalikkuse eest kuni avalikustamiseni", async ({ page, browser }) => {
  const { user, competition, elements, teams } = await seedCompetition("kylmutus")
  await db.competition.update({ where: { id: competition.id }, data: {
    athletePointsMode: "EXACT", athleteShowRank: true, athleteShowTotal: true,
    dashboardConfig: JSON.stringify({ widgets: [{ id: "topTeams", internal: true, public: true }] }),
  } })
  const athlete = await db.accessToken.create({ data: { competitionId: competition.id, type: "ATHLETE", name: "Viru KT", teamId: teams["Viru KT"] } })
  // Üheselt järjestatud seis: Jõgeva KT ees, Viru KT teine, teised kaugel.
  await db.computedScore.deleteMany({ where: { teamId: { in: Object.values(teams) } } })
  for (const [index, [name, id]] of Object.entries(teams).entries()) {
    await db.computedScore.create({ data: { elementId: elements[0].id, teamId: id, penaltyPoints: name === "Jõgeva KT" ? 10 : name === "Viru KT" ? 20 : 30 + index } })
  }
  await login(page, user.email)
  await page.goto(`/dashboard/competitions/${competition.id}/public-view`)
  await page.getByRole("button", { name: "Külmuta kohe" }).click()
  await expect(page.getByRole("status").filter({ hasText: "Avalik pingerida on külmutatud seisuga" })).toBeVisible()

  // Pärast külmutamist tõuseb Viru KT jooksvas seisus esimeseks.
  await db.computedScore.updateMany({ where: { teamId: teams["Viru KT"] }, data: { penaltyPoints: 0 } })
  const visitor = await anonymousPage(browser)
  await visitor.page.goto(`/public/${competition.id}/leaderboard`)
  await expect(visitor.page.getByText(/Pingerida on külmutatud seisuga/)).toBeVisible()
  const firstRow = visitor.page.locator("table tbody tr").first()
  await expect(firstRow).toContainText("Jõgeva KT")
  const api = await (await visitor.page.request.get(`/api/competitions/${competition.id}/leaderboard`)).json()
  expect(api.frozenAt).not.toBeNull()
  expect(api.leaderboard[0].team.name).toBe("Jõgeva KT")
  await visitor.page.goto(`/public/${competition.id}/dashboard`)
  await expect(visitor.page.locator('[data-widget="topTeams"] li').first()).toContainText("Jõgeva KT")
  await visitor.page.goto(`/public/${competition.id}/analysis`)
  await expect(visitor.page.getByText("Analüüs avaneb pärast tulemuste avalikustamist.", { exact: false })).toBeVisible()
  const simulate = await visitor.page.request.post(`/api/competitions/${competition.id}/simulate`, { data: { teamId: teams["Viru KT"], overrides: {} } })
  expect(simulate.status()).toBe(423)
  await visitor.page.goto(`/athlete/${athlete.token}`)
  await expect(visitor.page.getByText(/Punktid ja kohad avalikustatakse autasustamisel/)).toBeVisible()
  await expect(visitor.page.getByText("Üldkoht")).toHaveCount(0)
  await expect(visitor.page.getByText("Kokku", { exact: true })).toHaveCount(0)

  await page.goto(`/dashboard/competitions/${competition.id}/leaderboard`)
  await expect(page.getByText(/Avalik pingerida on külmutatud seisuga/)).toBeVisible()
  await expect(page.locator("table tbody tr").first()).toContainText("Viru KT")
  const managerApi = await (await page.request.get(`/api/competitions/${competition.id}/leaderboard`)).json()
  expect(managerApi.frozenAt).toBeNull()

  await page.goto(`/dashboard/competitions/${competition.id}/public-view`)
  page.once("dialog", (dialog) => dialog.accept())
  await page.getByRole("button", { name: "Avalikusta tulemused" }).click()
  await expect(page.getByText("Pingerida ei ole külmutatud.")).toBeVisible()
  await visitor.page.goto(`/public/${competition.id}/leaderboard`)
  await expect(visitor.page.locator("table tbody tr").first()).toContainText("Viru KT")
  await expect(visitor.page.getByText(/Pingerida on külmutatud seisuga/)).toHaveCount(0)
  await visitor.close()
})

test("erandi liik salvestub ja muudab KP tabelit", async ({ page }) => {
  const { user, competition, elements, teams } = await seedCompetition("erand")
  await db.result.create({ data: { elementId: elements[1].id, teamId: teams["Põlva KT"], exceptionLabel: "Puudus", exceptionPenalty: 40, values: "{}" } })
  await login(page, user.email)
  await page.goto(`/dashboard/competitions/${competition.id}/overview`)
  const row = page.locator('[data-widget="elementTable"]').getByRole("row").filter({ hasText: "Kimi" })
  await expect(row.getByRole("cell").nth(7)).toHaveText("1")

  await page.goto(`/dashboard/competitions/${competition.id}/elements/${elements[1].id}/edit`)
  const kind = page.getByRole("combobox", { name: "Erandi liik", exact: true }).nth(2)
  await expect(kind).toHaveValue("OTHER")
  await expect(page.getByRole("combobox", { name: "Erandi liik", exact: true }).first()).toHaveValue("NOT_PASSED")
  await kind.selectOption("NOT_PASSED")
  await page.getByRole("button", { name: "Salvesta muudatused" }).click()
  await page.waitForURL(`**/elements/${elements[1].id}`)
  const stored = await db.elementException.findMany({ where: { elementId: elements[1].id }, orderBy: { order: "asc" } })
  expect(stored.map((exception) => exception.kind)).toEqual(["NOT_PASSED", "PASSED_NOT_DONE", "NOT_PASSED"])

  await page.goto(`/dashboard/competitions/${competition.id}/overview`)
  await expect(row.getByRole("cell").nth(6)).toHaveText("1")
  await expect(row.getByRole("cell").nth(7)).toHaveText("0")
})

test("võistluse koopia saab töölaua seaded uute elemendiviidetega, asukohad ja kaardi", async ({ page }) => {
  const { user, competition, elements } = await seedCompetition("koopia", "ADMIN")
  await db.competition.update({ where: { id: competition.id }, data: { dashboardConfig: JSON.stringify({
    routes: { NK: { mode: "CUSTOM", elementIds: [elements[4].id, elements[2].id] } }, finishElementId: elements[4].id,
    thresholds: { safetyMinutes: 90 },
  }) } })
  await db.scoringElement.update({ where: { id: elements[0].id }, data: { mapX: 0.25, mapY: 0.5, mgrs: "35VLF 70000 89000", latitude: 59.4195, longitude: 24.709 } })
  await db.competitionMap.create({ data: {
    competitionId: competition.id, image: Buffer.from([0x89, 0x50, 0x4e, 0x47]), imageType: "image/png", imageWidth: 10, imageHeight: 8, imageName: "kaart.png", imageUpdatedAt: new Date(),
    markers: [{ id: "start", label: "Start KT", mapX: 0.1, mapY: 0.9, mgrs: null, latitude: null, longitude: null }],
  } })
  await login(page, user.email)
  const response = await page.request.post(`/api/competitions/${competition.id}/copy`, { data: { includeElements: true } })
  expect(response.status()).toBe(201)
  const copiedId = (await response.json()).id
  const copied = await db.competition.findUniqueOrThrow({ where: { id: copiedId }, include: { elements: { include: { exceptions: { orderBy: { order: "asc" } } } }, map: true } })
  const byCode = new Map(copied.elements.map((element) => [element.code, element]))
  const config = JSON.parse(copied.dashboardConfig)
  expect(config.routes.NK).toEqual({ mode: "CUSTOM", elementIds: [byCode.get("KP5")!.id, byCode.get("KP3")!.id] })
  expect(config.finishElementId).toBe(byCode.get("KP5")!.id)
  expect(config.thresholds.safetyMinutes).toBe(90)
  expect(byCode.get("KP1")).toMatchObject({ mapX: 0.25, mapY: 0.5, mgrs: "35VLF 70000 89000" })
  expect(byCode.get("KP1")!.exceptions.map((exception) => exception.kind)).toEqual([null, "PASSED_NOT_DONE", null])
  expect(copied.map?.imageName).toBe("kaart.png")
  expect(copied.map?.markers).toEqual([{ id: "start", label: "Start KT", mapX: 0.1, mapY: 0.9, mgrs: null, latitude: null, longitude: null }])
})

test("avalik ülevaade värskendab ainult avalikku JSON-i ja jätab vea korral viimase seisu nähtavale", async ({ page }) => {
  const { user, competition } = await seedCompetition("json-refresh")
  const endpoint = `/api/public/competitions/${competition.id}/dashboard`
  const response = await page.request.get(endpoint)
  expect(response.status()).toBe(200)
  expect(response.headers()["cache-control"]).toBe("no-store")
  const body = await response.text()
  expect(body).not.toContain(user.id)
  expect(body).not.toContain("KP1 kohtunik")
  expect(body).not.toContain("Mari Maasikas")
  const initial = JSON.parse(body)
  expect(initial.widgets).toEqual(["summary", "elementProgress"])
  expect(initial.config.routes).toEqual({})
  expect(initial.config.finishElementId).toBeNull()
  expect(initial.summary.alertCount).toBe(0)
  expect(initial.judges).toBeUndefined()
  expect(initial.teamTracker).toBeUndefined()
  expect(initial.withdrawals).toBeUndefined()
  const unchanged = await page.request.get(endpoint, { headers: { "If-None-Match": response.headers().etag } })
  expect(unchanged.status()).toBe(304)

  await page.clock.install()
  await page.goto(`/public/${competition.id}/dashboard`)
  await expect(page.getByRole("heading", { name: competition.name })).toBeVisible()
  let jsonRequests = 0
  let rscRefreshes = 0
  let fail = false
  page.on("request", request => {
    if (request.url().includes(`/public/${competition.id}/dashboard`) && request.headers().rsc === "1") rscRefreshes++
  })
  const refreshed = { ...initial, competition: { ...initial.competition, name: "Värskendatud ülevaade" }, generatedAt: new Date().toISOString() }
  await page.route(`**${endpoint}`, async route => {
    jsonRequests++
    await route.fulfill({ status: fail ? 503 : 200, contentType: "application/json", body: JSON.stringify(fail ? { error: "Ajutine viga" } : refreshed), headers: { ETag: '"refreshed-dashboard"' } })
  })
  await page.clock.fastForward(31_000)
  await expect(page.getByRole("heading", { name: "Värskendatud ülevaade" })).toBeVisible()
  expect(jsonRequests).toBeGreaterThan(0)
  expect(rscRefreshes).toBe(0)
  fail = true
  await page.clock.fastForward(31_000)
  await expect(page.getByRole("status")).toContainText("Uuendamine ebaõnnestus")
  await expect(page.getByRole("heading", { name: "Värskendatud ülevaade" })).toBeVisible()
  await expect(page.locator('[data-widget="summary"]')).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await noHorizontalScroll(page)).toBe(true)
})
