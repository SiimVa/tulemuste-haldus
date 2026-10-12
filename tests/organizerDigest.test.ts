import assert from "node:assert/strict"
import test from "node:test"
import { buildOrganizerDigest, nextDigestAt, type DigestInput } from "../src/lib/organizerDigest"

const at = (iso: string) => new Date(iso)

test("kohe ja kord tunnis", () => {
  assert.equal(nextDigestAt("IMMEDIATE", at("2026-10-13T10:15:00Z")).toISOString(), "2026-10-13T10:15:00.000Z")
  assert.equal(nextDigestAt("HOURLY", at("2026-10-13T10:15:00Z")).toISOString(), "2026-10-13T11:00:00.000Z")
  assert.equal(nextDigestAt("HOURLY", at("2026-10-13T11:00:00Z")).toISOString(), "2026-10-13T12:00:00.000Z")
})

test("kord päevas kell 8 Eesti aja järgi, ka suveaja lõpus", () => {
  // Suveaeg (UTC+3): kell 8 = 05:00Z.
  assert.equal(nextDigestAt("DAILY", at("2026-10-13T04:00:00Z")).toISOString(), "2026-10-13T05:00:00.000Z")
  assert.equal(nextDigestAt("DAILY", at("2026-10-13T05:00:00Z")).toISOString(), "2026-10-14T05:00:00.000Z")
  // 25.10.2026 lõpeb suveaeg (UTC+2): kell 8 = 06:00Z.
  assert.equal(nextDigestAt("DAILY", at("2026-10-24T06:00:00Z")).toISOString(), "2026-10-25T06:00:00.000Z")
})

test("kord nädalas esmaspäeval kell 8", () => {
  // 13.10.2026 on teisipäev.
  assert.equal(nextDigestAt("WEEKLY", at("2026-10-13T10:00:00Z")).toISOString(), "2026-10-19T05:00:00.000Z")
  assert.equal(nextDigestAt("WEEKLY", at("2026-10-19T04:00:00Z")).toISOString(), "2026-10-19T05:00:00.000Z")
  assert.equal(nextDigestAt("WEEKLY", at("2026-10-19T05:00:00Z")).toISOString(), "2026-10-26T06:00:00.000Z")
})

const base: DigestInput = {
  competitionName: "Sügismäng",
  subscriberId: "org",
  registration: true,
  mandate: true,
  applicationEvents: [],
  teamRegistrations: [],
  mandateSubmissions: [],
  applicationStatuses: ["CONFIRMED", "CONFIRMED", "WAITLISTED"],
  teamMandateStatuses: ["APPROVED", "SUBMITTED", "DRAFT"],
}

const event = (applicationId: string, teamName: string, fromStatus: string | null, toStatus: string, minute: number, actorId: string | null = "rep") =>
  ({ applicationId, teamName, fromStatus, toStatus, actorId, createdAt: at(`2026-10-13T10:${String(minute).padStart(2, "0")}:00Z`) })

test("sündmusteta kirja ei saadeta", () => {
  assert.equal(buildOrganizerDigest(base), null)
  // Korraldaja enda otsus pole uudis.
  assert.equal(buildOrganizerDigest({ ...base, applicationEvents: [event("a", "Kotkad", "PENDING_REVIEW", "CONFIRMED", 1, "org")] }), null)
})

test("avalduse sündmused koondatakse ja lisatakse hetkeseis", () => {
  const digest = buildOrganizerDigest({
    ...base,
    applicationEvents: [
      // Automaatne jaotus: esitamine ja kinnitamine samas perioodis → üks rida.
      event("a", "Kotkad", null, "PENDING_REVIEW", 1),
      event("a", "Kotkad", "PENDING_REVIEW", "CONFIRMED", 2, null),
      event("b", "Rebased", "CONFIRMED", "WITHDRAWN", 3),
      event("c", "Ilvesed", "WAITLISTED", "CONFIRMED", 4, null),
      event("d", "Karud", "CONFIRMED", "CONFIRMED", 5),
    ],
    mandateSubmissions: [
      { teamName: "Hundid", status: "SUBMITTED", automatic: false },
      { teamName: "Põdrad", status: "APPROVED", automatic: true },
    ],
  })
  assert.ok(digest)
  assert.equal(digest.title, "Registreerimine ja mandaat: 5 uut sündmust")
  assert.deepEqual(digest.lines, [
    "Uus registreering: „Kotkad” (kinnitatud)",
    "„Rebased” võttis registreeringu tagasi",
    "„Ilvesed” sai ootenimekirjast koha",
    "„Hundid” esitas mandaadi (ootab kinnitust)",
    "„Põdrad” esitas mandaadi (kinnitati automaatselt)",
    "Registreerimise seis: 2 registreeritud, 0 ootab ülevaatust, 1 ootenimekirjas.",
    "Mandaadi seis: 2/3 võistkonda on mandaadi esitanud (1 kinnitatud, 1 ootab kinnitust, 0 vajab parandamist).",
  ])
})

test("tellimata teema sündmusi ei näidata", () => {
  const digest = buildOrganizerDigest({
    ...base,
    registration: false,
    applicationEvents: [event("a", "Kotkad", null, "CONFIRMED", 1)],
    mandateSubmissions: [{ teamName: "Hundid", status: "SUBMITTED", automatic: false }],
  })
  assert.ok(digest)
  assert.equal(digest.title, "Mandaat: 1 uus sündmus")
  assert.deepEqual(digest.lines, [
    "„Hundid” esitas mandaadi (ootab kinnitust)",
    "Mandaadi seis: 2/3 võistkonda on mandaadi esitanud (1 kinnitatud, 1 ootab kinnitust, 0 vajab parandamist).",
  ])
  assert.equal(buildOrganizerDigest({ ...base, mandate: false, mandateSubmissions: [{ teamName: "Hundid", status: "SUBMITTED", automatic: false }] }), null)
})
