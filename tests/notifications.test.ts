import assert from "node:assert/strict"
import test from "node:test"
import {
  escapeNotificationHtml,
  notificationEmailHtml,
  registrationNotificationContent,
  teamWorkflowNotificationContent,
} from "../src/lib/notifications"

test("kinnitatud registreeringu teavitus nimetab võistkonna ja võistluse", () => {
  const notification = registrationNotificationContent({
    status: "CONFIRMED",
    competitionName: "Sügisvõistlus",
    teamName: "Hundid",
  })
  assert.equal(notification?.type, "REGISTRATION_CONFIRMED")
  assert.match(notification?.message ?? "", /Hundid/)
  assert.match(notification?.message ?? "", /Sügisvõistlus/)
})

test("ootenimekirja teavitus sisaldab kohta", () => {
  const notification = registrationNotificationContent({
    status: "WAITLISTED",
    competitionName: "Sügisvõistlus",
    teamName: "Hundid",
    waitlistPosition: 3,
  })
  assert.equal(notification?.type, "REGISTRATION_WAITLISTED")
  assert.match(notification?.message ?? "", /koht on 3/)
})

test("parandamisele saadetud mandaadi teavitus sisaldab korraldaja märkust", () => {
  const notification = teamWorkflowNotificationContent({
    phase: "MANDATE",
    status: "CHANGES_REQUESTED",
    competitionName: "Sügisvõistlus",
    teamName: "Hundid",
    note: "Lisa sünniajad",
  })
  assert.equal(notification?.title, "Mandaat vajab täiendamist")
  assert.match(notification?.message ?? "", /Lisa sünniajad/)
})

test("tundmatu olek ei tekita eksitavat teavitust", () => {
  assert.equal(
    registrationNotificationContent({
      status: "WITHDRAWN",
      competitionName: "Sügisvõistlus",
      teamName: "Hundid",
    }),
    null
  )
})

test("e-kirja HTML kodeerib kasutaja sisendi", () => {
  assert.equal(escapeNotificationHtml('<script>alert("x")</script>'), "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;")
  const html = notificationEmailHtml({
    title: "Teavitus <test>",
    message: "Märkus & kontroll",
    actionUrl: "https://www.matkamang.ee/dashboard?a=1&b=2",
  })
  assert.doesNotMatch(html, /<test>/)
  assert.match(html, /Märkus &amp; kontroll/)
  assert.match(html, /a=1&amp;b=2/)
})
