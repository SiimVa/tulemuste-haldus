import { timingSafeEqual } from "node:crypto"
import { NextResponse } from "next/server"
import {
  deliverPendingNotifications,
  enqueueDueMandateOpenedNotifications,
} from "@/lib/notifications.server"
import { detectSecurityAlertsSafely } from "@/lib/securityAlerts.server"
import { processDueLeaderboardFreezesSafely } from "@/lib/leaderboardFreeze.server"
import { processDueSeriesFreezesSafely } from "@/lib/seriesRanking.server"
import { deliverPendingCompetitionMessagesSafely } from "@/lib/competitionMessages.server"

export const dynamic = "force-dynamic"

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  const authorization = req.headers.get("authorization")
  if (!secret || !authorization?.startsWith("Bearer ")) return false
  const supplied = authorization.slice("Bearer ".length)
  const expectedBuffer = Buffer.from(secret)
  const suppliedBuffer = Buffer.from(supplied)
  return (
    expectedBuffer.length === suppliedBuffer.length &&
    timingSafeEqual(expectedBuffer, suppliedBuffer)
  )
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  // Runs before delivery so that new alert e-mails are sent in the same run.
  const securityAlerts = await detectSecurityAlertsSafely()
  // Ajastatud pingerea külmutus saab snapshot'i ka ilma avaliku vaate avamiseta.
  const leaderboardFreezes = await processDueLeaderboardFreezesSafely()
  // Pärast osavõistlusi, et üleriikliku arvestuse snapshot kasutaks nende külmutatud seisu.
  const seriesFreezes = await processDueSeriesFreezesSafely()
  const queued = await enqueueDueMandateOpenedNotifications()
  const delivery = await deliverPendingNotifications({ limit: 100 })
  // Korraldajate kirjad võistkondadele: partiid, mis ei läinud kohe välja.
  const competitionMessages = await deliverPendingCompetitionMessagesSafely()
  return NextResponse.json({ queued, securityAlerts, leaderboardFreezes, seriesFreezes, competitionMessages, ...delivery })
}
