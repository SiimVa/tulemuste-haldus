import http from "k6/http"
import { check, sleep } from "k6"
import exec from "k6/execution"
import { Counter, Rate, Trend } from "k6/metrics"
import { abortEvaluationDelaySeconds, contentionPayload, loadConfig, organizerRscTree, rscTree, writePayload } from "./config.mjs"

let manifest
try { manifest = JSON.parse(open(__ENV.LOAD_TEST_FIXTURE || "./fixture-manifest.json")) } catch { throw new Error("Unable to read valid JSON from the private fixture manifest") }
const config = loadConfig(__ENV, manifest)
const fixture = config.fixture
const requestDuration = new Trend("request_duration", true)
const requestErrors = new Rate("request_errors")
const dataCorrect = new Rate("data_correct")
const responses5xx = new Counter("responses_5xx")
const responses429 = new Counter("responses_429")
const timeouts = new Counter("request_timeouts")
const transportErrors = new Counter("transport_errors")
const correctnessFailures = new Counter("correctness_failures")
const fixtureValidationFailures = new Counter("fixture_validation_failures")
const acknowledgedWrites = new Counter("acknowledged_writes")
const startedWrites = new Counter("started_writes")
const writeStartedAt = new Trend("write_started_at")
const writeStatus = new Trend("write_status")
const writeRespondedAt = new Trend("write_responded_at")
const loadStartedAt = new Trend("load_started_at")
const routeNames = ["leaderboard_ssr", `leaderboard_${config.publicRefreshMode}`, "overview_ssr", `overview_${config.publicRefreshMode}`, "judge_page", "judge_save", "leaderboard_verify"]
if (config.profile.organizerCount) routeNames.push("organizer_session", ...["overview", "leaderboard", "home"].flatMap(page => [`organizer_${page}_ssr`, `organizer_${page}_rsc`]))
const maxIterations = Math.ceil(config.profile.durationSeconds / config.intervalSeconds) + 2
const abortDelay = `${abortEvaluationDelaySeconds(config.plannedStartAt, __ENV.LOAD_TEST_STARTED_AT)}s`
const threshold = (expression, abort = false) => ({ threshold: expression, abortOnFail: abort, delayAbortEval: abortDelay })
const thresholds = {
  "request_errors{phase:load}": [threshold("rate<0.05", true)],
  "data_correct{phase:load}": [threshold("rate>0.99", true)],
  responses_429: [threshold("count==0", true)],
  responses_5xx: [threshold("count<5", true)],
  request_timeouts: [threshold("count<3", true)],
  fixture_validation_failures: ["count==0"],
  "http_req_duration{phase:load}": [threshold("p(95)<3000"), threshold("p(99)<8000")],
}
for (const route of routeNames) {
  thresholds[`request_duration{route:${route}}`] = [threshold("p(95)<3000"), threshold("p(99)<8000")]
}
for (const stage of config.profile.stageWindows) {
  thresholds[`request_duration{stage:${stage.label}}`] = [threshold("p(95)<3000"), threshold("p(99)<8000")]
}
// Safe metadata tags retain each successful acknowledgment in the final summary.
// No team/element pair repeats within either profile, so the verifier can compare
// every acknowledged payload directly with the final database state.
for (let judge = 0; judge < config.profile.judgeCount; judge++) {
  for (let iteration = 0; iteration < (config.mode === "contention" ? 1 : maxIterations); iteration++) {
    const key = config.mode === "contention" ? `c${judge}` : `j${judge}i${iteration}`
    thresholds[`acknowledged_writes{write_key:${key}}`] = ["count>=0"]
    thresholds[`started_writes{write_key:${key}}`] = ["count>=0"]
    thresholds[`write_started_at{write_key:${key}}`] = ["max>=0"]
    thresholds[`write_status{write_key:${key}}`] = ["max>=0"]
    thresholds[`write_responded_at{write_key:${key}}`] = ["max>=0"]
  }
}
const scenarios = config.mode === "contention" ? {
  contention: { executor: "per-vu-iterations", exec: "contention", vus: 10, iterations: 1, maxDuration: "30s", gracefulStop: "5s" },
} : {
  spectators: config.profile.viewerStages ? {
    executor: "ramping-vus", exec: "spectator", startVUs: 0,
    stages: config.profile.viewerStages, gracefulRampDown: "5s", gracefulStop: "5s",
  } : {
    executor: "constant-vus", exec: "spectator", vus: config.profile.spectatorCount,
    duration: `${config.profile.durationSeconds}s`, gracefulStop: "5s",
  },
}
for (let index = 0; config.mode !== "contention" && index < config.profile.judgeCount; index++) {
  scenarios[`judge_${String(index + 1).padStart(2, "0")}`] = {
    executor: "constant-vus", exec: "judge", vus: 1,
    duration: `${config.profile.durationSeconds}s`, gracefulStop: "5s",
    env: { LOAD_TEST_JUDGE_INDEX: String(index) },
  }
}
for (let index = 0; index < (config.profile.organizerCount || 0); index++) {
  scenarios[`organizer_${String(index + 1).padStart(2, "0")}`] = {
    executor: "constant-vus", exec: "organizer", vus: 1,
    duration: `${config.profile.durationSeconds}s`, gracefulStop: "5s",
    env: { LOAD_TEST_ORGANIZER_INDEX: String(index) },
  }
}

