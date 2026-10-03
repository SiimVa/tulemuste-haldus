import { test, expect } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const databaseUrl = process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/tulemuste_haldus?schema=e2e"
const parsed = new URL(databaseUrl)
if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname) || parsed.searchParams.get("schema") !== "e2e") throw new Error("Finalize tests require a local e2e schema")
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
test.afterAll(() => db.$disconnect())

test("kinnitamine näitab kõik e-posti kordused ja korraldaja saab avalduse tagasi lükata või kinnitada nii", async ({ page }, testInfo) => {
  const user = await db.user.create({ data: { email: `finalize-${Date.now()}@example.com`, name: "Kinnitaja", passwordHash: await bcrypt.hash("finalize-test-password", 10) } })
  const competition = await db.competition.create({ data: { name: "Kinnitamise võistlus", createdById: user.id, organizerId: user.id, registrationOverride: "CLOSED" } })
  const memberList = await db.competitionFormField.create({ data: {
    competitionId: competition.id, key: "members", label: "Võistkonna liikmed", type: "MEMBER_LIST", memberFields: JSON.stringify(["name", "email"]),
  } })
  await db.team.create({ data: { competitionId: competition.id, code: "01", name: "Olemasolev", members: { create: { name: "Vana liige", email: "vana@example.com" } } } })
  const applications: Record<string, string> = {}
  const entries: [string, { name: string; email?: string; isCaptain?: boolean }[]][] = [
    ["Kotkad", [{ name: "Mari", email: "ema@example.com", isCaptain: true }, { name: "Jüri", email: "Ema@Example.com" }, { name: "Kati", email: "kati@example.com" }]],
    ["Pääsukesed", [{ name: "Liis", email: "kati@example.com" }, { name: "Ants", email: "vana@example.com" }]],
    ["Korras", [{ name: "Eva", email: "eva@example.com" }]],
  ]
  for (const [index, [teamName, members]] of entries.entries()) {
    applications[teamName] = (await db.registrationApplication.create({ data: {
      competitionId: competition.id, submittedById: user.id, teamName, status: "CONFIRMED", submittedAt: new Date(Date.now() - (10 - index) * 60_000),
      fieldValues: { create: { fieldId: memberList.id, value: JSON.stringify(members) } },
    } })).id
  }

  await page.goto("/login")
  await page.getByPlaceholder("admin@example.com").fill(user.email)
  await page.locator('input[type="password"]').fill("finalize-test-password")
  await page.getByRole("button", { name: "Logi sisse" }).click()
  await page.waitForURL("**/dashboard")

  // Ilma korraldaja nõusolekuta ei kinnitata midagi.
  const endpoint = `/api/competitions/${competition.id}/registration-applications/finalize`
  const refused = await page.request.post(endpoint, { data: {} })
  expect(refused.status()).toBe(409)
  expect((await refused.json()).issues.map((item: { teamName: string }) => item.teamName)).toEqual(["Kotkad", "Pääsukesed"])
  expect(await db.team.count({ where: { competitionId: competition.id } })).toBe(1)

  await page.goto(`/dashboard/competitions/${competition.id}/registrations`)
  await page.getByRole("button", { name: "Kinnita osalejate nimekiri" }).click()
  const review = page.getByRole("region", { name: "Osalejate nimekirja kinnitamine" })
  await expect(review).toContainText("Leiti 3 e-posti kordust 2 avalduses")
  const kotkad = review.locator('[data-finalize-application="Kotkad"]')
  await expect(kotkad).toContainText("E-post ema@example.com on mitmel liikmel: Mari, Jüri. Kinnitamisel jääb see liikmele Mari.")
  const paasukesed = review.locator('[data-finalize-application="Pääsukesed"]')
  await expect(paasukesed).toContainText("Liis: e-post kati@example.com on ka võistkonna „Kotkad” avalduses")
  await expect(paasukesed).toContainText("Ants: e-post vana@example.com on juba võistkonna „Olemasolev” liikmel")
  await page.screenshot({ path: testInfo.outputPath("finalize-review.png"), fullPage: true })

  // Liikmete muutmine avaneb avalduse kaardil.
  await kotkad.getByRole("button", { name: "Muuda osalejaid" }).click()
  await expect(page.getByRole("button", { name: "Salvesta osalejad" })).toBeVisible()
  await page.getByRole("button", { name: "Tühista", exact: true }).last().click()
  await expect(page.getByRole("button", { name: "Salvesta osalejad" })).toHaveCount(0)

  // Põhjuse küsimuse katkestamine ei lükka avaldust tagasi.
  page.once("dialog", (dialog) => dialog.dismiss())
  await paasukesed.getByRole("button", { name: "Lükka avaldus tagasi" }).click()
  await expect(paasukesed).toBeVisible()
  expect((await db.registrationApplication.findUniqueOrThrow({ where: { id: applications["Pääsukesed"] } })).status).toBe("CONFIRMED")

  page.once("dialog", (dialog) => dialog.accept("Topeltregistreering"))
  await paasukesed.getByRole("button", { name: "Lükka avaldus tagasi" }).click()
  await expect(review).toContainText("Leiti 1 e-posti kordus 1 avalduses")
  await expect(review.locator('[data-finalize-application="Pääsukesed"]')).toHaveCount(0)
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await review.screenshot({ path: testInfo.outputPath("finalize-review-mobile.png") })
  await page.setViewportSize({ width: 1280, height: 800 })

  await review.getByRole("button", { name: "Kinnita nii" }).click()
  await expect(page.getByText("Osalejate nimekiri kinnitatud. Loodi 2 võistkonda.")).toBeVisible()
  await expect(review).toHaveCount(0)

  const created = await db.team.findFirstOrThrow({ where: { competitionId: competition.id, name: "Kotkad" }, include: { members: { orderBy: { name: "asc" } } } })
  expect(created.members.map((member) => [member.name, member.email])).toEqual([["Jüri", null], ["Kati", "kati@example.com"], ["Mari", "ema@example.com"]])
  expect((await db.registrationApplication.findUniqueOrThrow({ where: { id: applications["Pääsukesed"] } })).status).toBe("REJECTED")
  expect(await db.team.count({ where: { competitionId: competition.id } })).toBe(3)
  expect((await db.competition.findUniqueOrThrow({ where: { id: competition.id } })).registrationFinalizedAt).not.toBeNull()
  // Kinnitatud nimekirja ei kinnitata teist korda.
  const again = await (await page.request.get(endpoint)).json()
  expect(again.blocking).toEqual(["Osalejate nimekiri on juba kinnitatud."])
})
