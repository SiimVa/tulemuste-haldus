export const PROFILES = {
  smoke: {
    spectatorCount: 8,
    judgeCount: 2,
    durationSeconds: 90,
    viewerStages: null,
    stageWindows: [{ start: 0, end: 90, label: "smoke" }],
  },
  staged: {
    spectatorCount: 300,
    judgeCount: 20,
    durationSeconds: 750,
    viewerStages: [
      { duration: "20s", target: 10 },
      { duration: "100s", target: 10 },
      { duration: "30s", target: 50 },
      { duration: "90s", target: 50 },
      { duration: "30s", target: 100 },
      { duration: "90s", target: 100 },
      { duration: "60s", target: 300 },
      { duration: "300s", target: 300 },
      { duration: "30s", target: 0 },
    ],
    stageWindows: [
      { start: 0, end: 120, label: "10" },
      { start: 120, end: 240, label: "50" },
      { start: 240, end: 360, label: "100" },
      { start: 360, end: 720, label: "300" },
      { start: 720, end: 750, label: "cooldown" },
    ],
  },
  contention: {
    spectatorCount: 0,
    judgeCount: 10,
    durationSeconds: 30,
    viewerStages: null,
    stageWindows: [{ start: 0, end: 30, label: "contention" }],
  },
  "event-smoke": {
    spectatorCount: 6, judgeCount: 2, organizerCount: 2, durationSeconds: 90,
    viewerStages: null, stageWindows: [{ start: 0, end: 90, label: "smoke" }],
  },
  event: {
    spectatorCount: 150, judgeCount: 20, organizerCount: 10, durationSeconds: 630,
    viewerStages: [
      { duration: "30s", target: 25 }, { duration: "90s", target: 25 },
      { duration: "30s", target: 75 }, { duration: "90s", target: 75 },
      { duration: "60s", target: 150 }, { duration: "300s", target: 150 },
      { duration: "30s", target: 0 },
    ],
    stageWindows: [
      { start: 0, end: 120, label: "25" }, { start: 120, end: 240, label: "75" },
      { start: 240, end: 600, label: "150" }, { start: 600, end: 630, label: "cooldown" },
    ],
  },
}

export function selectFixture(env, manifest) {
  if (manifest.schemaVersion === 1) return manifest
  if (manifest.schemaVersion !== 2 || manifest.environment !== "load-test" || manifest.competitionCount !== 4
    || !Array.isArray(manifest.competitions) || manifest.competitions.length !== 4
    || new Set(manifest.competitions.map(item => item.competition?.id)).size !== 4) {
    throw new Error("A valid schemaVersion 1 or four-competition schemaVersion 2 fixture is required")
  }
  if (!/^[0-3]$/.test(String(env.LOAD_TEST_COMPETITION_INDEX ?? ""))) {
    throw new Error("SchemaVersion 2 requires LOAD_TEST_COMPETITION_INDEX from 0 to 3")
  }
  const competitionIndex = Number(env.LOAD_TEST_COMPETITION_INDEX)
  return { ...manifest.competitions[competitionIndex], schemaVersion: 2, environment: manifest.environment,
    runId: manifest.runId, baseUrl: manifest.baseUrl, competitionIndex }
}

export function abortEvaluationDelaySeconds(plannedStartAt, processStartedAt, now = Date.now()) {
  if (!plannedStartAt) return 30
  const started = Date.parse(processStartedAt)
  const waitingSeconds = Math.max(0, (Date.parse(plannedStartAt) - (Number.isFinite(started) ? started : now)) / 1000)
  // k6 counts delayAbortEval from process start, including setup and its start gate.
  return Math.ceil(waitingSeconds) + 30
}