export const options = {
  scenarios,
  thresholds,
  setupTimeout: config.schemaVersion === 2 ? "15m" : "2m",
  teardownTimeout: "30s",
  summaryTrendStats: ["min", "avg", "med", "max", "p(90)", "p(95)", "p(99)"],
  // URL and transport error text are deliberately excluded: /judge URLs carry tokens.
  systemTags: ["status", "method", "name", "group", "check", "scenario", "expected_response", "error_code"],
  userAgent: "Synthetic staging load test (k6)",
  maxRedirects: 0,
}

function stageName() {
  const elapsed = (Date.now() - exec.scenario.startTime) / 1000
  return config.profile.stageWindows.find(stage => elapsed >= stage.start && elapsed < stage.end)?.label || "cooldown"
}

function requestParams(route, phase, headers = {}) {
  return {
    headers, timeout: config.timeout, redirects: 0,
    tags: { name: route, route, phase, stage: phase === "load" ? stageName() : phase },
    ...(headers.Cookie ? { jar: new http.CookieJar() } : {}),
  }
}

function assess(response, valid, route, phase) {
  const tags = { route, phase, stage: phase === "load" ? stageName() : phase }
  const failed = response.status !== 200
  requestDuration.add(response.timings.duration, tags)
  requestErrors.add(failed, tags)
  dataCorrect.add(valid, tags)
  responses5xx.add(response.status >= 500 ? 1 : 0, tags)
  responses429.add(response.status === 429 ? 1 : 0, tags)
  timeouts.add(response.error_code === 1050 ? 1 : 0, tags)
  transportErrors.add(response.status === 0 && response.error_code !== 1050 ? 1 : 0, tags)
  correctnessFailures.add(response.status === 200 && !valid ? 1 : 0, tags)
  check(response, { [`${route}: HTTP 200`]: () => !failed, [`${route}: expected fixture data`]: () => valid }, tags)
  return !failed && valid
}

function pageValid(response, page, rsc) {
  const body = response.body || ""
  const type = String(response.headers["Content-Type"] || "").toLowerCase()
  if (response.status !== 200 || !type.includes(rsc ? "text/x-component" : "text/html")) return false
  if (!body.includes(fixture.competition.name)) return false
  if (page === "leaderboard") {
    return fixture.teams.every(team => body.includes(team.id) && body.includes(team.name)) && body.includes("Pingerida")
  }
  return body.includes("Võistluse ülevaade") && !body.includes("NEXT_NOT_FOUND")
}

function getPublic(page, rsc, phase) {
  if (rsc && config.publicRefreshMode === "json") return getPublicSnapshot(page, phase)
  const route = `${page === "leaderboard" ? "leaderboard" : "overview"}_${rsc ? "rsc" : "ssr"}`
  const path = page === "leaderboard" ? config.routes.publicPage : config.routes.overviewPage
  const headers = rsc ? { Rsc: "1", "Next-Router-State-Tree": rscTree(fixture.competition.id, page === "leaderboard" ? "leaderboard" : "dashboard") } : { Accept: "text/html" }
  // Next also adds an _rsc cache key; refresh requests are never prefetch requests.
  const url = config.baseUrl + path + (rsc ? `?_rsc=load${Date.now().toString(36)}` : "")
  const response = http.get(url, requestParams(route, phase, headers))
  return assess(response, pageValid(response, page, rsc), route, phase)
}

