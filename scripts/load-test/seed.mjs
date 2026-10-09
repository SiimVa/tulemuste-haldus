#!/usr/bin/env node

import { randomBytes } from "node:crypto"
import { open, unlink } from "node:fs/promises"
import { pathToFileURL } from "node:url"
import { FixtureError, readConfiguration } from "./fixture-guards.mjs"

const defaultTeamCount = 100
const elementCount = 20
const maxValue = 30
const organizerCount = 10
const supportedTeamCounts = new Set([100, 150, 200])

export function prepareFixture(baseUrl, { teamCount = defaultTeamCount } = {}) {
  if (!supportedTeamCounts.has(teamCount)) throw new FixtureError("Team count must be 100, 150, or 200.")
  const now = new Date()
  const runId = `loadtest-${now.toISOString().replace(/[-:.TZ]/g, "")}-${randomBytes(4).toString("hex")}`
  // Match normal CUID-shaped IDs so security audit target validation records
  // the synthetic competition, element, and team just like ordinary traffic.
  const id = () => `c${randomBytes(12).toString("hex")}`
  const competitionId = id("competition")
  const ownerId = id("owner")
  const classes = ["Noored", "Naised", "Mehed", "Segavõistkonnad"]
  const teams = Array.from({ length: teamCount }, (_, index) => ({
    id: id("team"),
    competitionId,
    code: String(index + 1).padStart(3, "0"),
    name: `Koormustesti võistkond ${String(index + 1).padStart(3, "0")}`,
    class: classes[index % classes.length],
    registrationStatus: "APPROVED",
    mandateStatus: "APPROVED",
  }))
  const elements = []
  const fields = []
  const methods = []
  const exceptions = []
  const tokens = []
  const results = []
  const scores = []

  for (let index = 0; index < elementCount; index++) {
    const elementId = id("element")
    const tokenId = id("judge")
    const code = `KP${String(index + 1).padStart(2, "0")}`
    elements.push({
      id: elementId, competitionId, code,
      name: `Koormustesti kontrollpunkt ${index + 1}`,
      type: "CHECKPOINT", order: index + 1, maxValue,
    })
    fields.push(
      {
        id: id("field"), elementId, name: "hits", label: "Tabamused", type: "NUMBER", order: 0,
        isResultField: true, rankingPriority: 1, meta: JSON.stringify({ higherIsBetter: true }),
        validation: JSON.stringify({ required: true, integer: true, min: 0, max: 100 }),
      },
      {
        id: id("field"), elementId, name: "time_seconds", label: "Aeg sekundites", type: "NUMBER", order: 1,
        rankingPriority: 2, meta: JSON.stringify({ higherIsBetter: false }),
        validation: JSON.stringify({ required: true, min: 1, max: 86400 }),
      }
    )
    methods.push({
      id: id("method"), elementId, type: "RELATIVE_RANKING",
      params: JSON.stringify({ higherIsBetter: true, minPoints: 0 }),
    })
    exceptions.push(
      { id: id("exception"), elementId, label: "Ei läbinud", penalty: 40, order: 0, kind: "NOT_PASSED" },
      { id: id("exception"), elementId, label: "Läbis, ei sooritanud", penalty: 35, order: 1, kind: "PASSED_NOT_DONE" },
      { id: id("exception"), elementId, label: "Kriteerium täitmata", penalty: 30, order: 2, kind: "FAILED" }
    )
    tokens.push({
      id: tokenId, competitionId, elementId,
      token: randomBytes(32).toString("base64url"), type: "JUDGE", name: `Koormustesti kohtunik ${code}`,
    })

    const performances = teams.map((team, teamIndex) => ({
      teamId: team.id,
      hits: (teamIndex * 37 + index * 13) % 101,
      time_seconds: 120 + ((teamIndex * 17 + index * 11) % 100) * 3,
    }))
    // The application's relative ranking is hits descending, then time
    // ascending, with penalty = round3((rank - 1) * 30 / (teamCount - 1)).
    const ordered = [...performances].sort((a, b) => b.hits - a.hits || a.time_seconds - b.time_seconds)
    ordered.forEach((performance, rankIndex) => scores.push({
      id: id("score"), elementId, teamId: performance.teamId,
      penaltyPoints: Math.round(rankIndex * maxValue / (teamCount - 1) * 1000) / 1000,
    }))
    performances.forEach(({ teamId, hits, time_seconds }) => results.push({
      id: id("result"), elementId, teamId, enteredByTokenId: tokenId,
      values: JSON.stringify({ hits: String(hits), time_seconds: String(time_seconds) }),
    }))
  }

  const competition = {
    id: competitionId, name: `KOORMUSTEST — ${runId}`, createdById: ownerId,
    organizerId: ownerId, date: now, status: "ACTIVE", isPublic: true,
    registrationAccessMode: "PRIVATE", analysisAccessMode: "PUBLIC", scoringMode: "PENALTY",
    registrationOverride: "CLOSED", mandateOverride: "CLOSED",
    defaultKPMaxValue: maxValue, athletePointsMode: "EXACT",
    athleteShowTotal: true, athleteShowRank: true,
  }
  const manifest = {
    schemaVersion: 1, environment: "load-test", runId, writtenAt: now.toISOString(), baseUrl,
    competition: {
      id: competitionId, name: competition.name, status: "ACTIVE", isPublic: true,
      scoringMode: "PENALTY", teamCount, elementCount,
      initialResultCount: results.length, initialComputedScoreCount: scores.length,
    },
    routes: {
      publicPage: `/public/${competitionId}/leaderboard`,
      overviewPage: `/public/${competitionId}/dashboard`,
      leaderboardApi: `/api/competitions/${competitionId}/leaderboard`,
    },
    teams: teams.map(({ id, code, name, class: teamClass }) => ({ id, code, name, class: teamClass })),
    judges: tokens.map((token, index) => ({
      index, tokenId: token.id, elementId: token.elementId, elementCode: elements[index].code, token: token.token,
      judgePath: `/judge/${token.token}`, resultsPath: `/api/elements/${token.elementId}/results`,
      fieldNames: ["hits", "time_seconds"], validValues: { hits: "7", time_seconds: "180" },
      inputSchema: [
        { name: "hits", type: "NUMBER", required: true, integer: true, min: 0, max: 100 },
        { name: "time_seconds", type: "NUMBER", required: true, integer: false, min: 1, max: 86400 },
      ],
      scoring: { type: "RELATIVE_RANKING", maxValue, minPoints: 0, ranking: ["hits DESC", "time_seconds ASC"] },
    })),
  }
  return { ownerId, competition, teams, elements, fields, methods, exceptions, tokens, results, scores, manifest }
}

