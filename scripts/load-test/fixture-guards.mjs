import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..")

export class FixtureError extends Error {}

function requireEnvironment(name, expected) {
  const value = process.env[name]?.trim()
  if (!value || (expected !== undefined && value !== expected)) {
    throw new FixtureError(`${name} ${expected === undefined ? "is required" : `must be ${expected}`}.`)
  }
  return value
}

function parseUrl(value, label) {
  try {
    return new URL(value)
  } catch {
    throw new FixtureError(`${label} must be a valid URL.`)
  }
}

export function readConfiguration({ allowWrites = false } = {}) {
  requireEnvironment("LOAD_TEST_ENVIRONMENT", "load-test")
  if (allowWrites) requireEnvironment("LOAD_TEST_ALLOW_WRITES", "1")

  // Never fall back to DATABASE_URL or load a .env file. Callers must pass
  // this dedicated connection explicitly to Prisma after the guards pass.
  const databaseUrl = requireEnvironment("LOAD_TEST_DATABASE_URL")
  const db = parseUrl(databaseUrl, "LOAD_TEST_DATABASE_URL")
  if (!["postgres:", "postgresql:"].includes(db.protocol)) {
    throw new FixtureError("Only a dedicated PostgreSQL load-test database is allowed.")
  }
  if (db.hostname !== requireEnvironment("LOAD_TEST_DATABASE_HOST")) {
    throw new FixtureError("The database hostname does not match LOAD_TEST_DATABASE_HOST.")
  }
  if (db.hostname.endsWith(".")) {
    throw new FixtureError("A database hostname with a trailing dot is prohibited.")
  }
  let databaseName
  try {
    databaseName = decodeURIComponent(db.pathname.slice(1))
  } catch {
    throw new FixtureError("The database name is invalid.")
  }
  if (!databaseName || databaseName !== requireEnvironment("LOAD_TEST_DATABASE_NAME")) {
    throw new FixtureError("The database name does not match LOAD_TEST_DATABASE_NAME.")
  }
  if (/matkamang\.ee$/i.test(db.hostname)) {
    throw new FixtureError("The production domain cannot be a load-test database host.")
  }

  const base = parseUrl(requireEnvironment("LOAD_TEST_BASE_URL"), "LOAD_TEST_BASE_URL")
  const allowedHost = requireEnvironment("LOAD_TEST_ALLOWED_HOST")
  const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"])
  if (base.hostname !== allowedHost || base.username || base.password) {
    throw new FixtureError("The target must match LOAD_TEST_ALLOWED_HOST and contain no credentials.")
  }
  if (base.hostname.endsWith(".")) {
    throw new FixtureError("A target hostname with a trailing dot is prohibited.")
  }
  if (base.hostname === "matkamang.ee" || base.hostname.endsWith(".matkamang.ee")) {
    throw new FixtureError("Production matkamang.ee hosts are prohibited.")
  }
  if (base.protocol !== "https:" && !(base.protocol === "http:" && localHosts.has(base.hostname))) {
    throw new FixtureError("The target must use HTTPS (HTTP is allowed only on loopback).")
  }
  if (base.pathname !== "/" || base.search || base.hash) {
    throw new FixtureError("LOAD_TEST_BASE_URL must be an origin without a path, query, or fragment.")
  }

  return {
    databaseUrl,
    databaseName,
    baseUrl: base.origin,
    manifestPath: resolve(projectRoot, process.env.LOAD_TEST_FIXTURE || "scripts/load-test/fixture-manifest.json"),
  }
}
