#!/usr/bin/env node

// Read-only verification for the synthetic fixture. This deliberately does not
// import the application's scoring implementation or call its recalculate API.
import { lstat, open, readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { FixtureError, readConfiguration } from "./fixture-guards.mjs"

class VerificationError extends Error {}
const round3 = (value) => Math.round(value * 1000) / 1000
const identifier = (value) => typeof value === "string" && /^c[a-z0-9]{24}$/.test(value)
const requireCondition = (condition, message) => {
  if (!condition) throw new VerificationError(message)
}

async function readJson(path, { privateFile = false } = {}) {
  const info = await lstat(path)
  requireCondition(info.isFile() && !info.isSymbolicLink(), "Input must be a regular file, not a symlink.")
  requireCondition(info.size <= 4 * 1024 * 1024, "Input JSON exceeds the size limit.")
  if (privateFile) requireCondition((info.mode & 0o077) === 0, "The token-bearing fixture manifest must have private file permissions.")
  try { return JSON.parse(await readFile(path, "utf8")) }
  catch { throw new VerificationError("Input contains invalid JSON.") }
}

export function competitionFixtures(manifest) {
  return manifest?.schemaVersion === 2 ? manifest.competitions : [manifest]
}

export function validateManifest(manifest, config) {
  requireCondition([1, 2].includes(manifest?.schemaVersion) && manifest.environment === "load-test", "Fixture manifest schema or environment is invalid.")
  requireCondition(typeof manifest.runId === "string" && /^loadtest-[a-zA-Z0-9-]{1,100}$/.test(manifest.runId), "Fixture run identifier is invalid.")
  requireCondition(manifest.baseUrl === config.baseUrl, "Fixture target origin does not match the explicitly guarded origin.")
  if (manifest.schemaVersion === 2) requireCondition(manifest.competitionCount === 4 && Array.isArray(manifest.competitions) && manifest.competitions.length === 4, "The competition-set fixture must contain exactly four competitions.")
  const fixtures = competitionFixtures(manifest)
  const uniqueIds = new Set()
  const uniqueTokens = new Set()
  for (const [competitionIndex, fixture] of fixtures.entries()) {
    requireCondition(fixture?.environment === "load-test" && fixture.baseUrl === manifest.baseUrl && fixture.runId === manifest.runId, "A competition fixture does not match the parent manifest identity.")
    validateCompetitionFixture(fixture, manifest.schemaVersion, competitionIndex)
    const ids = [fixture.competition.id, ...fixture.teams.map((team) => team.id), ...fixture.judges.flatMap((judge) => [judge.elementId, ...(judge.tokenId ? [judge.tokenId] : [])]), ...(fixture.organizers ?? []).flatMap((organizer) => [organizer.userId, organizer.memberId])]
    for (const id of ids) {
      requireCondition(!uniqueIds.has(id), "Fixture identities overlap across records or competitions.")
      uniqueIds.add(id)
    }
    for (const judge of fixture.judges) {
      requireCondition(!uniqueTokens.has(judge.token), "Judge credentials overlap across competitions.")
      uniqueTokens.add(judge.token)
    }
  }
  if (manifest.schemaVersion === 2) {
    const expected = { users: 40, organizers: 40, teams: fixtures.reduce((sum, fixture) => sum + fixture.teams.length, 0), elements: 80, judges: 80, results: fixtures.reduce((sum, fixture) => sum + fixture.competition.initialResultCount, 0), computedScores: fixtures.reduce((sum, fixture) => sum + fixture.competition.initialComputedScoreCount, 0) }
    for (const [key, count] of Object.entries(expected)) requireCondition(manifest.totals?.[key] === count, "Competition-set totals do not match the declared fixture records.")
  }
  return manifest
}

function validateCompetitionFixture(manifest, parentVersion, competitionIndex) {
  const competition = manifest.competition
  const expectedName = parentVersion === 1 ? `KOORMUSTEST — ${manifest.runId}` : `KOORMUSTEST ${competitionIndex + 1}/4 — ${manifest.runId}`
  requireCondition(identifier(competition?.id) && competition.name === expectedName, "Fixture competition identity is invalid.")
  requireCondition(competition.status === "ACTIVE" && competition.isPublic === true && competition.scoringMode === "PENALTY", "Fixture competition configuration is invalid.")
  requireCondition([100, 150, 200].includes(competition.teamCount) && competition.elementCount === 20 && competition.initialResultCount === competition.teamCount * 20 && competition.initialComputedScoreCount === competition.teamCount * 20, "Fixture counts do not match the load-test contract.")
  requireCondition(Array.isArray(manifest.teams) && manifest.teams.length === competition.teamCount && Array.isArray(manifest.judges) && manifest.judges.length === 20, "Fixture team or judge arrays are invalid.")
  const teamIds = new Set()
  for (const [index, team] of manifest.teams.entries()) {
    requireCondition(identifier(team?.id) && !teamIds.has(team.id) && team.code === String(index + 1).padStart(3, "0"), "Fixture team identity or ordering is invalid.")
    teamIds.add(team.id)
  }
  const elementIds = new Set()
  const tokenIds = new Set()
  const tokens = new Set()
  for (const [index, judge] of manifest.judges.entries()) {
    requireCondition(judge?.index === index && identifier(judge.elementId) && !elementIds.has(judge.elementId), "Fixture judge identity or ordering is invalid.")
    requireCondition(typeof judge.token === "string" && /^[a-zA-Z0-9_-]{43}$/.test(judge.token) && !tokens.has(judge.token), "Fixture judge credential is invalid.")
    if (judge.tokenId !== undefined) {
      requireCondition(identifier(judge.tokenId) && !tokenIds.has(judge.tokenId), "Fixture judge token identifier is invalid.")
      tokenIds.add(judge.tokenId)
    }
    if (parentVersion === 2) requireCondition(identifier(judge.tokenId), "Competition-set judge token identifiers are required.")
    requireCondition(judge.judgePath === `/judge/${judge.token}` && judge.resultsPath === `/api/elements/${judge.elementId}/results`, "Fixture judge routes are invalid.")
    requireCondition(judge.scoring?.type === "RELATIVE_RANKING" && judge.scoring.maxValue === 30 && judge.scoring.minPoints === 0, "Fixture scoring contract is unsupported.")
    requireCondition(JSON.stringify(judge.scoring.ranking) === JSON.stringify(["hits DESC", "time_seconds ASC"]), "Fixture ranking contract is unsupported.")
    elementIds.add(judge.elementId)
    tokens.add(judge.token)
  }
  if (parentVersion === 2) {
    requireCondition(Array.isArray(manifest.organizers) && manifest.organizers.length === 10, "Each competition must contain ten declared organizers.")
    for (const [index, organizer] of manifest.organizers.entries()) requireCondition(organizer?.index === index && identifier(organizer.userId) && identifier(organizer.memberId) && organizer.role === "ORGANIZER" && organizer.systemRole === "USER", "An organizer identity or role assignment is invalid.")
  }
}

// Competition ranks: exact ties share a rank and the next distinct rank skips
// the tied positions. Normalization uses the fixture's configured team count.
export function expectedScores(rows, teamCount = 100) {
  requireCondition(Number.isInteger(teamCount) && teamCount >= 2, "Scoring normalization needs a valid team count.")
  const ordered = rows.map((row) => ({ ...row, parsed: parseValues(row.values) }))
    .sort((a, b) => b.parsed.hits - a.parsed.hits || a.parsed.time_seconds - b.parsed.time_seconds)
  const expected = new Map()
  let rankIndex = 0
  ordered.forEach((row, index) => {
    if (index > 0 && (row.parsed.hits !== ordered[index - 1].parsed.hits || row.parsed.time_seconds !== ordered[index - 1].parsed.time_seconds)) rankIndex = index
    expected.set(row.teamId, round3(rankIndex * 30 / (teamCount - 1)))
  })
  return expected
}

function parseValues(value) {
  let parsed
  try { parsed = typeof value === "string" ? JSON.parse(value) : value }
  catch { throw new VerificationError("A result contains invalid JSON values.") }
  requireCondition(parsed && typeof parsed === "object" && !Array.isArray(parsed) && Object.keys(parsed).sort().join(",") === "hits,time_seconds", "A result does not contain exactly the fixture fields.")
  const hits = Number(parsed.hits)
  const timeSeconds = Number(parsed.time_seconds)
  requireCondition(["string", "number"].includes(typeof parsed.hits) && String(parsed.hits).trim() !== "" && Number.isInteger(hits) && hits >= 0 && hits <= 100, "A result contains invalid hits.")
  requireCondition(["string", "number"].includes(typeof parsed.time_seconds) && String(parsed.time_seconds).trim() !== "" && Number.isFinite(timeSeconds) && timeSeconds >= 1 && timeSeconds <= 86400, "A result contains an invalid elapsed time.")
  return { hits, time_seconds: timeSeconds }
}

function valuesEqual(left, right) {
  const a = parseValues(left)
  const b = parseValues(right)
  return a.hits === b.hits && a.time_seconds === b.time_seconds
}

function parseTimestamp(value, label) {
  const timestamp = new Date(value)
  requireCondition(typeof value === "string" && Number.isFinite(timestamp.getTime()), `${label} must be an ISO timestamp.`)
  return timestamp
}

export function validateAcknowledgments(summary, manifest) {
  requireCondition([1, 2].includes(summary?.schemaVersion) && Array.isArray(summary.writes), "Harness summary must contain the versioned acknowledged writes array.")
  requireCondition(!summary.fixture?.runId || summary.fixture.runId === manifest.runId, "Harness summary belongs to a different fixture.")
  const fixture = competitionFixtures(manifest).find((candidate) => candidate.competition.id === summary.fixture?.competitionId)
  requireCondition(Boolean(fixture), "Harness summary competition identity does not match the fixture.")
  const competitionId = fixture.competition.id
  const startedAt = parseTimestamp(summary.startedAt, "Harness startedAt")
  const finishedAt = parseTimestamp(summary.finishedAt, "Harness finishedAt")
  requireCondition(finishedAt >= startedAt && finishedAt - startedAt <= 2 * 60 * 60 * 1000, "Harness run boundaries are invalid.")
  const writes = new Map()
  const attempts = new Map()
  const validateWrite = (item, acknowledged) => {
    requireCondition(Number.isInteger(item?.judgeIndex) && item.judgeIndex >= 0 && item.judgeIndex < fixture.judges.length && Number.isInteger(item.teamIndex) && item.teamIndex >= 0 && item.teamIndex < fixture.teams.length, "Acknowledged write indices are invalid.")
    const judge = fixture.judges[item.judgeIndex]
    const team = fixture.teams[item.teamIndex]
    const unfinished = !acknowledged && item.status === null && item.inFlight === true
    requireCondition((unfinished || Number.isInteger(item.status) && (acknowledged ? item.status >= 200 && item.status < 300 : item.status === 0 || item.status >= 100 && item.status <= 599)) && item.elementId === judge.elementId && item.teamId === team.id, "Harness write identity or status is invalid.")
    parseValues(item.values)
    const key = `${item.elementId}:${item.teamId}`
    const respondedAt = item.respondedAt ? parseTimestamp(item.respondedAt, "Write respondedAt") : null
    const requestStartedAt = item.startedAt ? parseTimestamp(item.startedAt, "Write startedAt") : null
    if (respondedAt) requireCondition(respondedAt >= startedAt && respondedAt <= finishedAt, "A request response lies outside the harness run boundaries.")
    if (requestStartedAt) requireCondition(requestStartedAt >= startedAt && requestStartedAt <= finishedAt && (!respondedAt || requestStartedAt <= respondedAt), "A request start lies outside its valid run or response boundaries.")
    if (unfinished) requireCondition(Boolean(requestStartedAt) && !respondedAt, "An in-flight request must have a start timestamp and no response timestamp.")
    return { key, value: { competitionId, judgeIndex: item.judgeIndex, values: item.values, status: item.status, inFlight: unfinished, requestStartedAt, respondedAt, startedAt, finishedAt } }
  }
  for (const item of summary.writes) {
    const { key, value } = validateWrite(item, true)
    requireCondition(!writes.has(key), "Acknowledged writes repeat a result key; commit order cannot be inferred from response order.")
    writes.set(key, value)
  }
  requireCondition(summary.attempts === undefined || Array.isArray(summary.attempts), "Harness attempts must be an array when supplied.")
  for (const item of summary.attempts ?? []) {
    const { key, value } = validateWrite(item, false)
    requireCondition(!attempts.has(key), "Harness attempts repeat a result key within one run.")
    attempts.set(key, value)
  }
  if (summary.attempts) {
    for (const [key, value] of writes) requireCondition(attempts.has(key) && attempts.get(key).status === value.status && valuesEqual(attempts.get(key).values, value.values), "A successful acknowledgment lacks a matching attempted request.")
  }
  return { competitionId, startedAt, finishedAt, writes, attempts }
}

export function mergeAcknowledgments(runs) {
  if (runs.length === 0) return null
  const ordered = [...runs].sort((a, b) => a.startedAt - b.startedAt)
  const writes = new Map()
  const attempts = new Map()
  let attemptedRequests = 0
  let acknowledgedRequests = 0
  const finishedByCompetition = new Map()
  const competitionRuns = new Map()
  ordered.forEach((run) => {
    const competitionId = run.competitionId ?? "legacy"
    requireCondition(!finishedByCompetition.has(competitionId) || run.startedAt >= finishedByCompetition.get(competitionId), "Harness runs overlap for the same competition; final commit order cannot be inferred safely.")
    finishedByCompetition.set(competitionId, run.finishedAt)
    competitionRuns.set(competitionId, [...(competitionRuns.get(competitionId) ?? []), run])
    for (const [key, value] of run.writes) writes.set(key, value)
    for (const [key, value] of run.attempts) attempts.set(key, value)
    attemptedRequests += run.attempts.size
    acknowledgedRequests += run.writes.size
  })
  return { startedAt: ordered[0].startedAt, finishedAt: new Date(Math.max(...ordered.map((run) => run.finishedAt.getTime()))), writes, attempts, attemptedRequests, acknowledgedRequests, runCount: ordered.length, competitionRuns }
}

function acknowledgmentsForCompetition(acknowledgments, competitionId) {
  return acknowledgments ? mergeAcknowledgments(acknowledgments.competitionRuns.get(competitionId) ?? []) : null
}

async function collectStatistics(tx, bounds) {
  const database = await tx.$queryRaw`
    SELECT numbackends, xact_commit, xact_rollback, blks_read, blks_hit,
      tup_returned, tup_fetched, tup_inserted, tup_updated, tup_deleted,
      conflicts, temp_files, temp_bytes, deadlocks, stats_reset
    FROM pg_stat_database WHERE datname = current_database()
  `
  const tables = await tx.$queryRaw`
    SELECT relname AS table_name, seq_scan, seq_tup_read, idx_scan, idx_tup_fetch,
      n_tup_ins, n_tup_upd, n_tup_del, n_live_tup, n_dead_tup,
      last_autovacuum, autovacuum_count, last_autoanalyze, autoanalyze_count
    FROM pg_stat_user_tables
    WHERE schemaname = current_schema()
      AND relname IN ('Result', 'ComputedScore', 'AccessToken', 'RateLimitBucket', 'SecurityEvent')
    ORDER BY relname
  `
  const activity = await tx.$queryRaw`
    SELECT COALESCE(state, 'unknown') AS state,
      COALESCE(wait_event_type, 'none') AS wait_type,
      COALESCE(wait_event, 'none') AS wait_event, COUNT(*)::int AS connections,
      COALESCE(MAX(EXTRACT(EPOCH FROM (clock_timestamp() - xact_start))), 0)::float8 AS oldest_transaction_seconds
    FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()
    GROUP BY state, wait_event_type, wait_event
    ORDER BY state, wait_event_type, wait_event
  `
  const locks = await tx.$queryRaw`
    SELECT l.locktype, l.mode, l.granted, COUNT(*)::int AS lock_count
    FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid
    WHERE a.datname = current_database() AND a.pid <> pg_backend_pid()
    GROUP BY l.locktype, l.mode, l.granted ORDER BY l.locktype, l.mode, l.granted
  `
  const startedAt = bounds?.startedAt ?? new Date(0)
  const finishedAt = bounds?.finishedAt ?? new Date()
  const audit = await tx.$queryRaw`
    SELECT outcome, status, COUNT(*)::int AS events,
      COUNT("durationMs")::int AS timed_events,
      ROUND(AVG("durationMs")::numeric, 3) AS mean_duration_ms,
      percentile_cont(0.50) WITHIN GROUP (ORDER BY "durationMs") AS p50_duration_ms,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY "durationMs") AS p95_duration_ms,
      percentile_cont(0.99) WITHIN GROUP (ORDER BY "durationMs") AS p99_duration_ms,
      MAX("durationMs") AS max_duration_ms
    FROM "SecurityEvent"
    WHERE action = 'RESULT_CHANGE' AND route = '/api/elements/[id]/results'
      AND "createdAt" >= ${startedAt} AND "createdAt" <= ${finishedAt}
    GROUP BY outcome, status ORDER BY outcome, status
  `
  return { collectedAt: new Date().toISOString(), database: database[0], tables, activity, locks, resultChangeAudit: audit, auditWindow: { startedAt: startedAt.toISOString(), finishedAt: finishedAt.toISOString() }, notes: ["PostgreSQL counters are cumulative; compare baseline and final snapshots without resetting statistics.", "Only the first blocked request per rate-limit window receives an audit event; audit counts do not count all HTTP 429 responses.", "Successful API reads and page renders are not individually audited."] }
}

export function summarizeJudgeClients(groups, manifest) {
  const fixtures = competitionFixtures(manifest)
  const tokenCompetition = new Map(fixtures.flatMap((fixture) => fixture.judges.map((judge) => [judge.tokenId, fixture.competition.id])))
  const clients = new Map()
  for (const group of groups) {
    const competitionId = tokenCompetition.get(group.actorTokenId)
    if (!competitionId || typeof group.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(group.fingerprint)) continue
    const client = clients.get(group.fingerprint) ?? { competitionIds: new Set(), eventCount: 0, perCompetition: new Map() }
    const events = group._count?._all ?? 0
    client.competitionIds.add(competitionId)
    client.eventCount += events
    client.perCompetition.set(competitionId, (client.perCompetition.get(competitionId) ?? 0) + events)
    clients.set(group.fingerprint, client)
  }
  const labeledClients = [...clients.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, client], index) => ({ label: `client-${index + 1}`, competitionIds: [...client.competitionIds].sort(), eventCount: client.eventCount, perCompetition: client.perCompetition }))
  const competitions = fixtures.map((fixture) => {
    const matching = labeledClients.filter((client) => client.competitionIds.includes(fixture.competition.id))
    return { competitionId: fixture.competition.id, clientCount: matching.length, clientLabels: matching.map((client) => client.label), eventCount: matching.reduce((sum, client) => sum + client.perCompetition.get(fixture.competition.id), 0) }
  })
  const observed = competitions.filter((competition) => competition.clientCount > 0).length
  const shared = labeledClients.filter((client) => client.competitionIds.length > 1).length
  return { source: "Server-side HMAC of Railway edge x-real-ip for authorized judge writes; no raw IP addresses or fingerprints are reported.", observedClientCount: labeledClients.length, competitionsObserved: observed, allCompetitionsObserved: observed === fixtures.length, sharedClientCountAcrossCompetitions: shared, sharedAcrossCompetitions: observed === fixtures.length ? shared > 0 : null, distinctClientsForAllCompetitions: observed === fixtures.length && shared === 0 && labeledClients.length >= fixtures.length, competitions, clients: labeledClients.map((client) => ({ label: client.label, competitionIds: client.competitionIds, eventCount: client.eventCount })) }
}

