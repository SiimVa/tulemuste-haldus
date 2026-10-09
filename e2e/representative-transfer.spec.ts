import { createServer, type Server } from "node:http"
import { test, expect, type Page } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"
import { representativeFormFields, REPRESENTATIVE_FORM_FIELD_KEYS as keys } from "../src/lib/registrationForm"

const databaseUrl = process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/tulemuste_haldus?schema=e2e"
const parsed = new URL(databaseUrl)
if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname) || parsed.searchParams.get("schema") !== "e2e") throw new Error("Transfer tests require a local e2e schema")
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
const password = "representative-transfer-test-123"
let mailServer: Server
const emails: { to: string[]; subject: string }[] = []
test.beforeAll(async () => {
  mailServer = createServer((request, response) => {
    let raw = ""
    request.on("data", chunk => { raw += chunk })
    request.on("end", () => {
      emails.push(JSON.parse(raw))
      response.writeHead(200, { "Content-Type": "application/json" }).end('{"id":"test-email"}')
    })
  })
  await new Promise<void>(resolve => mailServer.listen(3199, "127.0.0.1", resolve))
})
test.afterAll(async () => {
  await new Promise<void>(resolve => mailServer.close(() => resolve()))
  // All browsers share the local fallback IP; isolate this suite's login traffic.
  await db.rateLimitBucket.deleteMany()
  await db.$disconnect()
})
async function login(page: Page, email: string) {
  await page.context().clearCookies()
  await page.goto("/login")
  await page.getByPlaceholder("admin@example.com").fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole("button", { name: "Logi sisse" }).click()
  await page.waitForURL("**/dashboard")
}
async function fixture() {
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const passwordHash = await bcrypt.hash(password, 10)
  const owner = await db.user.create({ data: { name: "Korraldaja", email: `owner-${stamp}@example.com`, passwordHash } })
  const original = await db.user.create({ data: { name: "Moonika Registreerija", email: `original-${stamp}@example.com`, passwordHash } })
  const next = await db.user.create({ data: { name: "Birgit Esindaja", email: `next-${stamp}@example.com`, passwordHash } })
  const competition = await db.competition.create({ data: {
    name: `Esindajavahetus ${stamp}`, organizerId: owner.id, createdById: owner.id,
    registrationOverride: "OPEN", registrationApprovalMode: "MANUAL", mandateOverride: "OPEN",
  } })
  const fields = []
  for (const field of representativeFormFields()) fields.push(await db.competitionFormField.create({ data: {
    competitionId: competition.id, key: field.key, label: field.label, type: field.type, showInRegistration: true, showInMandate: true,
    requiredInRegistration: true, requiredInMandate: true, editableInMandate: true, order: field.order,
  } }))
  const answers: Record<string, string> = { [keys.name]: original.name, [keys.email]: original.email, [keys.phone]: "50000000" }
  const application = await db.registrationApplication.create({ data: {
    competitionId: competition.id, teamName: "Tauno Tilgad", submittedById: original.id, representativeId: original.id, status: "CONFIRMED", submittedAt: new Date(),
    fieldValues: { create: fields.map(field => ({ fieldId: field.id, value: JSON.stringify(answers[field.key]) })) },
    events: { create: { actorId: original.id, fromStatus: null, toStatus: "CONFIRMED", note: "Algne registreerimine" } },
  } })
  return { owner, original, next, competition, application, answers, fields, passwordHash }
}