export function prepareEventFixture(baseUrl, { competitionCount = 4, teamCount = defaultTeamCount } = {}) {
  if (competitionCount !== 4) throw new FixtureError("The event-set fixture requires exactly four competitions.")
  if (!supportedTeamCounts.has(teamCount)) throw new FixtureError("Team count must be 100, 150, or 200.")
  const now = new Date()
  const runId = `loadtest-events-${now.toISOString().replace(/[-:.TZ]/g, "")}-${randomBytes(4).toString("hex")}`
  const competitions = Array.from({ length: competitionCount }, (_, competitionIndex) => {
    const fixture = prepareFixture(baseUrl, { teamCount })
    fixture.competition.name = `KOORMUSTEST ${competitionIndex + 1}/4 — ${runId}`
    fixture.manifest.runId = runId
    fixture.manifest.writtenAt = now.toISOString()
    fixture.manifest.competition.name = fixture.competition.name
    fixture.users = Array.from({ length: organizerCount }, (_, index) => ({
      id: index === 0 ? fixture.ownerId : `c${randomBytes(12).toString("hex")}`,
      email: `${runId}-competition${competitionIndex + 1}-organizer${index + 1}@example.invalid`,
      name: `Koormustesti korraldaja ${competitionIndex + 1}.${index + 1}`,
      role: "USER",
    }))
    fixture.members = fixture.users.map((user) => ({
      id: `c${randomBytes(12).toString("hex")}`, competitionId: fixture.competition.id, userId: user.id,
    }))
    fixture.memberRoles = fixture.members.map((member) => ({ memberId: member.id, role: "ORGANIZER" }))
    fixture.manifest.organizers = fixture.users.map((user, index) => ({
      index, userId: user.id, memberId: fixture.members[index].id,
      name: user.name, email: user.email, role: "ORGANIZER", systemRole: "USER",
    }))
    Object.assign(fixture.manifest.routes, {
      organizerOverview: `/dashboard/competitions/${fixture.competition.id}/overview`,
      organizerLeaderboard: `/dashboard/competitions/${fixture.competition.id}/leaderboard`,
      organizerHome: `/dashboard/competitions/${fixture.competition.id}`,
      organizerTeams: `/dashboard/competitions/${fixture.competition.id}/teams`,
      organizerAccess: `/dashboard/competitions/${fixture.competition.id}/access`,
    })
    return fixture
  })
  return {
    manifest: {
      schemaVersion: 2, environment: "load-test", runId, writtenAt: now.toISOString(), baseUrl,
      competitionCount, teamCountPerCompetition: teamCount,
      judgesPerCompetition: elementCount, organizersPerCompetition: organizerCount,
      competitions: competitions.map((fixture) => fixture.manifest),
      totals: {
        users: competitionCount * organizerCount, organizers: competitionCount * organizerCount,
        teams: competitionCount * teamCount, elements: competitionCount * elementCount,
        judges: competitionCount * elementCount, results: competitionCount * teamCount * elementCount,
        computedScores: competitionCount * teamCount * elementCount,
      },
    },
    competitions,
  }
}