async function collectJudgeClientStatistics(tx, manifest, bounds) {
  const tokenIds = competitionFixtures(manifest).flatMap((fixture) => fixture.judges.map((judge) => judge.tokenId))
  const groups = await tx.securityEvent.groupBy({ by: ["fingerprint", "actorTokenId"], where: { action: "RESULT_CHANGE", route: "/api/elements/[id]/results", actorTokenId: { in: tokenIds }, createdAt: { gte: bounds?.startedAt ?? new Date(0), lte: bounds?.finishedAt ?? new Date() } }, _count: { _all: true } })
  return summarizeJudgeClients(groups, manifest)
}

async function verifyDatabase(tx, config, manifest, acknowledgments, statsOnly) {
  await tx.$executeRaw`SET TRANSACTION READ ONLY`
  const [identity] = await tx.$queryRaw`SELECT current_database() AS name, current_setting('transaction_read_only') AS read_only`
  requireCondition(identity.name === config.databaseName && identity.read_only === "on", "Database identity or read-only transaction guard failed.")
  const fixtures = competitionFixtures(manifest)
  const expectedUserCount = manifest.schemaVersion === 2 ? 40 : 1
  requireCondition(await tx.competition.count() === fixtures.length && await tx.user.count() === expectedUserCount, "The database contains data outside the isolated synthetic fixture.")
  requireCondition(await tx.accessToken.count() === fixtures.length * 20, "Global fixture judge-token counts differ from the manifest.")
  let organizerVerification
  if (manifest.schemaVersion === 2) {
    const expectedOrganizers = fixtures.flatMap((fixture) => fixture.organizers.map((organizer) => ({ ...organizer, competitionId: fixture.competition.id })))
    const users = await tx.user.findMany({ select: { id: true, role: true } })
    const members = await tx.competitionMember.findMany({ select: { id: true, competitionId: true, userId: true, roles: { select: { role: true } } } })
    requireCondition(users.length === 40 && members.length === 40 && await tx.competitionMemberRole.count() === 40, "Organizer user or role-assignment counts differ from the four-competition fixture.")
    for (const expected of expectedOrganizers) {
      const user = users.find((candidate) => candidate.id === expected.userId)
      const member = members.find((candidate) => candidate.id === expected.memberId)
      requireCondition(user?.role === expected.systemRole && member?.userId === expected.userId && member.competitionId === expected.competitionId && member.roles.length === 1 && member.roles[0].role === "ORGANIZER", "A declared organizer user or competition role assignment differs from the fixture.")
    }
    organizerVerification = { users: users.length, members: members.length, organizerRoleAssignments: expectedOrganizers.length, checkedAssignments: expectedOrganizers.length }
  }
  const statistics = await collectStatistics(tx, acknowledgments)
  if (manifest.schemaVersion === 2) statistics.judgeClientIdentities = await collectJudgeClientStatistics(tx, manifest, acknowledgments)
  const competitionReports = []
  for (const fixture of fixtures) {
    const report = await verifyCompetition(tx, fixture, acknowledgmentsForCompetition(acknowledgments, fixture.competition.id), statsOnly)
    competitionReports.push({ competitionId: fixture.competition.id, ...report })
  }
  if (manifest.schemaVersion === 1) {
    const single = { ...competitionReports[0] }
    delete single.competitionId
    if (!statsOnly && acknowledgments && statistics.resultChangeAudit.some((row) => row.outcome === "STARTED" && row.events > 0)) {
      single.passed = false
      single.issueCounts.incomplete_result_audit = 1
      single.issueExamples.push({ kind: "incomplete_result_audit" })
    }
    return { ...single, statistics }
  }
  const counts = { competitions: fixtures.length, organizers: 40, organizerRoleAssignments: 40, teams: 0, elements: 0, judgeTokens: 0, results: 0, computedScores: 0 }
  for (const report of competitionReports) for (const key of ["teams", "elements", "judgeTokens", "results", "computedScores"]) counts[key] += report.counts[key]
  const issueCounts = {}
  const issueExamples = []
  for (const report of competitionReports) {
    for (const [kind, count] of Object.entries(report.issueCounts ?? {})) issueCounts[kind] = (issueCounts[kind] ?? 0) + count
    for (const issue of report.issueExamples ?? []) if (issueExamples.length < 50) issueExamples.push({ competitionId: report.competitionId, ...issue })
  }
  if (!statsOnly && acknowledgments && statistics.resultChangeAudit.some((row) => row.outcome === "STARTED" && row.events > 0)) issueCounts.incomplete_result_audit = 1
  const acknowledgmentVerification = { available: Boolean(acknowledgments), runCount: acknowledgments?.runCount ?? 0, attemptedRequests: acknowledgments?.attemptedRequests ?? 0, acknowledgedRequests: acknowledgments?.acknowledgedRequests ?? 0, acknowledgedWrites: acknowledgments?.writes.size ?? 0, acknowledgedValuesChecked: 0, failedAttemptsPersisted: 0, inFlightAttemptsPersisted: 0, failedAttemptStatuses: {}, clockToleranceMs: 30_000 }
  for (const report of competitionReports) {
    const checks = report.acknowledgmentVerification
    if (checks) {
      for (const key of ["acknowledgedValuesChecked", "failedAttemptsPersisted", "inFlightAttemptsPersisted"]) acknowledgmentVerification[key] += checks[key] ?? 0
      for (const [status, count] of Object.entries(checks.failedAttemptStatuses)) acknowledgmentVerification.failedAttemptStatuses[status] = (acknowledgmentVerification.failedAttemptStatuses[status] ?? 0) + count
    }
  }
  return { passed: competitionReports.every((report) => report.passed) && Object.keys(issueCounts).length === 0, mode: statsOnly ? "statistics" : acknowledgments ? "final" : "baseline", counts, checkedScores: competitionReports.reduce((sum, report) => sum + (report.checkedScores ?? 0), 0), changedResults: competitionReports.reduce((sum, report) => sum + (report.changedResults ?? 0), 0), organizerVerification, acknowledgmentVerification, issueCounts, issueExamples, competitions: competitionReports, statistics }
}