test("esindaja vahetus säilitab registreerija ja kajastub kaardil, mandaadis, ekspordis ning õigustes", async ({ page, browser }) => {
  const f = await fixture()
  const endpoint = `/api/competitions/${f.competition.id}`
  await login(page, f.owner.email)
  // Transfer before finalization, preserving immutable original submitter.
  const change = await page.request.post(`${endpoint}/registrations`, { data: {
    applicationId: f.application.id, teamName: f.application.teamName,
    representative: { name: "Sisestatud hüüdnimi", email: f.next.email }, answers: { ...f.answers, [keys.phone]: "51111111" },
  } })
  expect(change.status(), await change.text()).toBe(200)
  expect(await db.registrationApplication.findUniqueOrThrow({ where: { id: f.application.id } })).toMatchObject({ submittedById: f.original.id, representativeId: f.next.id })
  expect(emails.some(mail => mail.to.includes(f.next.email) && mail.subject.includes("esindajaks"))).toBe(true)

  const oldContext = await browser.newContext()
  const oldPage = await oldContext.newPage()
  await login(oldPage, f.original.email)
  await expect(oldPage.getByText(f.application.teamName, { exact: true })).toBeVisible()
  await oldPage.goto(`/dashboard/registrations/${f.application.id}`)
  await expect(oldPage.getByRole("button", { name: "Muuda", exact: true })).toHaveCount(0)
  expect((await oldPage.request.patch(`/api/registration-applications/${f.application.id}`, { data: { teamName: "Keelatud", answers: f.answers } })).status()).toBe(409)
  expect((await oldPage.request.delete(`/api/registration-applications/${f.application.id}`)).status()).toBe(409)
  const nextContext = await browser.newContext()
  const nextPage = await nextContext.newPage()
  await login(nextPage, f.next.email)
  await expect(nextPage.getByText(f.application.teamName, { exact: true })).toBeVisible()
  await nextPage.goto(`/dashboard/registrations/${f.application.id}`)
  await expect(nextPage.getByLabel("Esindaja nimi", { exact: false })).toHaveValue(f.next.name)

  await db.competition.update({ where: { id: f.competition.id }, data: { registrationOverride: "CLOSED" } })
  const finalize = await page.request.post(`${endpoint}/registration-applications/finalize`)
  expect(finalize.status(), await finalize.text()).toBe(200)
  const linked = await db.registrationApplication.findUniqueOrThrow({ where: { id: f.application.id } })
  const teamId = linked.teamId!
  expect((await nextPage.request.get(`/api/representative/teams/${teamId}`)).status()).toBe(200)
  expect((await oldPage.request.get(`/api/representative/teams/${teamId}`)).status()).toBe(403)

  // Reproduce the screenshot: historical application still says Moonika,
  // but every current representative display must show Birgit.
  await db.registrationApplicationFieldValue.updateMany({ where: { applicationId: f.application.id, fieldId: f.fields[0].id }, data: { value: JSON.stringify(f.original.name) } })
  await db.registrationApplicationFieldValue.updateMany({ where: { applicationId: f.application.id, fieldId: f.fields[1].id }, data: { value: JSON.stringify(f.original.email) } })
  await page.goto(`/dashboard/competitions/${f.competition.id}/registrations`)
  const card = page.locator(`#application-${f.application.id}`)
  await expect(card.getByText(`Praegune esindaja: ${f.next.name}`, { exact: false })).toBeVisible()
  await expect(card.locator("dd").filter({ hasText: f.next.email })).toBeVisible()
  await expect(card.getByText(`Registreeris: ${f.original.name}`)).toBeVisible()
  await card.getByRole("button", { name: "Muuda võistkonda" }).click()
  await expect(page.getByRole("form", { name: "Võistkonna andmete muutmine" }).getByText(`Praegune esindaja: ${f.next.name} · ${f.next.email}`)).toBeVisible()
  for (const phase of ["REGISTRATION", "MANDATE"]) {
    const report = await (await page.request.get(`${endpoint}/registration-overview?phase=${phase}`)).json()
    expect(report.rows[0].cells).toMatchObject({ representative: f.next.name, email: f.next.email, phone: "51111111" })
  }
  const exportResponse = await page.request.get(`${endpoint}/registrations/export?format=csv&phase=REGISTRATION`)
  expect(exportResponse.status()).toBe(200)
  expect(await exportResponse.text()).toContain(f.next.email)

  // An outstanding invitation cannot reclaim a team after a newer assignment.
  const invitedEmail = `invited-${Date.now()}@example.com`
  const invitationResponse = await page.request.post(`${endpoint}/role-invitations`, { data: { email: invitedEmail, roles: ["REPRESENTATIVE"], teamIds: [teamId], elementIds: [] } })
  expect(invitationResponse.status(), await invitationResponse.text()).toBe(201)
  const invitation = await invitationResponse.json()
  const assign = await page.request.post(`${endpoint}/representatives`, { data: { email: f.next.email, teamIds: [teamId] } })
  expect(assign.status(), await assign.text()).toBe(200)
  const token = invitation.invitationUrl.split("/").at(-1)
  await db.user.create({ data: { email: invitedEmail, name: "Vana kutse saaja", passwordHash: f.passwordHash } })
  const invitedContext = await browser.newContext()
  const invitedPage = await invitedContext.newPage()
  await login(invitedPage, invitedEmail)
  expect((await invitedPage.request.post(`/api/invitations/${token}/accept`)).status()).toBe(410)
  await invitedContext.close()

  // Access-page transfer clears the former representative's phone everywhere.
  const transfer = await page.request.post(`${endpoint}/representatives`, { data: { email: f.original.email, teamIds: [teamId] } })
  expect(transfer.status(), await transfer.text()).toBe(200)
  const team = await (await oldPage.request.get(`/api/representative/teams/${teamId}`)).json()
  expect(team.formValues).toMatchObject({ [keys.name]: f.original.name, [keys.email]: f.original.email, [keys.phone]: "" })
  expect((await nextPage.request.get(`/api/representative/teams/${teamId}`)).status()).toBe(403)
  const stale = await page.request.post(`${endpoint}/registrations`, { data: {
    teamId, teamName: "Vana vorm", expectedRepresentativeEmail: f.next.email,
    answers: { [keys.name]: f.next.name, [keys.email]: f.next.email, [keys.phone]: "51111111" },
  } })
  expect(stale.status(), await stale.text()).toBe(409)
  for (const phase of ["REGISTRATION", "MANDATE"]) {
    const report = await (await page.request.get(`${endpoint}/registration-overview?phase=${phase}`)).json()
    expect(report.rows[0].cells).toMatchObject({ representative: f.original.name, email: f.original.email, phone: "" })
  }
  expect((await db.registrationApplication.findUniqueOrThrow({ where: { id: f.application.id } })).submittedById).toBe(f.original.id)
  await oldContext.close()
  await nextContext.close()
})