function getPublicSnapshot(page, phase) {
  const route = `${page === "leaderboard" ? "leaderboard" : "overview"}_json`
  const path = page === "leaderboard" ? config.routes.publicLeaderboardSnapshot : config.routes.publicDashboardSnapshot
  const response = http.get(config.baseUrl + path, requestParams(route, phase, { Accept: "application/json" }))
  let body
  try { body = response.json() } catch { body = null }
  const validBase = response.status === 200 && String(response.headers["Content-Type"] || "").includes("application/json")
    && body?.competition?.id === fixture.competition.id && body.competition.name === fixture.competition.name
  const valid = page === "leaderboard" ? validBase && body.schemaVersion === 1 && body.freezeAt === null
    && body.ranked?.length === fixture.teams.length && body.elements?.length === fixture.judges.length
    && new Set(body.ranked.map(row => row.team?.id)).size === fixture.teams.length
    && body.ranked.every(row => fixture.teams.some(team => team.id === row.team?.id)
      && Number.isFinite(row.total) && row.points?.length === fixture.judges.length && row.points.every(Number.isFinite))
    : validBase && body.audience === "public" && body.freeze === null && Array.isArray(body.widgets)
      && body.widgets.includes("summary") && body.widgets.includes("elementProgress") && body.summary && body.elementProgress?.length === fixture.judges.length
  return assess(response, Boolean(valid), route, phase)
}

function leaderboardValid(body) {
  if (!Array.isArray(body?.leaderboard) || body.leaderboard.length !== fixture.teams.length
    || !Array.isArray(body.elements) || body.elements.length !== fixture.judges.length
    || body.scoringMode !== fixture.competition.scoringMode || body.frozenAt !== null) return false
  const teams = new Set(fixture.teams.map(team => team.id))
  const elements = new Set(fixture.judges.map(judge => judge.elementId))
  if (new Set(body.leaderboard.map(row => row.team?.id)).size !== teams.size) return false
  if (!body.elements.every(element => elements.has(element.id))) return false
  return body.leaderboard.every(row => teams.has(row.team?.id)
    && Number.isFinite(row.total) && Number.isFinite(row.kpTotal) && Number.isFinite(row.manualTotal)
    && Object.keys(row.byElement || {}).length === elements.size
    && Object.entries(row.byElement || {}).every(([id, score]) => elements.has(id) && Number.isFinite(score)))
}

function verifyLeaderboard(phase) {
  const response = http.get(config.baseUrl + config.routes.leaderboardApi, requestParams("leaderboard_verify", phase))
  let body
  try { body = response.json() } catch { body = null }
  return assess(response, response.status === 200 && leaderboardValid(body), "leaderboard_verify", phase)
}

export function setup() {
  const startedAt = new Date().toISOString()
  const valid = [getPublic("leaderboard", false, "preflight"), getPublic("overview", false, "preflight"),
    getPublic("leaderboard", true, "preflight"), getPublic("overview", true, "preflight"), verifyLeaderboard("preflight")]
  if (config.profile.organizerCount) {
    // Validate all ten private identities and competition memberships, even in smoke.
    for (const user of fixture.organizers) {
      const response = http.get(config.baseUrl + "/api/auth/session", requestParams("organizer_session", "preflight", organizerHeaders(user)))
      let session
      try { session = response.json() } catch { session = null }
      valid.push(assess(response, response.status === 200 && session?.user?.id === user.userId && session?.user?.role === "USER", "organizer_session", "preflight"))
      valid.push(getOrganizer(user, "overview", false, "preflight"))
    }
    for (const page of ["overview", "leaderboard", "home"]) valid.push(getOrganizer(fixture.organizers[0], page, true, "preflight"))
  }
  fixtureValidationFailures.add(valid.filter(value => !value).length)
  if (valid.some(value => !value)) exec.test.abort("Staging fixture preflight failed; no judge saves started")
  if (config.schemaVersion === 2) console.log("LOAD_TEST_READY:" + JSON.stringify({ competitionIndex: config.competitionIndex,
    runId: __ENV.LOAD_TEST_RUN_ID, profile: config.mode, at: new Date().toISOString() }))
  if (config.plannedStartAt) {
    const planned = Date.parse(config.plannedStartAt)
    if (Date.now() > planned + 2000) {
      fixtureValidationFailures.add(1)
      exec.test.abort("Coordinated start deadline was missed; no judge saves started")
    }
    while (Date.now() < planned) sleep(Math.min(30, (planned - Date.now()) / 1000))
  }
  loadStartedAt.add(Date.now())
  if (config.schemaVersion === 2) console.log("LOAD_TEST_LOAD_STARTED:" + JSON.stringify({ competitionIndex: config.competitionIndex,
    runId: __ENV.LOAD_TEST_RUN_ID, profile: config.mode, at: new Date().toISOString() }))
  return { startedAt }
}

