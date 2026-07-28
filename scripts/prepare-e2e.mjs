import { spawnSync } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

if (process.env.ALLOW_E2E_DATABASE_RESET !== "1") {
  throw new Error(
    "E2E ettevalmistus katkestati: ALLOW_E2E_DATABASE_RESET peab olema 1"
  )
}

if (!process.env.DATABASE_URL) {
  throw new Error("E2E ettevalmistus katkestati: DATABASE_URL puudub")
}

const databaseUrl = new URL(process.env.DATABASE_URL)
const allowedProtocols = new Set(["postgres:", "postgresql:"])
const allowedHosts = new Set(["127.0.0.1", "localhost", "::1"])

if (
  !allowedProtocols.has(databaseUrl.protocol) ||
  !allowedHosts.has(databaseUrl.hostname) ||
  databaseUrl.searchParams.get("schema") !== "e2e"
) {
  throw new Error(
    "E2E ettevalmistus katkestati: lubatud on ainult kohalik PostgreSQL-i schema=e2e andmebaas"
  )
}

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const prisma = join(
  projectRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "prisma.cmd" : "prisma"
)
const migration = spawnSync(
  prisma,
  ["migrate", "reset", "--force", "--skip-seed"],
  {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
  }
)

if (migration.error) throw migration.error
if (migration.status !== 0) process.exit(migration.status ?? 1)
