import test from "node:test"
import assert from "node:assert/strict"
import { backupSlot, runDatabaseBackup } from "./event-backup-service/event-backups.mjs"

test("today's 23 half-hour slots include both 10:00 and 21:00 Tallinn", () => {
  const slots = []
  for (let minute = 0; minute < 24 * 60; minute += 30) {
    const slot = backupSlot(new Date(Date.UTC(2026, 9, 17, 0, minute)))
    if (slot?.name.startsWith("event-")) slots.push(slot.name)
  }
  assert.equal(slots.length, 23)
  assert.match(slots[0], /1000/)
  assert.match(slots.at(-1), /2100/)
})

test("startup delay stays in its slot; the window never extends to 21:30 or another date", () => {
  assert.match(backupSlot(new Date("2026-10-17T07:09:00Z")).name, /1000/)
  assert.equal(backupSlot(new Date("2026-10-17T07:10:00Z")), null)
  assert.match(backupSlot(new Date("2026-10-17T06:59:00Z")).name, /^verification-/)
  assert.equal(backupSlot(new Date("2026-10-17T18:10:00Z")), null)
  assert.equal(backupSlot(new Date("2026-10-17T18:30:00Z")), null)
  assert.equal(backupSlot(new Date("2026-10-18T07:00:00Z")), null)
  assert.equal(backupSlot(new Date("2027-10-17T07:00:00Z")), null)
})

test("outside the one-day window never needs credentials or touches the database", async () => {
  await runDatabaseBackup({ now: new Date("2026-10-18T07:00:00Z"), env: {} })
  await assert.rejects(runDatabaseBackup({ now: new Date("2026-10-17T07:00:00Z"), env: {} }), /Missing DATABASE_URL/)
})