test("kontota esindaja seotakse enne ja pärast nimekirja kinnitamist algset registreerijat muutmata", async ({ page, browser }) => {
  for (const finalizeBeforeLogin of [false, true]) {
    const f = await fixture()
    const endpoint = `/api/competitions/${f.competition.id}`
    const email = `pending-${Date.now()}-${finalizeBeforeLogin}@example.com`
    await login(page, f.owner.email)
    const change = await page.request.post(`${endpoint}/registrations`, { data: {
      applicationId: f.application.id, teamName: f.application.teamName,
      representative: { name: "Kontota Esindaja", email }, answers: { ...f.answers, [keys.phone]: "52222222" },
    } })
    expect(change.status(), await change.text()).toBe(200)
    expect(emails.some(mail => mail.to.includes(email))).toBe(true)
    expect(await db.registrationApplication.findUniqueOrThrow({ where: { id: f.application.id } })).toMatchObject({ submittedById: f.original.id, pendingRepresentativeEmail: email, representativeId: null })
    let pendingInvitationUrl: string | undefined
    if (finalizeBeforeLogin) {
      await db.competition.update({ where: { id: f.competition.id }, data: { registrationOverride: "CLOSED" } })
      const finalized = await page.request.post(`${endpoint}/registration-applications/finalize`)
      expect(finalized.status(), await finalized.text()).toBe(200)
      const linked = await db.registrationApplication.findUniqueOrThrow({ where: { id: f.application.id } })
      const invited = await page.request.post(`${endpoint}/role-invitations`, { data: { email, roles: ["REPRESENTATIVE"], teamIds: [linked.teamId], elementIds: [] } })
      expect(invited.status(), await invited.text()).toBe(201)
      pendingInvitationUrl = (await invited.json()).invitationUrl
    }
    const user = await db.user.create({ data: { email, name: "Konto tegelik nimi", passwordHash: f.passwordHash } })
    const context = await browser.newContext()
    const pendingPage = await context.newPage()
    await login(pendingPage, email)
    if (pendingInvitationUrl) {
      const accepted = await pendingPage.request.post(`/api/invitations/${pendingInvitationUrl.split("/").at(-1)}/accept`)
      expect(accepted.status(), await accepted.text()).toBe(200)
    }
    const application = await db.registrationApplication.findUniqueOrThrow({ where: { id: f.application.id } })
    expect(application).toMatchObject({ submittedById: f.original.id, representativeId: user.id, pendingRepresentativeEmail: null })
    if (application.teamId) {
      const current = await (await pendingPage.request.get(`/api/representative/teams/${application.teamId}`)).json()
      expect(current.formValues).toMatchObject({ [keys.name]: user.name, [keys.email]: email, [keys.phone]: "52222222" })
    }
    const report = await (await page.request.get(`${endpoint}/registration-overview?phase=REGISTRATION`)).json()
    expect(report.rows[0].cells).toMatchObject({ representative: user.name, email, phone: "52222222" })
    await context.close()
  }
})

