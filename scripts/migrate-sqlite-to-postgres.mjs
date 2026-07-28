import { spawnSync } from "node:child_process"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const { PrismaClient: PostgresClient } = require("@prisma/client")
const { PrismaClient: SqliteClient } = require("../generated/sqlite-client")

const sqliteUrl = process.env.SQLITE_DATABASE_URL
const postgresUrl = process.env.DATABASE_URL

if (!sqliteUrl?.startsWith("file:")) {
  throw new Error(
    "SQLITE_DATABASE_URL peab viitama SQLite-failile (näiteks file:/absoluutne/tee/dev.db)"
  )
}

if (!postgresUrl) {
  throw new Error("DATABASE_URL puudub")
}

const targetUrl = new URL(postgresUrl)
if (!["postgres:", "postgresql:"].includes(targetUrl.protocol)) {
  throw new Error("DATABASE_URL peab viitama PostgreSQL-i andmebaasile")
}

if (process.env.CONFIRM_SQLITE_TO_POSTGRES !== "yes") {
  throw new Error(
    "Andmete ülekandmiseks määra CONFIRM_SQLITE_TO_POSTGRES=yes"
  )
}

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const prisma = join(
  projectRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "prisma.cmd" : "prisma"
)

console.log("Rakendan PostgreSQL-i migratsioonid...")
const migration = spawnSync(prisma, ["migrate", "deploy"], {
  cwd: projectRoot,
  env: process.env,
  stdio: "inherit",
})

if (migration.error) throw migration.error
if (migration.status !== 0) process.exit(migration.status ?? 1)

const source = new SqliteClient({
  datasources: { db: { url: sqliteUrl } },
})
const target = new PostgresClient({
  datasources: { db: { url: postgresUrl } },
})

const tables = [
  "user",
  "competition",
  "competitionMember",
  "team",
  "teamMember",
  "scoringElement",
  "elementSection",
  "fieldDefinition",
  "calcMethod",
  "sectionCalcMethod",
  "elementException",
  "accessToken",
  "result",
  "computedScore",
  "manualPenalty",
  "miscEntry",
]

const batchSize = 500

async function countRows(client) {
  const counts = {}
  for (const table of tables) {
    counts[table] = await client[table].count()
  }
  return counts
}

try {
  await source.$connect()
  await target.$connect()

  const sourceCounts = await countRows(source)
  const targetCounts = await countRows(target)
  const populatedTables = Object.entries(targetCounts).filter(
    ([, count]) => count > 0
  )

  if (populatedTables.length > 0) {
    const summary = populatedTables
      .map(([table, count]) => `${table}: ${count}`)
      .join(", ")
    throw new Error(
      `PostgreSQL-i sihtandmebaas ei ole tühi (${summary}). Ülekanne katkestati.`
    )
  }

  console.log("Kopeerin andmed ühes PostgreSQL-i tehingus...")
  await target.$transaction(
    async (transaction) => {
      for (const table of tables) {
        const expected = sourceCounts[table]

        for (let skip = 0; skip < expected; skip += batchSize) {
          const rows = await source[table].findMany({
            orderBy: { id: "asc" },
            skip,
            take: batchSize,
          })

          if (rows.length > 0) {
            await transaction[table].createMany({ data: rows })
          }
        }

        console.log(`  ${table}: ${expected}`)
      }
    },
    {
      maxWait: 30_000,
      timeout: 900_000,
    }
  )

  const copiedCounts = await countRows(target)
  const mismatches = tables.filter(
    (table) => copiedCounts[table] !== sourceCounts[table]
  )

  if (mismatches.length > 0) {
    throw new Error(
      `Ridade kontroll ebaõnnestus tabelites: ${mismatches.join(", ")}`
    )
  }

  const total = Object.values(copiedCounts).reduce(
    (sum, count) => sum + count,
    0
  )
  console.log(`Valmis. PostgreSQL-i kopeeriti ja kontrolliti ${total} rida.`)
} finally {
  await Promise.allSettled([source.$disconnect(), target.$disconnect()])
}