async function verifyCompetition(tx, manifest, acknowledgments, statsOnly) {
  const competitionId = manifest.competition.id
  const teamCount = manifest.competition.teamCount
  const expectedCount = teamCount * manifest.competition.elementCount
  const competition = await tx.competition.findUnique({ where: { id: competitionId }, select: { id: true, name: true, status: true, isPublic: true, scoringMode: true, analysisAccessMode: true, createdById: true, organizerId: true } })
  requireCondition(competition?.name === manifest.competition.name && competition.status === "ACTIVE" && competition.isPublic && competition.scoringMode === "PENALTY" && competition.analysisAccessMode === "PUBLIC", "The connected fixture competition differs from the approved synthetic fixture.")
  if (manifest.organizers) requireCondition(competition.createdById === manifest.organizers[0].userId && competition.organizerId === manifest.organizers[0].userId, "A competition owner differs from its declared first organizer.")
  const teams = await tx.team.findMany({ where: { competitionId }, select: { id: true, code: true, isHorsDeCompetition: true, hcFromElementOrder: true, dnfFromElementOrder: true } })
  const elements = await tx.scoringElement.findMany({ where: { competitionId }, include: { fields: true, calcMethod: true, sections: true } })
  const tokens = await tx.accessToken.findMany({ where: { competitionId, type: "JUDGE" }, select: { id: true, token: true, elementId: true } })
  requireCondition(teams.length === teamCount && elements.length === 20 && tokens.length === 20, "Database fixture counts differ from the manifest.")
  const teamMap = new Map(teams.map((team) => [team.id, team]))
  const elementMap = new Map(elements.map((element) => [element.id, element]))
  const tokenIds = new Map()
  for (const team of manifest.teams) {
    const stored = teamMap.get(team.id)
    requireCondition(stored?.code === team.code && !stored.isHorsDeCompetition && stored.hcFromElementOrder === null && stored.dnfFromElementOrder === null, "A fixture team is missing or has an unsupported status.")
  }
  for (const judge of manifest.judges) {
    const element = elementMap.get(judge.elementId)
    const token = tokens.find((item) => item.elementId === judge.elementId && item.token === judge.token)
    requireCondition(Boolean(token) && (!judge.tokenId || token.id === judge.tokenId), "A judge credential does not match the dedicated fixture.")
    tokenIds.set(judge.elementId, token.id)
    requireCondition(element?.code === judge.elementCode && !element.isCancelled && element.type === "CHECKPOINT" && element.maxValue === 30 && element.sections.length === 0 && element.calcMethod?.type === "RELATIVE_RANKING", "A fixture element has an unsupported configuration.")
    let params
    try { params = JSON.parse(element.calcMethod.params) }
    catch { throw new VerificationError("A fixture scoring configuration contains invalid JSON.") }
    requireCondition(params.higherIsBetter === true && params.minPoints === 0, "A fixture scoring method differs from the independent verification contract.")
    requireCondition(element.fields.length === 2 && element.fields.some((field) => field.name === "hits" && field.type === "NUMBER" && field.isResultField && field.rankingPriority === 1) && element.fields.some((field) => field.name === "time_seconds" && field.type === "NUMBER" && field.rankingPriority === 2), "Fixture scoring fields differ from the independent verification contract.")
    for (const field of element.fields) {
      let metadata
      try { metadata = JSON.parse(field.meta) }
      catch { throw new VerificationError("A fixture ranking field contains invalid metadata.") }
      requireCondition(metadata?.higherIsBetter === (field.name === "hits"), "Fixture ranking field direction differs from the independent verification contract.")
    }
  }
  const freezeCount = await tx.leaderboardFreeze.count({ where: { competitionId } })
  const penaltyCount = await tx.manualPenalty.count({ where: { competitionId } })
  const miscCount = await tx.miscEntry.count({ where: { element: { competitionId } } })
  requireCondition(freezeCount === 0 && penaltyCount === 0 && miscCount === 0, "Fixture freezes, manual penalties, or miscellaneous points invalidate this workload's scoring contract.")
  const results = await tx.result.findMany({ where: { element: { competitionId } }, select: { elementId: true, teamId: true, values: true, exceptionLabel: true, enteredByTokenId: true, updatedAt: true } })
  const scores = await tx.computedScore.findMany({ where: { element: { competitionId } }, select: { elementId: true, teamId: true, penaltyPoints: true } })
  const counts = { teams: teams.length, elements: elements.length, judgeTokens: tokens.length, results: results.length, computedScores: scores.length }
  if (statsOnly) return { passed: results.length === expectedCount && scores.length === expectedCount, mode: "statistics", counts }
  const issues = []
  const issue = (kind, elementId, teamId) => issues.push({ kind, ...(elementId ? { elementId } : {}), ...(teamId ? { teamId } : {}) })
  if (results.length !== expectedCount) issue("result_count")
  if (scores.length !== expectedCount) issue("computed_score_count")
  const resultMap = new Map()
  const scoreMap = new Map()
  for (const result of results) {
    const key = `${result.elementId}:${result.teamId}`
    if (resultMap.has(key)) issue("duplicate_result", result.elementId, result.teamId)
    resultMap.set(key, result)
    if (!teamMap.has(result.teamId) || !elementMap.has(result.elementId)) issue("foreign_result_identity", result.elementId, result.teamId)
    if (result.exceptionLabel !== null) issue("unexpected_result_exception", result.elementId, result.teamId)
    if (result.enteredByTokenId !== tokenIds.get(result.elementId)) issue("wrong_judge_provenance", result.elementId, result.teamId)
  }
  for (const score of scores) {
    const key = `${score.elementId}:${score.teamId}`
    if (scoreMap.has(key)) issue("duplicate_computed_score", score.elementId, score.teamId)
    scoreMap.set(key, score)
    if (!resultMap.has(key)) issue("orphan_computed_score", score.elementId, score.teamId)
  }
  let checkedScores = 0
  for (const judge of manifest.judges) {
    const elementResults = results.filter((row) => row.elementId === judge.elementId)
    const expected = expectedScores(elementResults, teamCount)
    for (const team of manifest.teams) {
      const key = `${judge.elementId}:${team.id}`
      const score = scoreMap.get(key)
      if (!resultMap.has(key)) issue("missing_result", judge.elementId, team.id)
      if (!score) issue("missing_computed_score", judge.elementId, team.id)
      else if (!Number.isFinite(score.penaltyPoints) || !Number.isFinite(expected.get(team.id)) || Math.abs(score.penaltyPoints - expected.get(team.id)) > 0.0000001) issue("computed_score_value", judge.elementId, team.id)
      else checkedScores++
    }
  }
  let acknowledgedValuesChecked = 0
  let changedResults = 0
  let failedAttemptsPersisted = 0
  let inFlightAttemptsPersisted = 0
  const failedAttemptStatuses = {}
  const clockToleranceMs = 30_000
  for (const [judgeIndex, judge] of manifest.judges.entries()) {
    for (const [teamIndex, team] of manifest.teams.entries()) {
      const key = `${judge.elementId}:${team.id}`
      const result = resultMap.get(key)
      const acknowledgment = acknowledgments?.writes.get(key)
      if (!result) {
        if (acknowledgment) issue("acknowledged_result_missing", judge.elementId, team.id)
        continue
      }
      const initial = { hits: (teamIndex * 37 + judgeIndex * 13) % 101, time_seconds: 120 + ((teamIndex * 17 + judgeIndex * 11) % 100) * 3 }
      const changed = !valuesEqual(result.values, initial)
      if (changed) changedResults++
      const attempt = acknowledgments?.attempts.get(key)
      if (attempt?.inFlight && changed && valuesEqual(result.values, attempt.values) && result.updatedAt.getTime() >= attempt.startedAt.getTime() - clockToleranceMs) inFlightAttemptsPersisted++
      if (attempt && attempt.status !== null && (attempt.status < 200 || attempt.status >= 300) && valuesEqual(result.values, attempt.values)) {
        failedAttemptsPersisted++
        failedAttemptStatuses[attempt.status] = (failedAttemptStatuses[attempt.status] ?? 0) + 1
      }
      if (acknowledgment) {
        if (!valuesEqual(result.values, acknowledgment.values)) issue("acknowledged_values_not_persisted", judge.elementId, team.id)
        else acknowledgedValuesChecked++
        if (result.updatedAt.getTime() < acknowledgment.startedAt.getTime() - clockToleranceMs || result.updatedAt.getTime() > acknowledgment.finishedAt.getTime() + clockToleranceMs) issue("acknowledged_write_outside_run_window", judge.elementId, team.id)
      } else if (changed) issue(acknowledgments ? "changed_without_success_acknowledgment" : "baseline_values_changed", judge.elementId, team.id)
    }
  }
  const issueCounts = {}
  for (const item of issues) issueCounts[item.kind] = (issueCounts[item.kind] ?? 0) + 1
  return { passed: issues.length === 0, mode: acknowledgments ? "final" : "baseline", counts, checkedScores, changedResults, acknowledgmentVerification: { available: Boolean(acknowledgments), runCount: acknowledgments?.runCount ?? 0, attemptedRequests: acknowledgments?.attemptedRequests ?? 0, acknowledgedRequests: acknowledgments?.acknowledgedRequests ?? 0, acknowledgedWrites: acknowledgments?.writes.size ?? 0, acknowledgedValuesChecked, failedAttemptsPersisted, inFlightAttemptsPersisted, failedAttemptStatuses, clockToleranceMs }, issueCounts, issueExamples: issues.slice(0, 50) }
}

