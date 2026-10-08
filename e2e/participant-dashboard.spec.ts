import { test, expect, type Page } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const databaseUrl = process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/tulemuste_haldus?schema=e2e"
const parsed = new URL(databaseUrl)
if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname) || parsed.searchParams.get("schema") !== "e2e") {
  throw new Error("Participant dashboard tests require a local e2e schema")
}
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
const password = "participant-dashboard-test-password"

test.afterAll(() => db.$disconnect())

async function login(page: Page, email: string) {
  await page.goto("/login")
  await page.getByPlaceholder("admin@example.com").fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole("button", { name: "Logi sisse" }).click()
  await page.waitForURL("**/dashboard")
}

test("registered teams stay visible through confirmation, mandate finalization and the start of the competition", async ({ page }, testInfo) => {
  const passwordHash = await bcrypt.hash(password, 10)
  const owner = await db.user.create({ data: { name: "Töölaua korraldaja", email: `dashboard-owner-${Date.now()}@example.com`, passwordHash } })
  const representative = await db.user.create({ data: { name: "Töölaua esindaja", email: `dashboard-representative-${Date.now()}@example.com`, passwordHash } })
  const competition = await db.competition.create({ data: {
    name: "Võistkonna teekonna võistlus", createdById: owner.id, organizerId: owner.id,
    registrationOverride: "OPEN", registrationApprovalMode: "MANUAL", mandateOverride: "AUTO",
  } })
  const membership = await db.competitionMember.create({ data: {
    competitionId: competition.id, userId: representative.id, roles: { create: { role: "REPRESENTATIVE" } },
  } })
  const teamName = "Alati nähtav võistkond"
  const application = await db.registrationApplication.create({ data: {
    competitionId: competition.id, submittedById: representative.id, teamName,
    status: "PENDING_REVIEW", submittedAt: new Date(),
  } })

  await login(page, representative.email)
  await expect(page.getByRole("tab", { name: /^Minu võistkonnad/ })).toHaveAttribute("aria-selected", "true")
  const registrations = page.getByRole("region", { name: "Minu registreerimised", exact: true })
  const registrationCard = registrations.getByRole("link").filter({ hasText: teamName })
  await expect(registrationCard).toHaveCount(1)
  await expect(registrationCard).toContainText("Registreeritud")
  await expect(registrationCard).toHaveAttribute("href", `/dashboard/registrations/${application.id}`)

  await db.registrationApplication.update({ where: { id: application.id }, data: { status: "CHANGES_REQUESTED", allocationReason: "Lisa puuduv kontakt" } })
  await page.reload()
  await expect(registrationCard).toContainText("Vajab täiendamist")
  await expect(registrationCard).toContainText("Lisa puuduv kontakt")

  await db.registrationApplication.update({ where: { id: application.id }, data: { status: "CONFIRMED", allocationReason: null, decidedAt: new Date() } })
  await page.reload()
  await expect(registrationCard).toContainText("Registreerimine kinnitatud")

  const team = await db.team.create({ data: {
    competitionId: competition.id, name: teamName, code: "REG-001", registrationStatus: "APPROVED",
    representative: { create: { memberId: membership.id } },
  } })
  await db.registrationApplication.update({ where: { id: application.id }, data: { teamId: team.id } })
  await db.competition.update({ where: { id: competition.id }, data: { registrationOverride: "CLOSED", registrationFinalizedAt: new Date() } })
  await page.reload()

  // Finalizing registration must not create a gap before mandate opens, or duplicate the linked application and team.
  await expect(registrationCard).toHaveCount(1)
  await expect(registrationCard).toContainText("Registreerimine kinnitatud")
  await expect(page.getByRole("heading", { name: teamName, exact: true })).toHaveCount(1)
  await expect(page.getByRole("region", { name: "Mandaadid", exact: true })).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath("registration-confirmed-before-mandate.png"), fullPage: true })

  await db.competition.update({ where: { id: competition.id }, data: { mandateOverride: "OPEN" } })
  await page.reload()
  const mandates = page.getByRole("region", { name: "Mandaadid", exact: true })
  const mandateCard = mandates.getByRole("link").filter({ hasText: teamName })
  await expect(mandateCard).toHaveCount(1)
  await expect(mandateCard).toContainText("Ootab mandaadi esitamist")
  await expect(mandateCard).toHaveAttribute("href", `/dashboard/representative/teams/${team.id}#mandate`)
  await expect(registrationCard).toHaveCount(0)

  for (const [status, label] of [
    ["SUBMITTED", "Mandaat esitatud"],
    ["CHANGES_REQUESTED", "Vajab täiendamist"],
    ["APPROVED", "Mandaat kinnitatud"],
  ]) {
    await db.team.update({ where: { id: team.id }, data: { mandateStatus: status } })
    await page.reload()
    await expect(mandateCard).toContainText(label)
    await expect(page.getByRole("heading", { name: teamName, exact: true })).toHaveCount(1)
  }

  await db.competition.update({ where: { id: competition.id }, data: { mandateOverride: "CLOSED", mandateFinalizedAt: new Date() } })
  await page.reload()
  await expect(mandateCard).toHaveCount(1)
  await expect(mandateCard).toContainText("Mandaat kinnitatud")
  await page.screenshot({ path: testInfo.outputPath("mandate-confirmed-before-start.png"), fullPage: true })

  await db.competition.update({ where: { id: competition.id }, data: { status: "ACTIVE" } })
  await page.reload()
  const ongoing = page.getByRole("region", { name: "Käimasolevad võistlused", exact: true })
  const activeCard = ongoing.locator("article").filter({ hasText: teamName })
  await expect(activeCard).toHaveCount(1)
  await expect(activeCard.getByRole("link", { name: "Vaata tulemusi" })).toHaveAttribute("href", `/dashboard/teams/${team.id}/results`)
  await expect(mandateCard).toHaveCount(0)
  await expect(page.getByRole("heading", { name: teamName, exact: true })).toHaveCount(1)
  await page.screenshot({ path: testInfo.outputPath("participant-dashboard-desktop.png"), fullPage: true })

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(activeCard.getByRole("link", { name: "Vaata tulemusi" })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath("participant-dashboard-mobile.png"), fullPage: true })
})