function organizerHeaders(user) {
  return { Cookie: `${user.sessionCookieName}=${user.sessionCookieValue}` }
}

function getOrganizer(user, page, rsc, phase) {
  const route = `organizer_${page}_${rsc ? "rsc" : "ssr"}`
  const path = config.routes[`organizer${page[0].toUpperCase()}${page.slice(1)}`]
  const headers = { ...organizerHeaders(user), Accept: rsc ? "*/*" : "text/html" }
  if (rsc) Object.assign(headers, { Rsc: "1", "Next-Router-State-Tree": organizerRscTree(fixture.competition.id, page === "home" ? "" : page) })
  const response = http.get(config.baseUrl + path + (rsc ? `?_rsc=load${Date.now().toString(36)}` : ""), requestParams(route, phase, headers))
  const body = response.body || ""
  const type = String(response.headers["Content-Type"] || "").toLowerCase()
  const marker = page === "overview" ? "Statistika" : page === "home" ? "Hindamiselemendid" : "Pingerida"
  const valid = response.status === 200 && type.includes(rsc ? "text/x-component" : "text/html")
    && !response.headers.Location && !body.includes("NEXT_REDIRECT") && !body.includes("NEXT_NOT_FOUND")
    && body.includes(fixture.competition.name) && body.includes(user.name) && body.includes(marker)
    && (page !== "leaderboard" || fixture.teams.every(team => body.includes(team.name)))
  return assess(response, valid, route, phase)
}

let organizerOpened = false
let nextOrganizerAt = 0
export function organizer() {
  const index = Number(__ENV.LOAD_TEST_ORGANIZER_INDEX)
  const user = fixture.organizers[index]
  const page = ["overview", "leaderboard", "home"][index % 3]
  if (!organizerOpened) {
    sleep(index * config.organizerIntervalSeconds / config.profile.organizerCount)
    organizerOpened = true
    nextOrganizerAt = Date.now()
  }
  if (!getOrganizer(user, page, exec.scenario.iterationInInstance > 0, "load")) {
    exec.test.abort("Authenticated organizer page failed; stopping further load")
  }
  nextOrganizerAt = Math.max(nextOrganizerAt + config.organizerIntervalSeconds * 1000, Date.now() + 1000)
  sleep(Math.max(0, (nextOrganizerAt - Date.now()) / 1000))
}

let spectatorOpened = false
let nextViewerAt = 0
export function spectator() {
  const page = exec.vu.idInTest % 2 === 0 ? "leaderboard" : "overview"
  if (!spectatorOpened) {
    sleep((exec.vu.idInTest % 17) / 17 * 3)
    spectatorOpened = true
    nextViewerAt = Date.now()
    getPublic(page, false, "load")
  } else {
    getPublic(page, true, "load")
  }
  nextViewerAt = Math.max(nextViewerAt + config.intervalSeconds * 1000, Date.now() + 1000)
  sleep(Math.max(0, (nextViewerAt - Date.now()) / 1000))
}

let judgeOpened = false
let nextJudgeAt = 0
export function judge() {
  const judgeIndex = Number(__ENV.LOAD_TEST_JUDGE_INDEX)
  const worker = fixture.judges[judgeIndex]
  const iteration = exec.scenario.iterationInInstance
  if (!judgeOpened) {
    sleep(judgeIndex * config.intervalSeconds / config.profile.judgeCount)
    const response = http.get(config.baseUrl + worker.judgePath, requestParams("judge_page", "load", { Accept: "text/html" }))
    const valid = response.status === 200 && String(response.headers["Content-Type"] || "").includes("text/html")
      && (response.body || "").includes(fixture.competition.name)
      && (response.body || "").includes(worker.elementId) && fixture.teams.every(team => (response.body || "").includes(team.id))
    if (!assess(response, valid, "judge_page", "load")) exec.test.abort("Judge fixture page failed; stopping before further saves")
    judgeOpened = true
    nextJudgeAt = Date.now()
  }
  const payload = writePayload(judgeIndex, iteration, fixture.teams)
  saveResult(worker, payload, `j${judgeIndex}i${iteration}`)
  // A slow save never causes a catch-up burst into the shared write limiter.
  nextJudgeAt = Math.max(nextJudgeAt + config.intervalSeconds * 1000, Date.now() + 1000)
  sleep(Math.max(0, (nextJudgeAt - Date.now()) / 1000))
}