test("mandaadis ootel määrangut saab asendada ja eemaldada; vana konto ega kutse ei taasta õigusi", async ({ page, browser }) => {
  const f = await fixture()
  const endpoint = `/api/competitions/${f.competition.id}`
  await login(page, f.owner.email)
  await db.competition.update({ where: { id: f.competition.id }, data: { registrationOverride: "CLOSED" } })
  expect((await page.request.post(`${endpoint}/registration-applications/finalize`)).status()).toBe(200)
  const { teamId } = await db.registrationApplication.findUniqueOrThrow({ where: { id: f.application.id } })
  const pendingEmail = `superseded-${Date.now()}@example.com`
  const pending = await page.request.post(`${endpoint}/registrations`, { data: {
    teamId, teamName: f.application.teamName, representative: { name: "Ootel", email: pendingEmail },
    answers: { ...f.answers, [keys.phone]: "53333333" },
  } })
  expect(pending.status(), await pending.text()).toBe(200)
  expect(await db.teamRepresentative.findUnique({ where: { teamId: teamId! } })).toBeNull()
  const otherTeam = await db.team.create({ data: { competitionId: f.competition.id, name: "Teine võistkond", code: "OTHER" } })
  const invite = await page.request.post(`${endpoint}/role-invitations`, { data: { email: pendingEmail, roles: ["REPRESENTATIVE"], teamIds: [teamId, otherTeam.id], elementIds: [] } })
  expect(invite.status()).toBe(201)
  const invitation = await invite.json()
  // General role management uses exactly the same transfer implementation.
  const assigned = await page.request.put(`${endpoint}/roles`, { data: { email: f.next.email, roles: ["REPRESENTATIVE"], teamIds: [teamId], elementIds: [] } })
  expect(assigned.status(), await assigned.text()).toBe(200)
  const storedInvite = await db.competitionRoleInvitation.findUniqueOrThrow({ where: { id: invitation.invitation.id } })
  expect(JSON.parse(storedInvite.teamIds)).toEqual([otherTeam.id])
  expect(storedInvite.revokedAt).toBeNull()
  const previousPending = await db.user.create({ data: { email: pendingEmail, name: "Hiljem loodud konto", passwordHash: f.passwordHash } })
  const context = await browser.newContext()
  const pendingPage = await context.newPage()
  await login(pendingPage, previousPending.email)
  expect((await pendingPage.request.get(`/api/representative/teams/${teamId}`)).status()).toBe(403)
  const accepted = await pendingPage.request.post(`/api/invitations/${invitation.invitationUrl.split("/").at(-1)}/accept`)
  expect(accepted.status(), await accepted.text()).toBe(200)
  expect((await pendingPage.request.get(`/api/representative/teams/${otherTeam.id}`)).status()).toBe(200)
  expect((await pendingPage.request.get(`/api/representative/teams/${teamId}`)).status()).toBe(403)
  expect((await page.request.delete(`${endpoint}/representatives`, { data: { teamId } })).status()).toBe(200)
  for (const phase of ["REGISTRATION", "MANDATE"]) {
    const report = await (await page.request.get(`${endpoint}/registration-overview?phase=${phase}`)).json()
    const row = report.rows.find((row: { cells: { name: string } }) => row.cells.name === f.application.teamName)
    expect(row.cells).toMatchObject({ representative: "", email: "", phone: "" })
  }
  await page.goto(`/dashboard/competitions/${f.competition.id}/messages`)
  await expect(page.getByText(f.next.email, { exact: true })).toHaveCount(0)
  expect((await db.registrationApplication.findUniqueOrThrow({ where: { id: f.application.id } })).submittedById).toBe(f.original.id)
  await context.close()
})