test("dashboard views, phase filters and search make personal teams easy to find", async ({ page }, testInfo) => {
  const passwordHash = await bcrypt.hash(password, 10)
  const owner = await db.user.create({ data: { name: "Navigeerimise korraldaja", email: `navigation-owner-${Date.now()}@example.com`, passwordHash } })
  const representative = await db.user.create({ data: { name: "Mitme rolliga kasutaja", email: `navigation-representative-${Date.now()}@example.com`, passwordHash } })
  const registering = await db.competition.create({ data: {
    name: "Registreerimise retk", createdById: owner.id, organizerId: owner.id, registrationOverride: "OPEN",
    isPublic: true, registrationAccessMode: "PUBLIC",
  } })
  await db.registrationApplication.create({ data: {
    competitionId: registering.id, submittedById: representative.id, teamName: "Registreerimise kotkad", status: "PENDING_REVIEW", submittedAt: new Date(),
  } })
  const mandateCompetition = await db.competition.create({ data: {
    name: "Mandaadi retk", createdById: owner.id, organizerId: owner.id,
    registrationFinalizedAt: new Date(), mandateOverride: "OPEN",
  } })
  const mandateMembership = await db.competitionMember.create({ data: {
    competitionId: mandateCompetition.id, userId: representative.id,
    roles: { create: [{ role: "REPRESENTATIVE" }, { role: "JUDGE" }, { role: "ORGANIZER" }] },
  } })
  await db.team.create({ data: {
    competitionId: mandateCompetition.id, name: "Mandaadi hundid", code: "REG-001", registrationStatus: "APPROVED", mandateStatus: "CHANGES_REQUESTED",
    representative: { create: { memberId: mandateMembership.id } },
  } })
  const element = await db.scoringElement.create({ data: { competitionId: mandateCompetition.id, name: "Töölaua kontrollpunkt", code: "KP1" } })
  await db.judgeElementAssignment.create({ data: { competitionId: mandateCompetition.id, memberId: mandateMembership.id, elementId: element.id } })
  const activeCompetition = await db.competition.create({ data: { name: "Käimasolev retk", createdById: owner.id, organizerId: owner.id, status: "ACTIVE" } })
  await db.team.create({ data: {
    competitionId: activeCompetition.id, name: "Võistleja rebased", code: "12", registrationStatus: "APPROVED", mandateStatus: "APPROVED",
    members: { create: { userId: representative.id, name: representative.name } },
  } })

  await login(page, representative.email)
  const navigation = page.getByRole("tablist", { name: "Töölaua vaated" })
  await expect(navigation.getByRole("tab", { name: /^Minu võistkonnad/ })).toHaveAttribute("aria-selected", "true")
  await expect(page.getByRole("heading", { name: "Registreerimise kotkad", exact: true })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Mandaadi hundid", exact: true })).toBeVisible()
  await expect(page.getByRole("heading", { name: "12 · Võistleja rebased", exact: true })).toBeVisible()

  await page.getByRole("button", { name: /^Registreerimised\b/ }).click()
  await expect(page.getByRole("heading", { name: "Registreerimise kotkad", exact: true })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Mandaadi hundid", exact: true })).toHaveCount(0)
  await page.getByRole("button", { name: /^Mandaadid\b/ }).click()
  await expect(page.getByRole("heading", { name: "Mandaadi hundid", exact: true })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Registreerimise kotkad", exact: true })).toHaveCount(0)
  await page.getByRole("button", { name: /^Käimasolevad\b/ }).click()
  await expect(page.getByRole("heading", { name: "12 · Võistleja rebased", exact: true })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Mandaadi hundid", exact: true })).toHaveCount(0)
  await page.getByRole("button", { name: /^Kõik\b/ }).click()

  const search = page.getByRole("searchbox", { name: "Otsi minu võistkondi" })
  await search.fill("hundid")
  await expect(page.getByRole("heading", { name: "Mandaadi hundid", exact: true })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Registreerimise kotkad", exact: true })).toHaveCount(0)
  await search.fill("Registreerimise retk")
  await expect(page.getByRole("heading", { name: "Registreerimise kotkad", exact: true })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Mandaadi hundid", exact: true })).toHaveCount(0)
  await search.fill("")

  const attentionFilter = page.getByRole("button", { name: /^Vajab minu tegevust/ })
  await attentionFilter.click()
  await expect(attentionFilter).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByRole("heading", { name: "Mandaadi hundid", exact: true })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Registreerimise kotkad", exact: true })).toHaveCount(0)
  await expect(page.getByRole("heading", { name: "12 · Võistleja rebased", exact: true })).toHaveCount(0)
  await attentionFilter.click()

  await navigation.getByRole("tab", { name: /^Hindamine/ }).click()
  await expect(page.getByRole("heading", { name: "Minu hindamispunktid", exact: true })).toBeVisible()
  await expect(page.getByRole("link", { name: /Töölaua kontrollpunkt/ })).toHaveAttribute("href", `/dashboard/judge/${mandateCompetition.id}`)
  await expect(page.getByRole("heading", { name: "Mandaadi hundid", exact: true })).toHaveCount(0)
  await navigation.getByRole("tab", { name: /^Võistluste haldamine/ }).click()
  await expect(page.getByRole("link", { name: /Mandaadi retk/ })).toHaveAttribute("href", `/dashboard/competitions/${mandateCompetition.id}`)
  await navigation.getByRole("tab", { name: /^Leia võistlus/ }).click()
  await expect(page.getByRole("link", { name: /Registreerimise retk/ })).toHaveAttribute("href", `/competitions/${registering.id}`)
  await navigation.getByRole("tab", { name: /^Minu võistkonnad/ }).click()
  await expect(page.getByRole("heading", { name: "Mandaadi hundid", exact: true })).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath("dashboard-navigation-mobile.png"), fullPage: true })
})

test("submitters retain their application link while member and closed-mandate cards avoid unavailable actions", async ({ page }) => {
  const passwordHash = await bcrypt.hash(password, 10)
  const owner = await db.user.create({ data: { name: "Ligipääsu korraldaja", email: `dashboard-access-owner-${Date.now()}@example.com`, passwordHash } })
  const user = await db.user.create({ data: { name: "Registreerija ja võistleja", email: `dashboard-access-user-${Date.now()}@example.com`, passwordHash } })
  const representative = await db.user.create({ data: { name: "Uus esindaja", email: `dashboard-access-representative-${Date.now()}@example.com`, passwordHash } })
  const competition = await db.competition.create({ data: {
    name: "Vahetunud esindajaga retk", createdById: owner.id, organizerId: owner.id,
    registrationFinalizedAt: new Date(), mandateOverride: "OPEN",
  } })
  const membership = await db.competitionMember.create({ data: {
    competitionId: competition.id, userId: representative.id, roles: { create: { role: "REPRESENTATIVE" } },
  } })
  const team = await db.team.create({ data: {
    competitionId: competition.id, name: "Võistkonna uus nimi", code: "REG-001", registrationStatus: "APPROVED",
    representative: { create: { memberId: membership.id } },
    members: { create: { userId: user.id, name: user.name } },
  } })
  const application = await db.registrationApplication.create({ data: {
    competitionId: competition.id, submittedById: user.id, teamId: team.id, teamName: "Võistkonna registreerimisaegne nimi", status: "CONFIRMED",
  } })
  const memberCompetition = await db.competition.create({ data: {
    name: "Ainult võistleja retk", createdById: owner.id, organizerId: owner.id,
    registrationFinalizedAt: new Date(), mandateOverride: "OPEN",
  } })
  await db.team.create({ data: {
    competitionId: memberCompetition.id, name: "Ainult liikme võistkond", code: "REG-001", registrationStatus: "APPROVED",
    members: { create: { userId: user.id, name: user.name } },
  } })
  const closedCompetition = await db.competition.create({ data: {
    name: "Suletud mandaadiga retk", createdById: owner.id, organizerId: owner.id,
    registrationFinalizedAt: new Date(), mandateOverride: "CLOSED",
  } })
  const closedMembership = await db.competitionMember.create({ data: {
    competitionId: closedCompetition.id, userId: user.id, roles: { create: { role: "REPRESENTATIVE" } },
  } })
  const closedTeam = await db.team.create({ data: {
    competitionId: closedCompetition.id, name: "Suletud mandaadi võistkond", code: "REG-001", registrationStatus: "APPROVED",
    representative: { create: { memberId: closedMembership.id } },
  } })
  await db.registrationApplication.create({ data: {
    competitionId: closedCompetition.id, submittedById: user.id, teamId: closedTeam.id, teamName: closedTeam.name, status: "CONFIRMED",
  } })
  const activeCompetition = await db.competition.create({ data: { name: "Kinnitamata osalejate retk", createdById: owner.id, organizerId: owner.id, status: "ACTIVE" } })
  await db.team.create({ data: {
    competitionId: activeCompetition.id, name: "Kinnitamata võistkond", code: "REG-001", registrationStatus: "SUBMITTED",
    members: { create: { userId: user.id, name: user.name } },
  } })

  await login(page, user.email)
  const mandates = page.getByRole("region", { name: "Mandaadid", exact: true })
  const ownApplicationCard = mandates.getByRole("link").filter({ hasText: team.name })
  const memberCard = mandates.locator("article").filter({ hasText: "Ainult liikme võistkond" })
  const closedCard = mandates.getByRole("link").filter({ hasText: closedTeam.name })
  const attentionFilter = page.getByRole("button", { name: /^Vajab minu tegevust/ })
  await expect(ownApplicationCard).toHaveCount(1)
  await expect(ownApplicationCard).toHaveAttribute("href", `/dashboard/registrations/${application.id}`)
  await expect(ownApplicationCard).toContainText("Andmeid haldab sinu võistkonna esindaja")
  await expect(page.getByRole("heading", { name: application.teamName, exact: true })).toHaveCount(0)
  await expect(page.locator(`a[href^="/dashboard/representative/teams/${team.id}"]`)).toHaveCount(0)
  await expect(memberCard).toHaveCount(1)
  await expect(memberCard.getByRole("link")).toHaveCount(0)
  await expect(closedCard).toContainText("Ootab mandaadi esitamist")
  await expect(closedCard).toContainText("Mandaadi esitamine on suletud")
  await expect(closedCard).toContainText("Vaata mandaati")
  await expect(closedCard).not.toContainText("Täida mandaat")
  await expect(attentionFilter).toHaveCount(0)
  await expect(page.getByRole("heading", { name: "Kinnitamata võistkond", exact: true })).toHaveCount(0)

  await ownApplicationCard.click()
  await expect(page).toHaveURL(new RegExp(`/dashboard/registrations/${application.id}$`))
  await expect(page.getByText(/Registreerimisetapp on lõppenud/)).toBeVisible()
  await expect(page.getByRole("form")).toHaveCount(0)
  await page.goto("/dashboard")

  await db.competition.update({ where: { id: closedCompetition.id }, data: { mandateOverride: "OPEN" } })
  await page.reload()
  await expect(attentionFilter).toHaveText("Vajab minu tegevust (1)")
  await attentionFilter.click()
  await expect(closedCard).toContainText("Täida mandaat")
  await expect(ownApplicationCard).toHaveCount(0)
  await expect(memberCard).toHaveCount(0)
})