function saveResult(worker, payload, writeKey) {
  // Record intent before blocking on HTTP so an abort retains in-flight saves.
  writeStartedAt.add(Date.now(), { write_key: writeKey })
  startedWrites.add(1, { write_key: writeKey })
  const response = http.post(config.baseUrl + worker.resultsPath, JSON.stringify(payload.body), requestParams("judge_save", "load", {
    "Content-Type": "application/json", "x-access-token": worker.token,
  }))
  let saved
  try { saved = response.json() } catch { saved = null }
  let savedValues
  try { savedValues = JSON.parse(saved?.values) } catch { savedValues = null }
  const valid = response.status === 200 && !saved?.deleted && saved?.elementId === worker.elementId
    && saved?.teamId === payload.body.teamId && saved?.exceptionLabel === null
    && Object.entries(payload.body.values).every(([key, value]) => String(savedValues?.[key]) === value)
  writeStatus.add(response.status, { write_key: writeKey })
  writeRespondedAt.add(Date.now(), { write_key: writeKey })
  if (assess(response, valid, "judge_save", "load")) {
    acknowledgedWrites.add(1, { write_key: writeKey })
  }
}

export function contention() {
  const workerIndex = exec.scenario.iterationInTest
  saveResult(fixture.judges[0], contentionPayload(workerIndex, fixture.teams), `c${workerIndex}`)
}

export function teardown() {
  // Read the state as written, without recalculation or any repair.
  fixtureValidationFailures.add(verifyLeaderboard("postflight") ? 0 : 1)
}