function parseArguments(args) {
  const options = { statsOnly: false, summaries: [] }
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (arg === "--stats-only") options.statsOnly = true
    else if (["--manifest", "--harness-summary", "--report"].includes(arg)) {
      requireCondition(Boolean(args[index + 1]) && !args[index + 1].startsWith("--"), "A file option is missing its value.")
      const path = resolve(args[++index])
      if (arg === "--harness-summary") options.summaries.push(path)
      else options[arg.slice(2)] = path
    } else throw new VerificationError("Unknown argument. Use --help for usage.")
  }
  requireCondition(options.report, "An explicit --report output path is required.")
  return options
}

async function main() {
  if (process.argv.slice(2).includes("--help")) {
    console.log("Usage: node scripts/load-test/verify.mjs --report PATH [--manifest PATH] [--harness-summary PATH ...] [--stats-only]\nUses the same explicit dedicated-database and staging-origin guards as seed.mjs; never reads DATABASE_URL.\nAll database queries run inside a read-only transaction. Supports one-competition schema 1 and four-competition schema 2, including configured team counts and forty organizer role assignments. Output contains independent scores, acknowledged/in-flight write checks, and aggregate database/audit statistics; no tokens, personal details, or SQL query contents.\nWithout a harness summary, validates initial baseline values and scoring. Supply all runs' summaries when reusing a fixture. Concurrent runs for different competitions are allowed; overlapping runs for the same competition are rejected. --stats-only collects fixture counts and statistics. Reports are exclusively created with mode 0600.")
    return
  }
  const options = parseArguments(process.argv.slice(2))
  const config = readConfiguration({ allowWrites: false })
  const manifestPath = options.manifest ?? config.manifestPath
  requireCondition(options.report !== manifestPath && !options.summaries.includes(options.report), "The report output must differ from input file paths.")
  const manifest = validateManifest(await readJson(manifestPath, { privateFile: true }), config)
  const runs = []
  for (const path of options.summaries) runs.push(validateAcknowledgments(await readJson(path), manifest))
  const acknowledgments = mergeAcknowledgments(runs)
  const { PrismaClient } = await import("@prisma/client")
  const prisma = new PrismaClient({ datasources: { db: { url: config.databaseUrl } }, log: [] })
  let result
  try {
    result = await prisma.$transaction((tx) => verifyDatabase(tx, config, manifest, acknowledgments, options.statsOnly), { maxWait: 20_000, timeout: 60_000, isolationLevel: "RepeatableRead" })
  } finally { await prisma.$disconnect() }
  const report = { schemaVersion: manifest.schemaVersion, environment: "load-test", runId: manifest.runId, verifiedAt: new Date().toISOString(), readOnly: true, ...result }
  const handle = await open(options.report, "wx", 0o600)
  try {
    await handle.writeFile(`${JSON.stringify(report, (_, value) => typeof value === "bigint" ? value.toString() : value, 2)}\n`)
    await handle.sync()
  } finally { await handle.close() }
  console.log(JSON.stringify({ action: "read-only verification", passed: report.passed, mode: report.mode, counts: report.counts, issueCounts: report.issueCounts ?? {}, reportPath: options.report }))
  if (!report.passed) process.exitCode = 2
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    // Unknown Prisma/connection errors may embed secrets; print only fixed safe
    // guard messages or an allowlisted error code, never exception details.
    const code = typeof error?.code === "string" && /^[A-Z0-9_]+$/.test(error.code) ? error.code : "unreported internal error"
    const message = error instanceof VerificationError || error instanceof FixtureError ? error.message : error?.code === "EEXIST" ? "The report already exists; choose a new explicit output path." : `Read-only verification failed (${code}).`
    console.error(message)
    process.exitCode = 1
  })
}
