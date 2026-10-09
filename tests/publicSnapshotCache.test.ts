import assert from "node:assert/strict"
import test from "node:test"
import { getPublicSnapshot, invalidatePublicSnapshots } from "../src/lib/publicSnapshotCache"

test("public snapshots share in-flight loads, but not competition or freeze versions", async () => {
  let resolve!: (value: string) => void
  let loads = 0
  const load = () => { loads++; return new Promise<string>((done) => { resolve = done }) }
  const a = getPublicSnapshot("leaderboard", "cache-test-shared", "live", load)
  const b = getPublicSnapshot("leaderboard", "cache-test-shared", "live", load)
  await Promise.resolve()
  assert.equal(loads, 1)
  resolve("live")
  assert.deepEqual(await Promise.all([a, b]), ["live", "live"])
  assert.equal(await getPublicSnapshot("leaderboard", "cache-test-shared", "frozen", async () => "frozen"), "frozen")
  assert.equal(await getPublicSnapshot("leaderboard", "another-competition", "live", async () => "another"), "another")
})

test("commit invalidation prevents old in-flight data from repopulating either public cache", async () => {
  let resolve!: (value: string) => void
  const old = getPublicSnapshot("dashboard", "cache-test-write", "live", () => new Promise<string>((done) => { resolve = done }))
  await Promise.resolve()
  await getPublicSnapshot("leaderboard", "cache-test-write", "live", async () => "old leaderboard")
  invalidatePublicSnapshots("cache-test-write")
  resolve("old dashboard")
  await old
  assert.equal(await getPublicSnapshot("dashboard", "cache-test-write", "live", async () => "committed dashboard"), "committed dashboard")
  assert.equal(await getPublicSnapshot("leaderboard", "cache-test-write", "live", async () => "committed leaderboard"), "committed leaderboard")
})

test("failed and expired snapshot loads are retried", async () => {
  await assert.rejects(getPublicSnapshot("dashboard", "cache-test-failure", "live", async () => { throw new Error("database failure") }))
  assert.equal(await getPublicSnapshot("dashboard", "cache-test-failure", "live", async () => "recovered"), "recovered")
  await getPublicSnapshot("dashboard", "cache-test-expiry", "live", async () => "old", { ttlMs: 0 })
  assert.equal(await getPublicSnapshot("dashboard", "cache-test-expiry", "live", async () => "new"), "new")
})
