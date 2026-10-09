import { spawn } from "node:child_process"
import { readFile, mkdir, lstat } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { loadConfig } from "./config.mjs"

const directory = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const mode = args.find(value => value !== "--check") || "smoke"
if (args.some(value => !["smoke", "staged", "contention", "event-smoke", "event", "--check"].includes(value))) {
  console.error("Usage: node scripts/load-test/run.mjs [smoke|staged|contention|event-smoke|event] [--check]")
  process.exit(1)
}

try {
  const fixturePath = path.resolve(process.env.LOAD_TEST_FIXTURE || path.join(directory, "fixture-manifest.json"))
  const fixtureStat = await lstat(fixturePath)
  if (!fixtureStat.isFile() || (fixtureStat.mode & 0o077) !== 0) throw new Error("Fixture must be a regular private file (chmod 600)")
  let fixture
  try { fixture = JSON.parse(await readFile(fixturePath, "utf8")) } catch { throw new Error("Unable to read valid JSON from the private fixture manifest") }
  const config = loadConfig({ ...process.env, LOAD_TEST_PROFILE: mode }, fixture)
  const startedAt = new Date().toISOString()
  const runId = `${startedAt.replace(/[:.]/g, "-")}-${mode}-c${config.competitionIndex}`
  const reportDirectory = path.resolve(process.env.LOAD_TEST_REPORT_DIR || path.join(directory, "artifacts", `${startedAt.replace(/[:.]/g, "-")}-${mode}`))
  const plan = { profile: mode, host: config.host, spectators: config.profile.spectatorCount, judges: config.profile.judgeCount,
    organizers: config.profile.organizerCount || 0, competitionIndex: config.competitionIndex,
    plannedStartAt: config.plannedStartAt, organizerRefreshSeconds: config.organizerIntervalSeconds,
    durationSeconds: config.profile.durationSeconds, refreshSeconds: config.mode === "contention" ? null : config.intervalSeconds,
    judgeSavesPerMinute: config.mode === "contention" ? null : config.profile.judgeCount * 2,
    ...(config.mode === "contention" ? { simultaneousSaves: 10, distinctCheckpoints: 1 } : {}),
    fixtureTeams: config.fixture.teams.length, fixtureElements: config.fixture.judges.length, reportDirectory }
  console.log(JSON.stringify(plan, null, 2))
  if (args.includes("--check")) process.exit(0)
  await mkdir(reportDirectory, { recursive: true, mode: 0o700 })
  // Disallow inherited k6 debug/output integrations from leaking token URLs.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("K6_")))
  Object.assign(env, { LOAD_TEST_PROFILE: mode, LOAD_TEST_FIXTURE: fixturePath, LOAD_TEST_REPORT_DIR: reportDirectory, LOAD_TEST_RUN_ID: runId,
    LOAD_TEST_STARTED_AT: startedAt, K6_NO_USAGE_REPORT: "true", K6_NO_COLOR: "true", K6_SUMMARY_MODE: "full" })
  const binary = process.env.LOAD_TEST_K6_BINARY || "k6"
  const child = spawn(binary, ["run", "--quiet", "--log-output", "none", "--no-usage-report", path.join(directory, "k6.js")], {
    cwd: directory, env, stdio: "inherit",
  })
  child.on("error", error => {
    console.error(error.code === "ENOENT" ? "k6 is unavailable; install it or set LOAD_TEST_K6_BINARY" : "Unable to start k6")
    process.exitCode = 1
  })
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal))
  child.on("exit", (code, signal) => {
    if (signal) console.error(`Load test stopped by ${signal}`)
    console.log(`Reports: ${reportDirectory}`)
    process.exitCode = code ?? 1
  })
} catch (error) {
  console.error(error?.code === "ENOENT" ? "Fixture manifest is missing; seed the isolated staging database first" : error.message)
  process.exitCode = 1
}
