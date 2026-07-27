import { spawnSync } from "node:child_process"
import { closeSync, openSync, rmSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const expectedDatabaseUrl = "file:./e2e.db"

if (process.env.DATABASE_URL !== expectedDatabaseUrl) {
  throw new Error(
    `E2E ettevalmistus katkestati: DATABASE_URL peab olema ${expectedDatabaseUrl}`
  )
}

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const databasePath = join(projectRoot, "prisma", "e2e.db")

for (const suffix of ["", "-journal", "-shm", "-wal"]) {
  rmSync(`${databasePath}${suffix}`, { force: true })
}
closeSync(openSync(databasePath, "w"))

const prisma = join(
  projectRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "prisma.cmd" : "prisma"
)
const migration = spawnSync(prisma, ["migrate", "deploy"], {
  cwd: projectRoot,
  env: process.env,
  stdio: "inherit",
})

if (migration.error) throw migration.error
if (migration.status !== 0) process.exit(migration.status ?? 1)