function validatePreparedFixture(config, fixture) {
  const manifest = fixture?.manifest
  if (![1, 2].includes(manifest?.schemaVersion) || manifest.environment !== "load-test" || manifest.baseUrl !== config.baseUrl) {
    throw new FixtureError("The prepared fixture must match the guarded staging target.")
  }
  const plans = manifest.schemaVersion === 1 ? [fixture] : fixture.competitions
  if (!Array.isArray(plans) || (manifest.schemaVersion === 2 && (manifest.competitionCount !== 4 || plans.length !== 4 || manifest.competitions?.length !== 4))) {
    throw new FixtureError("The event-set fixture requires exactly four prepared competitions.")
  }
  const competitionIds = new Set()
  const userIds = new Set()
  for (const [index, plan] of plans.entries()) {
    const teamCount = plan.manifest?.competition?.teamCount
    const competitionManifest = manifest.schemaVersion === 1 ? manifest : manifest.competitions[index]
    if (!supportedTeamCounts.has(teamCount) || plan.manifest?.schemaVersion !== 1 ||
        plan.manifest.environment !== "load-test" || plan.manifest.baseUrl !== config.baseUrl ||
        plan.competition?.id !== plan.manifest.competition?.id || plan.competition?.id !== competitionManifest?.competition?.id ||
        plan.competition?.status !== "ACTIVE" || plan.competition?.isPublic !== true ||
        plan.teams?.length !== teamCount || plan.elements?.length !== elementCount ||
        plan.tokens?.length !== elementCount || plan.results?.length !== teamCount * elementCount ||
        plan.scores?.length !== teamCount * elementCount || competitionIds.has(plan.competition.id)) {
      throw new FixtureError("Each prepared competition must match the expected synthetic fixture counts and identity.")
    }
    competitionIds.add(plan.competition.id)
    if (manifest.schemaVersion === 2) {
      if (plan.manifest.runId !== manifest.runId || competitionManifest.runId !== manifest.runId ||
          competitionManifest.baseUrl !== config.baseUrl || teamCount !== manifest.teamCountPerCompetition ||
          competitionManifest.competition.teamCount !== teamCount) {
        throw new FixtureError("Event competition metadata must match the parent event manifest.")
      }
      if (plan.users?.length !== organizerCount || plan.members?.length !== organizerCount ||
          plan.memberRoles?.length !== organizerCount || competitionManifest.organizers?.length !== organizerCount ||
          plan.users[0].id !== plan.ownerId || plan.competition.organizerId !== plan.ownerId || plan.competition.createdById !== plan.ownerId) {
        throw new FixtureError("Each event competition requires ten distinct synthetic organizers and one of them as owner.")
      }
      for (const [organizerIndex, user] of plan.users.entries()) {
        const member = plan.members[organizerIndex]
        const role = plan.memberRoles[organizerIndex]
        const organizer = competitionManifest.organizers[organizerIndex]
        if (userIds.has(user.id) || user.role !== "USER" || !user.email?.endsWith("@example.invalid") || user.passwordHash ||
            member.userId !== user.id || member.competitionId !== plan.competition.id ||
            role.memberId !== member.id || role.role !== "ORGANIZER" ||
            organizer.userId !== user.id || organizer.memberId !== member.id || organizer.role !== "ORGANIZER") {
          throw new FixtureError("Organizer users and scoped role assignments must be distinct, synthetic, and match the private manifest.")
        }
        userIds.add(user.id)
      }
    }
  }
  if (manifest.schemaVersion === 2) {
    const expectedTotals = {
      users: 4 * organizerCount, organizers: 4 * organizerCount,
      teams: 4 * manifest.teamCountPerCompetition, elements: 4 * elementCount,
      judges: 4 * elementCount, results: 4 * manifest.teamCountPerCompetition * elementCount,
      computedScores: 4 * manifest.teamCountPerCompetition * elementCount,
    }
    if (Object.entries(expectedTotals).some(([key, value]) => manifest.totals?.[key] !== value)) {
      throw new FixtureError("Event manifest totals must match all four prepared competition plans.")
    }
  }
  return plans
}

