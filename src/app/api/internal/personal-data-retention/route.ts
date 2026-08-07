import { timingSafeEqual } from "node:crypto"
import { NextResponse } from "next/server"
import { purgeExpiredPersonalData } from "@/lib/personalDataRetention.server"

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
  const results = await purgeExpiredPersonalData()
  return NextResponse.json({
    purgedCompetitions: results.length,
    results,
  })
}
