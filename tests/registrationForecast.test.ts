import assert from "node:assert/strict"
import test from "node:test"
import { buildRegistrationStatistics, historicalForecast, parseRegistrationStatistics, registrationAt, tempoForecast, DAY_MS } from "../src/lib/registrationForecast"

const date = (day: number) => new Date(Date.UTC(2026, 0, day))
const application = (day: number, status = "CONFIRMED"): { submittedAt: Date | null; status: string; events: { createdAt: Date; toStatus: string }[] } => ({ submittedAt: date(day), status,
  events: [{ createdAt: date(day), toStatus: status }] })
const stats = (apps = [application(1)], asOf = 15, close = 30) => buildRegistrationStatistics({
  applications: apps, opensAt: date(1), closesAt: date(close), capacity: 20,
}, date(asOf))

test("drafts and future submissions do not count; edits and repeated submissions count once", () => {
  const result = stats([
    { submittedAt: null, status: "DRAFT", events: [] },
    application(20),
    { ...application(1), events: [
      { createdAt: date(1), toStatus: "CONFIRMED" },
      { createdAt: date(2), toStatus: "CHANGES_REQUESTED" },
      { createdAt: date(3), toStatus: "CONFIRMED" },
    ] },
  ])
  assert.equal(result.days[result.days.length - 1].submitted, 1)
  assert.equal(result.days[result.days.length - 1].active, 1)
  assert.equal(result.incompleteHistories, 0)
})

test("withdrawals and rejections change active counts on their actual dates", () => {
  const result = stats([
    { ...application(1, "WITHDRAWN"), events: [{ createdAt: date(1), toStatus: "CONFIRMED" }, { createdAt: date(5), toStatus: "WITHDRAWN" }] },
    { ...application(2, "REJECTED"), events: [{ createdAt: date(2), toStatus: "WAITLISTED" }, { createdAt: date(6), toStatus: "REJECTED" }] },
  ])
  assert.equal(registrationAt(result, date(4)).active, 2)
  assert.equal(registrationAt(result, date(5)).active, 1)
  assert.equal(registrationAt(result, date(6)).active, 0)
  assert.equal(registrationAt(result, date(6)).submitted, 2)
  assert.equal(registrationAt(result, date(6)).withdrawn, 1)
  assert.equal(registrationAt(result, date(6)).rejected, 1)
})

test("tempo uses complete days and respects capacity without capping demand", () => {
  const result = stats(Array.from({ length: 14 }, (_, i) => application(i + 1)))
  const forecast = tempoForecast(result, date(15))
  assert.equal(forecast.rate, 1)
  assert.equal(forecast.forecast?.estimate, 29)
  assert.equal(forecast.forecast?.participants, 20)
  assert.ok(forecast.forecast!.low <= forecast.forecast!.estimate)
  assert.ok(forecast.forecast!.high >= forecast.forecast!.estimate)
  const withToday = stats([...Array.from({ length: 14 }, (_, i) => application(i + 1)), ...Array.from({ length: 50 }, () => application(15))])
  assert.equal(tempoForecast(withToday, date(15)).rate, 1)
})

test("sparse early data, missing deadlines, and expired deadlines produce no tempo forecast", () => {
  assert.equal(tempoForecast(stats(), date(15)).forecast, null)
  assert.equal(tempoForecast(stats(Array.from({ length: 8 }, () => application(1)), 2), date(2)).forecast, null)
  assert.equal(tempoForecast({ ...stats(), closesAt: null }, date(15)).forecast, null)
  assert.equal(tempoForecast(stats(), date(30)).forecast, null)
})

test("historical comparison aligns days to deadline and applies median ratios", () => {
  const current = stats(Array.from({ length: 30 }, () => application(1)), 15, 29)
  const reference = stats([...Array.from({ length: 6 }, () => application(1)), ...Array.from({ length: 4 }, () => application(20))], 30, 29)
  // Shift the reference into a previous year without changing relative day spacing.
  const shift = 365 * DAY_MS
  const shifted = { ...reference,
    opensAt: new Date(date(1).getTime() - shift).toISOString(),
    closesAt: new Date(date(29).getTime() - shift).toISOString(),
    asOf: new Date(date(30).getTime() - shift).toISOString(),
    days: reference.days.map(d => ({ ...d, day: new Date(new Date(d.day).getTime() - shift).toISOString().slice(0, 10) })),
  }
  const forecast = historicalForecast(current, [shifted], date(15))
  assert.equal(forecast.used, 1)
  assert.equal(forecast.forecast?.estimate, 50)
  assert.equal(forecast.forecast?.participants, 20)
  assert.equal(historicalForecast(current, [{ ...shifted, undatedTeams: 1 }], date(15)).used, 0)
  assert.equal(historicalForecast(current, [{ ...shifted, incompleteHistories: 1 }], date(15)).used, 0)
  assert.equal(historicalForecast(current, [reference], date(15)).used, 0)
})

test("aggregate archive survives JSON round trip and contains no personal fields", () => {
  const original = stats()
  const serialized = JSON.stringify(original)
  assert.deepEqual(parseRegistrationStatistics(serialized), original)
  for (const field of ["teamName", "submittedById", "email", "events", "actorId"]) assert.ok(!serialized.includes(field))
  assert.equal(parseRegistrationStatistics("{}"), null)
  assert.equal(parseRegistrationStatistics("broken"), null)
  assert.equal(parseRegistrationStatistics(JSON.stringify({ ...original, days: [] })), null)
})

test("missing event history is marked unsuitable for historical comparison", () => {
  const result = stats([{ ...application(1, "WITHDRAWN"), events: [] }])
  assert.equal(result.incompleteHistories, 1)
  assert.equal(registrationAt(result, date(15)).active, 0)
})

test("database transaction timestamps may precede submittedAt without losing events", () => {
  const submittedAt = new Date(date(2).getTime() + 10)
  const result = buildRegistrationStatistics({ applications: [{ submittedAt, status: "CONFIRMED", events: [
    { createdAt: date(2), fromStatus: null, toStatus: "PENDING_REVIEW" },
    { createdAt: date(2), fromStatus: "PENDING_REVIEW", toStatus: "CONFIRMED" },
  ] }], opensAt: date(1), closesAt: date(30), capacity: null }, date(15))
  assert.equal(result.incompleteHistories, 0)
  assert.equal(registrationAt(result, date(2)).confirmed, 1)
  assert.equal(registrationAt(result, date(1)).submitted, 0)
})