test("migratsioon taastab loomissündmusest registreerija ja säilitab praeguse esindaja", async () => {
  const { readFile } = await import("node:fs/promises")
  const sql = await readFile("prisma/migrations/20261009120000_representative_identity/migration.sql", "utf8")
  await db.$transaction(async tx => {
    await tx.$executeRawUnsafe('CREATE SCHEMA representative_migration_test')
    await tx.$executeRawUnsafe('SET LOCAL search_path TO representative_migration_test')
    for (const statement of [
      'CREATE TABLE "User" (id TEXT PRIMARY KEY)',
      'CREATE TABLE "RegistrationApplication" (id TEXT PRIMARY KEY, "submittedById" TEXT, "teamId" TEXT, "pendingRepresentativeEmail" TEXT, "pendingRepresentativeName" TEXT)',
      'CREATE TABLE "RegistrationApplicationEvent" (id TEXT PRIMARY KEY, "applicationId" TEXT, "actorId" TEXT, "fromStatus" TEXT, "createdAt" TIMESTAMP)',
      'CREATE TABLE "Team" (id TEXT PRIMARY KEY, "pendingRepresentativeEmail" TEXT, "pendingRepresentativeName" TEXT)',
      'CREATE TABLE "TeamRepresentative" ("teamId" TEXT, "memberId" TEXT)',
      'CREATE TABLE "CompetitionMember" (id TEXT, "userId" TEXT)',
      'CREATE TABLE "Notification" ("userId" TEXT NOT NULL)',
      `INSERT INTO "User" VALUES ('a'), ('b'), ('organizer')`,
      `INSERT INTO "RegistrationApplication" VALUES ('before', 'b', NULL, NULL, NULL), ('pending', 'organizer', NULL, 'pending@example.com', 'Ootel'), ('linked', 'a', 'team', NULL, NULL), ('unknown', 'b', NULL, NULL, NULL)`,
      `INSERT INTO "RegistrationApplicationEvent" VALUES ('e1', 'before', 'a', NULL, NOW()), ('e2', 'pending', 'a', NULL, NOW())`,
      `INSERT INTO "Team" VALUES ('team', NULL, NULL)`,
      `INSERT INTO "TeamRepresentative" VALUES ('team', 'member')`,
      `INSERT INTO "CompetitionMember" VALUES ('member', 'b')`,
    ]) await tx.$executeRawUnsafe(statement)
    for (const statement of sql.split(";").map(part => part.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement)
    const applications = await tx.$queryRawUnsafe<{ id: string; submittedById: string; representativeId: string | null }[]>('SELECT id, "submittedById", "representativeId" FROM "RegistrationApplication" ORDER BY id')
    expect(applications).toEqual([
      { id: "before", submittedById: "a", representativeId: "b" },
      { id: "linked", submittedById: "a", representativeId: "b" },
      { id: "pending", submittedById: "a", representativeId: null },
      { id: "unknown", submittedById: "b", representativeId: "b" },
    ])
    await tx.$executeRawUnsafe('DROP SCHEMA representative_migration_test CASCADE')
  })
})