export async function seedDatabase(config, fixture) {
  // Imports are inert, and programmatic calls must pass the same explicit
  // staging guards as the CLI. A prepared plan never chooses its connection.
  const guardedConfig = readConfiguration({ allowWrites: true })
  if (["databaseUrl", "databaseName", "baseUrl", "manifestPath"].some((key) => config[key] !== guardedConfig[key])) {
    throw new FixtureError("Programmatic seed configuration does not match the guarded environment.")
  }
  const plans = validatePreparedFixture(config, fixture)
  const { PrismaClient } = await import("@prisma/client")
  const prisma = new PrismaClient({ datasources: { db: { url: config.databaseUrl } }, log: [] })
  let manifestHandle
  let manifestCreated = false
  let committed = false
  try {
    // Exclusive creation also rejects existing files/symlinks and reruns. The
    // token-bearing manifest is private from its first byte; never print it.
    manifestHandle = await open(config.manifestPath, "wx", 0o600)
    manifestCreated = true
    await manifestHandle.chmod(0o600)
    await manifestHandle.writeFile(`${JSON.stringify(fixture.manifest, null, 2)}\n`)
    await manifestHandle.sync()
    await manifestHandle.close()
    manifestHandle = undefined

    await prisma.$transaction(async (tx) => {
      const [{ name }] = await tx.$queryRaw`SELECT current_database() AS name`
      if (name !== config.databaseName) throw new FixtureError("Connected database identity does not match the explicit database name.")
      const counts = await Promise.all([
        tx.user.count(), tx.competition.count(), tx.accessToken.count(), tx.result.count(), tx.computedScore.count(),
      ])
      if (counts.some((count) => count !== 0)) {
        throw new FixtureError("Seeding requires an empty application database. Existing users, competitions, tokens, results, or scores were found.")
      }

      for (const plan of plans) {
        const teamCount = plan.manifest.competition.teamCount
        const users = fixture.manifest.schemaVersion === 2 ? plan.users : [{
          id: plan.ownerId, email: `${plan.manifest.runId}@example.invalid`,
          name: "Koormustesti sünteetiline korraldaja", role: "USER",
        }]
        await tx.user.createMany({ data: users })
        await tx.competition.create({ data: plan.competition })
        if (fixture.manifest.schemaVersion === 2) {
          await tx.competitionMember.createMany({ data: plan.members })
          await tx.competitionMemberRole.createMany({ data: plan.memberRoles })
        }
        await tx.competitionClass.createMany({ data: ["Noored", "Naised", "Mehed", "Segavõistkonnad"].map((name, order) => ({ competitionId: plan.competition.id, name, order })) })
        await tx.team.createMany({ data: plan.teams })
        await tx.scoringElement.createMany({ data: plan.elements })
        await tx.fieldDefinition.createMany({ data: plan.fields })
        await tx.calcMethod.createMany({ data: plan.methods })
        await tx.elementException.createMany({ data: plan.exceptions })
        await tx.accessToken.createMany({ data: plan.tokens })
        await tx.result.createMany({ data: plan.results })
        await tx.computedScore.createMany({ data: plan.scores })

        const storedCounts = await Promise.all([
          tx.team.count({ where: { competitionId: plan.competition.id } }),
          tx.scoringElement.count({ where: { competitionId: plan.competition.id } }),
          tx.accessToken.count({ where: { competitionId: plan.competition.id, type: "JUDGE" } }),
          tx.result.count({ where: { element: { competitionId: plan.competition.id } } }),
          tx.computedScore.count({ where: { element: { competitionId: plan.competition.id } } }),
        ])
        if (storedCounts.some((count, index) => count !== [teamCount, elementCount, elementCount, teamCount * elementCount, teamCount * elementCount][index])) {
          throw new FixtureError("Fixture counts failed verification; the transaction will be rolled back.")
        }
        if (fixture.manifest.schemaVersion === 2) {
          const organizerCounts = await Promise.all([
            tx.competitionMember.count({ where: { competitionId: plan.competition.id } }),
            tx.competitionMemberRole.count({ where: { role: "ORGANIZER", member: { competitionId: plan.competition.id } } }),
          ])
          if (organizerCounts.some((count) => count !== organizerCount)) {
            throw new FixtureError("Organizer role counts failed verification; the transaction will be rolled back.")
          }
        }
      }
      const expectedUsers = fixture.manifest.schemaVersion === 2 ? 4 * organizerCount : 1
      if (await tx.user.count() !== expectedUsers || await tx.competition.count() !== plans.length) {
        throw new FixtureError("Global fixture identity counts failed verification; the transaction will be rolled back.")
      }
    }, { maxWait: 20000, timeout: 60000, isolationLevel: "Serializable" })
    committed = true
  } finally {
    if (manifestHandle) await manifestHandle.close().catch(() => {})
    if (!committed && manifestCreated) {
      // Only remove a file created by this invocation, never a pre-existing
      // token manifest. open() failures leave the handle undefined below.
      await unlink(config.manifestPath).catch(() => {})
    }
    await prisma.$disconnect()
  }
}

