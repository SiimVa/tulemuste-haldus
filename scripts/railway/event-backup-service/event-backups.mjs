import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { mkdtemp, stat, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

export const BACKUP_DATE = "2026-10-17"
export const BACKUP_TIMEZONE = "Europe/Tallinn"
export const BACKUP_CRON_UTC = "0,30 7-18 17 10 *"

export function backupSlot(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: BACKUP_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now).map(({ type, value }) => [type, value]))
  const day = `${parts.year}-${parts.month}-${parts.day}`
  const minute = Number(parts.hour) * 60 + Number(parts.minute)
  // A deployment before the window makes one verification dump, never a fake
  // historical backup. The 23 event slots always capture their actual run time.
  if (day === BACKUP_DATE && minute < 10 * 60) return { name: `verification-${day}-restore-test` }
  if (day !== BACKUP_DATE || minute < 10 * 60 || minute > 21 * 60 + 9 || minute % 30 >= 10) return null
  const slot = Math.floor(minute / 30) * 30
  return { name: `event-${day}-${String(Math.floor(slot / 60)).padStart(2, "0")}${String(slot % 60).padStart(2, "0")}-Europe-Tallinn` }
}

const exec = promisify(execFile)
export async function runDatabaseBackup({ now = new Date(), env = process.env } = {}) {
  const slot = backupSlot(now)
  if (!slot) { console.log("Outside the 2026-10-17 backup window; skipping"); return }
  for (const key of ["DATABASE_URL", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "BACKUP_BUCKET", "BACKUP_ENDPOINT"]) {
    if (!env[key]) throw new Error(`Missing ${key}`)
  }
  const prefix = `event-backups/${BACKUP_DATE}/${slot.name}`
  const aws = async (args) => exec("aws", [...args, "--endpoint-url", env.BACKUP_ENDPOINT], { env, timeout: 180_000, maxBuffer: 1024 * 1024 })
  // A verified manifest is the completion marker. A partial prior upload is
  // safely replaced; a completed slot is never duplicated.
  try {
    await aws(["s3api", "head-object", "--bucket", env.BACKUP_BUCKET, "--key", `${prefix}.json`])
    console.log(`Backup already completed: ${prefix}`)
    return
  } catch (error) {
    if (!/404|Not Found|NoSuchKey/.test(String(error.stderr))) throw new Error("Could not check existing backup")
  }
  const dir = await mkdtemp(join(tmpdir(), "event-backup-"))
  const cluster = join(dir, "verify-cluster")
  let verificationServerStarted = false
  try {
    const dump = join(dir, "postgres.dump")
    const url = new URL(env.DATABASE_URL)
    const pgEnv = { ...env, PGHOST: url.hostname, PGPORT: url.port || "5432", PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: decodeURIComponent(url.pathname.slice(1)), PGCONNECT_TIMEOUT: "20" }
    await exec("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", "--file", dump], { env: pgEnv, timeout: 600_000, maxBuffer: 1024 * 1024 })
    // Decode the entire archive, including table data, before uploading it.
    await exec("pg_restore", ["--file=/dev/null", dump], { env: pgEnv, timeout: 600_000, maxBuffer: 1024 * 1024 })
    // Restore into an isolated, disposable PostgreSQL instance. This never
    // writes to production: host/port/database are explicitly replaced.
    await exec("chown", ["postgres:postgres", dir])
    await exec("su-exec", ["postgres", "initdb", "-D", cluster, "-A", "trust", "--no-locale", "-E", "UTF8"], { timeout: 60_000 })
    await exec("su-exec", ["postgres", "pg_ctl", "-D", cluster, "-l", join(dir, "verify.log"), "-o", "-h 127.0.0.1 -p 5433 -k /tmp -F", "-w", "start"], { timeout: 60_000 })
    verificationServerStarted = true
    const restoreEnv = { ...pgEnv, PGHOST: "127.0.0.1", PGPORT: "5433", PGUSER: "postgres", PGPASSWORD: "", PGDATABASE: "backup_verify" }
    await exec("createdb", ["backup_verify"], { env: restoreEnv, timeout: 30_000 })
    await exec("pg_restore", ["--exit-on-error", "--no-owner", "--no-privileges", "--dbname", "backup_verify", dump], { env: restoreEnv, timeout: 600_000, maxBuffer: 1024 * 1024 })
    const restoredTables = Number((await exec("psql", ["-At", "-c", "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'"], { env: restoreEnv, timeout: 30_000 })).stdout.trim())
    if (!(restoredTables > 0)) throw new Error("Restored database has no public tables")
    const hash = createHash("sha256")
    for await (const chunk of createReadStream(dump)) hash.update(chunk)
    const sha256 = hash.digest("hex")
    const bytes = (await stat(dump)).size
    await aws(["s3", "cp", dump, `s3://${env.BACKUP_BUCKET}/${prefix}.dump`, "--only-show-errors", "--metadata", `sha256=${sha256}`])
    const head = JSON.parse((await aws(["s3api", "head-object", "--bucket", env.BACKUP_BUCKET, "--key", `${prefix}.dump`])).stdout)
    if (head.ContentLength !== bytes || head.Metadata?.sha256 !== sha256) throw new Error("Uploaded backup verification failed")
    const manifest = { format: "pg_dump custom", slot: slot.name, createdAt: new Date().toISOString(), timeZone: BACKUP_TIMEZONE, bytes, sha256, archiveDecoded: true, restoreVerified: true, restoredTables }
    const manifestPath = join(dir, "manifest.json")
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2))
    await aws(["s3", "cp", manifestPath, `s3://${env.BACKUP_BUCKET}/${prefix}.json`, "--only-show-errors"])
    console.log(JSON.stringify({ backup: prefix, bytes, sha256, status: "verified" }))
  } catch {
    // Child-process errors may contain credentials or sensitive SQL. Keep
    // those out of the hosting logs; a failed run must still fail visibly.
    throw new Error(`Backup failed: ${slot.name}`)
  } finally {
    if (verificationServerStarted) await exec("su-exec", ["postgres", "pg_ctl", "-D", cluster, "-m", "immediate", "-w", "stop"]).catch(() => {})
    await rm(dir, { recursive: true, force: true })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runDatabaseBackup()