export function loadConfig(env, manifest) {
  const mode = env.LOAD_TEST_PROFILE || "smoke"
  const profile = PROFILES[mode]
  if (!profile) throw new Error("Unknown load-test profile")
  const fixture = selectFixture(env, manifest)
  if (manifest.schemaVersion === 2 && !["event", "event-smoke"].includes(mode)) throw new Error("SchemaVersion 2 requires event or event-smoke profile")
  if (manifest.schemaVersion === 1 && ["event", "event-smoke"].includes(mode)) throw new Error("Event profiles require schemaVersion 2")
  // Accept an origin only: no credentials, path, query, or fragment.
  const origin = String(env.LOAD_TEST_BASE_URL || "").replace(/\/$/, "")
  const parts = /^(https?):\/\/(\[[a-f0-9:]+\]|[a-z0-9.-]+)(?::(\d{1,5}))?$/i.exec(origin)
  if (!parts) throw new Error("LOAD_TEST_BASE_URL must be an explicit staging origin")
  const host = parts[2].toLowerCase()
  if (host.endsWith(".")) throw new Error("Staging hostname must not have a trailing DNS dot")
  if (host === "matkamang.ee" || host.endsWith(".matkamang.ee")) {
    throw new Error("Production matkamang.ee hosts are forbidden by this harness")
  }
  if (host !== String(env.LOAD_TEST_ALLOWED_HOST || "").toLowerCase()) {
    throw new Error("LOAD_TEST_ALLOWED_HOST must exactly match the staging hostname")
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(host)
  if (parts[1].toLowerCase() !== "https" && !local) throw new Error("Staging requires HTTPS")
  if (env.LOAD_TEST_ALLOW_WRITES !== "1") throw new Error("Set LOAD_TEST_ALLOW_WRITES=1 for the synthetic judge fixture")
  if (![1, 2].includes(manifest.schemaVersion) || manifest.environment !== "load-test") {
    throw new Error("A schemaVersion 1 or 2 load-test fixture manifest is required")
  }
  if (String(manifest.baseUrl || "").replace(/\/$/, "") !== origin) {
    throw new Error("Fixture baseUrl does not match the explicit staging origin")
  }
  const competition = fixture.competition || {}
  const supportedTeamCount = manifest.schemaVersion === 1 ? competition.teamCount === 100 : [100, 150, 200].includes(competition.teamCount)
  if (!competition.id || !supportedTeamCount || competition.elementCount !== 20) {
    throw new Error("Fixture has an unsupported team count or does not contain 20 elements")
  }
  if (!Array.isArray(fixture.teams) || fixture.teams.length !== competition.teamCount || new Set(fixture.teams.map(t => t.id)).size !== competition.teamCount) {
    throw new Error("Fixture team count and distinct team IDs must match")
  }
  if (!Array.isArray(fixture.judges) || fixture.judges.length !== 20
    || new Set(fixture.judges.map(j => j.elementId)).size !== 20
    || new Set(fixture.judges.map(j => j.token)).size !== 20) {
    throw new Error("Fixture must contain 20 distinct checkpoint-scoped judge tokens")
  }
  const routes = {
    publicPage: `/public/${competition.id}/leaderboard`,
    overviewPage: `/public/${competition.id}/dashboard`,
    leaderboardApi: `/api/competitions/${competition.id}/leaderboard`,
  }
  for (const [key, expected] of Object.entries(routes)) {
    if (fixture.routes?.[key] !== expected) throw new Error(`Fixture ${key} does not match the competition route`)
  }
  const publicRefreshMode = env.LOAD_TEST_PUBLIC_REFRESH_MODE || "rsc"
  if (!["rsc", "json"].includes(publicRefreshMode)) throw new Error("Public refresh mode must be rsc or json")
  Object.assign(routes, {
    publicLeaderboardSnapshot: `/api/public/competitions/${competition.id}/leaderboard`,
    publicDashboardSnapshot: `/api/public/competitions/${competition.id}/dashboard`,
  })
  for (const judge of fixture.judges) {
    if (!judge.elementId || !judge.token
      || judge.resultsPath !== `/api/elements/${judge.elementId}/results`
      || judge.judgePath !== `/judge/${judge.token}`
      || !judge.fieldNames?.includes("time_seconds") || !judge.fieldNames?.includes("hits")) {
      throw new Error("Fixture judge routes and supported input fields must match its token and checkpoint")
    }
  }
  if (manifest.schemaVersion === 2) {
    Object.assign(routes, { organizerOverview: `/dashboard/competitions/${competition.id}/overview`,
      organizerLeaderboard: `/dashboard/competitions/${competition.id}/leaderboard`, organizerHome: `/dashboard/competitions/${competition.id}` })
    if (!Array.isArray(fixture.organizers) || fixture.organizers.length !== 10
      || new Set(fixture.organizers.map(user => user.userId)).size !== 10
      || new Set(fixture.organizers.map(user => user.sessionCookieValue)).size !== 10
      || fixture.organizers.some(user => user.role !== "ORGANIZER" || user.systemRole !== "USER"
        || !["__Secure-authjs.session-token", "authjs.session-token"].includes(user.sessionCookieName)
        || !user.sessionCookieValue || !user.name)) throw new Error("Each competition requires ten distinct private organizer sessions")
  }
  const plannedStartAt = env.LOAD_TEST_PLANNED_START_AT || null
  if ((mode === "event" && !plannedStartAt) || (plannedStartAt && (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(plannedStartAt) || !Number.isFinite(Date.parse(plannedStartAt))))) {
    throw new Error("Event profile requires a common ISO UTC LOAD_TEST_PLANNED_START_AT")
  }
  return { mode, profile, fixture, schemaVersion: manifest.schemaVersion, competitionIndex: fixture.competitionIndex ?? 0,
    plannedStartAt, publicRefreshMode, baseUrl: origin, host, routes, intervalSeconds: 30, organizerIntervalSeconds: 60, timeout: "15s" }
}

export function writePayload(judgeIndex, iteration, teams) {
  const teamIndex = (judgeIndex * 5 + iteration) % teams.length
  return {
    teamIndex,
    body: {
      teamId: teams[teamIndex].id,
      values: {
        time_seconds: String(180 + judgeIndex * 7 + teamIndex * 3 + iteration),
        hits: String(5 + (teamIndex + judgeIndex + iteration) % 90),
      },
      exceptionLabel: null,
    },
  }
}

export function contentionPayload(workerIndex, teams) {
  return {
    teamIndex: workerIndex,
    body: { teamId: teams[workerIndex].id, values: {
      time_seconds: String(600 + workerIndex), hits: String(90 - workerIndex),
    }, exceptionLabel: null },
  }
}

export function rscTree(competitionId, leaf) {
  return encodeURIComponent(JSON.stringify([
    "", { children: ["public", { children: [["id", competitionId, "d"], {
      children: [leaf, { children: ["__PAGE__", {}, null, null] }, null, null],
    }, null, null] }, null, null] }, null, "refetch",
  ]))
}

export function organizerRscTree(competitionId, leaf) {
  const page = ["__PAGE__", {}, null, null]
  const competition = [["id", competitionId, "d"], { children: leaf ? [leaf, { children: page }, null, null] : page }, null, null]
  return encodeURIComponent(JSON.stringify(["", { children: ["dashboard", { children: ["competitions", { children: competition }, null, null] }, null, null] }, null, "refetch"]))
}
