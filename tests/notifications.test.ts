import assert from "node:assert/strict"
import test from "node:test"
import {
  escapeNotificationHtml,
  notificationDigestTitle,
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

test("automaatne mandaadikinnitus kinnitab esitamise ja vastuvõtmise ühes teavituses", () => {
  const notification = teamWorkflowNotificationContent({
    phase: "MANDATE",
    status: "APPROVED",
    competitionName: "Sügisvõistlus",
    teamName: "Hundid",
    automaticApproval: true,
  })
  assert.equal(notification?.title, "Mandaat esitatud ja kinnitatud")
  assert.match(notification?.message ?? "", /automaatselt kinnitatud/)
})

test("mitme sama sündmuse e-kiri saab koondkirja pealkirja", () => {
  assert.equal(
    notificationDigestTitle("MANDATE_OPENED", "Mandaat on avatud", 2),
    "Mandaadid on avatud"
  )
  assert.equal(
    notificationDigestTitle("MANDATE_OPENED", "Mandaat on avatud", 1),
    "Mandaat on avatud"
  )
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

test("koondkirja HTML kuvab kõik sündmused ja kodeerib nende sisu", () => {
  const html = notificationEmailHtml({
    title: "Mandaadid on avatud",
    messages: ["Võistkond A", "Võistkond <B>"],
    actionUrl: "https://www.matkamang.ee/dashboard",
  })
  assert.match(html, /<ul/)
  assert.match(html, /Võistkond A/)
  assert.match(html, /Võistkond &lt;B&gt;/)
  assert.doesNotMatch(html, /Võistkond <B>/)
})