function htmlEscape(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

export function handleSummary(data) {
  const writes = []
  const attempts = []
  const metrics = {}
  for (const [name, metric] of Object.entries(data.metrics)) {
    const matched = /^started_writes\{write_key:(j(\d+)i(\d+)|c(\d+))\}$/.exec(name)
    if (matched && metric.values.count > 0) {
      const isContention = matched[4] !== undefined
      const judgeIndex = isContention ? 0 : Number(matched[2])
      const iteration = isContention ? 0 : Number(matched[3])
      const workerIndex = isContention ? Number(matched[4]) : judgeIndex
      const payload = isContention ? contentionPayload(workerIndex, fixture.teams) : writePayload(judgeIndex, iteration, fixture.teams)
      const startedAtMs = data.metrics[`write_started_at{write_key:${matched[1]}}`]?.values?.max
      if (!startedAtMs || startedAtMs <= 0) continue
      const respondedAtMs = data.metrics[`write_responded_at{write_key:${matched[1]}}`]?.values?.max
      const acknowledged = data.metrics[`acknowledged_writes{write_key:${matched[1]}}`]?.values?.count > 0
      const record = { judgeIndex, iteration, workerIndex, teamIndex: payload.teamIndex, elementId: fixture.judges[judgeIndex].elementId,
        teamId: payload.body.teamId, values: payload.body.values,
        startedAt: new Date(startedAtMs).toISOString(), respondedAt: respondedAtMs ? new Date(respondedAtMs).toISOString() : null,
        status: respondedAtMs ? data.metrics[`write_status{write_key:${matched[1]}}`]?.values?.max ?? null : null,
        inFlight: !respondedAtMs }
      attempts.push(record)
      if (acknowledged) writes.push({ ...record, status: 200, inFlight: false })
    } else if (!["acknowledged_writes{", "started_writes{", "write_started_at{", "write_status{", "write_responded_at{"].some(prefix => name.startsWith(prefix))) {
      metrics[name] = metric
    }
  }
  writes.sort((a, b) => a.judgeIndex - b.judgeIndex || a.iteration - b.iteration)
  const failedThresholds = Object.entries(metrics).flatMap(([name, metric]) => Object.entries(metric.thresholds || {})
    .filter(([, result]) => !result.ok).map(([expression]) => `${name}: ${expression}`))
  const report = {
    schemaVersion: config.schemaVersion,
    runId: __ENV.LOAD_TEST_RUN_ID || `${Date.now()}-${config.mode}`,
    profile: config.mode,
    host: config.host,
    startedAt: __ENV.LOAD_TEST_STARTED_AT,
    plannedStartAt: config.plannedStartAt,
    loadStartedAt: data.metrics.load_started_at?.values?.max ? new Date(data.metrics.load_started_at.values.max).toISOString() : null,
    finishedAt: new Date().toISOString(),
    elapsedSeconds: data.state.testRunDurationMs / 1000,
    plan: { spectators: config.profile.spectatorCount, judges: config.profile.judgeCount,
      publicRefreshMode: config.publicRefreshMode,
      organizers: config.profile.organizerCount || 0, organizerRefreshSeconds: config.organizerIntervalSeconds,
      refreshSeconds: config.mode === "contention" ? null : config.intervalSeconds,
      judgeSavesPerMinute: config.mode === "contention" ? null : config.profile.judgeCount * 2,
      ...(config.mode === "contention" ? { simultaneousSaves: 10, distinctCheckpoints: 1 } : {}), stages: config.profile.stageWindows },
    fixture: { runId: fixture.runId, competitionId: fixture.competition.id, competitionIndex: config.competitionIndex,
      teams: fixture.teams.length, elements: fixture.judges.length, organizers: fixture.organizers?.length || 0 },
    passed: failedThresholds.length === 0,
    failedThresholds,
    metrics,
    writes,
    attempts,
  }
  const routeRows = Object.entries(metrics).filter(([name]) => name.startsWith("request_duration{"))
    .map(([name, metric]) => `<tr><td>${htmlEscape(name)}</td>${["avg", "p(95)", "p(99)", "max"].map(key => `<td>${Number(metric.values[key] || 0).toFixed(1)}</td>`).join("")}</tr>`).join("")
  const count = name => metrics[name]?.values?.count || 0
  const workloadDescription = config.mode === "contention" ? "10 simultaneous saves to one checkpoint, with distinct teams." : `${config.profile.spectatorCount} spectators, ${config.profile.judgeCount} judges, ${config.profile.organizerCount || 0} organizers; public refreshes and judge saves every 30 seconds, organizer views every 60 seconds.`
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Staging load-test report</title><style>body{font:16px system-ui;max-width:1100px;margin:40px auto;padding:0 20px;color:#172130}table{border-collapse:collapse;width:100%;font-size:14px}td,th{padding:10px;border-bottom:1px solid #dce3ec;text-align:right}td:first-child,th:first-child{text-align:left}.pass{color:#126f44}.fail{color:#a02222}pre{white-space:pre-wrap;background:#f2f5f9;padding:16px}</style><h1>Staging load test: ${htmlEscape(config.mode)}</h1><p>${htmlEscape(config.host)} · ${htmlEscape(report.startedAt)} · ${report.elapsedSeconds.toFixed(1)} seconds</p><p class="${report.passed ? "pass" : "fail"}">${report.passed ? "Thresholds passed" : "Thresholds failed"}</p><p>${htmlEscape(workloadDescription)}</p><p>5xx: ${count("responses_5xx")} · 429: ${count("responses_429")} · timeouts: ${count("request_timeouts")} · other transport errors: ${count("transport_errors")} · incorrect 200 responses: ${count("correctness_failures")} · acknowledged saves: ${writes.length}</p><table><thead><tr><th>Route / stage</th><th>Average ms</th><th>p95 ms</th><th>p99 ms</th><th>Maximum ms</th></tr></thead><tbody>${routeRows}</tbody></table><pre>${htmlEscape(failedThresholds.length ? failedThresholds.join("\n") : "No failed thresholds. Database consistency is verified separately against the acknowledgment records in summary.json.")}</pre><p>HTTP workload only: initial SSR and subsequent RSC refreshes. Browser asset loading, client rendering, and many independent mobile networks are outside this measurement.</p></html>`
  const directory = __ENV.LOAD_TEST_REPORT_DIR || "."
  return {
    [`${directory}/summary.json`]: JSON.stringify(report, null, 2),
    [`${directory}/report.html`]: html,
    stdout: JSON.stringify({ profile: report.profile, passed: report.passed, elapsedSeconds: report.elapsedSeconds,
      requests: count("http_reqs"), acknowledgedSaves: writes.length, responses5xx: count("responses_5xx"), responses429: count("responses_429"),
      timeouts: count("request_timeouts"), transportErrors: count("transport_errors"), correctnessFailures: count("correctness_failures"), failedThresholds }, null, 2) + "\n",
  }
}