async function main() {
  const args = process.argv.slice(2)
  if (args.includes("--help")) {
    console.log("Usage: node scripts/load-test/seed.mjs [--event-set] [--teams=100|150|200] [--dry-run]\nRequired: LOAD_TEST_ENVIRONMENT=load-test, LOAD_TEST_DATABASE_URL, LOAD_TEST_DATABASE_HOST, LOAD_TEST_DATABASE_NAME, LOAD_TEST_BASE_URL, LOAD_TEST_ALLOWED_HOST.\nWrites additionally require LOAD_TEST_ALLOW_WRITES=1. LOAD_TEST_FIXTURE optionally changes the private manifest path.\n--event-set prepares four competitions with ten distinct organizer users each.\n--dry-run validates configuration and prepares fixture metadata without connecting or writing. Seeding only supports an empty, migrated, dedicated staging database.")
    return
  }
  if (args.some((arg) => !["--dry-run", "--event-set"].includes(arg) && !/^--teams=(100|150|200)$/.test(arg))) {
    throw new FixtureError("Unknown argument. Use --help for usage.")
  }
  const dryRun = args.includes("--dry-run")
  const eventSet = args.includes("--event-set")
  const teamCount = Number(args.find((arg) => arg.startsWith("--teams="))?.slice("--teams=".length) ?? defaultTeamCount)
  const config = readConfiguration({ allowWrites: !dryRun })
  const fixture = eventSet ? prepareEventFixture(config.baseUrl, { teamCount }) : prepareFixture(config.baseUrl, { teamCount })
  if (!dryRun) await seedDatabase(config, fixture)
  console.log(JSON.stringify({
    action: dryRun ? "dry-run (no database access or writes)" : "seeded",
    environment: "load-test", schemaVersion: fixture.manifest.schemaVersion,
    ...(eventSet ? { competitionCount: fixture.manifest.competitionCount, totals: fixture.manifest.totals }
      : { competitionId: fixture.competition.id, teamCount, elementCount, judgeCount: elementCount,
        resultCount: fixture.results.length, computedScoreCount: fixture.scores.length }),
    ...(dryRun ? {} : { manifestPath: config.manifestPath, manifestMode: "0600" }),
  }))
}

function reportError(error) {
  // Prisma errors can contain connection details or token-bearing query data.
  // Report only our own safe guard messages or a non-secret error code.
  const message = error instanceof FixtureError ? error.message
    : error?.code === "EEXIST" ? "The manifest already exists; choose a new LOAD_TEST_FIXTURE path."
    : error?.code === "ENOENT" ? "The manifest directory does not exist."
    : `Fixture creation failed (${typeof error?.code === "string" && /^[A-Z0-9_]+$/.test(error.code) ? error.code : "unreported internal error"}).`
  console.error(message)
  process.exitCode = 1
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch(reportError)
}
