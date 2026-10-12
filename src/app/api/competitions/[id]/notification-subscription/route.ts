import { withSecurityRoute } from "@/lib/securityRoute.server"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { canAccessCompetition } from "@/lib/competitionAccess"
import { isDigestInterval, nextDigestAt } from "@/lib/organizerDigest"
import { prisma } from "@/lib/prisma"

type Params = { params: Promise<{ id: string }> }

// Korraldaja enda kokkuvõtte tellimus: iga kasutaja haldab ainult oma tellimust.
async function authorize(params: Params["params"]) {
  const session = await auth()
  if (!session?.user?.id) return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  const { id: competitionId } = await params
  if (!await canAccessCompetition(competitionId, { id: session.user.id, role: session.user.role })) {
    return { ok: false as const, response: NextResponse.json({ error: "Keelatud" }, { status: 403 }) }
  }
  return { ok: true as const, competitionId, userId: session.user.id }
}

function serialize(subscription: { registration: boolean; mandate: boolean; interval: string; nextSendAt: Date } | null) {
  return subscription && {
    registration: subscription.registration,
    mandate: subscription.mandate,
    interval: subscription.interval,
    nextSendAt: subscription.nextSendAt.toISOString(),
  }
}

async function handleGET(_req: Request, { params }: Params) {
  const access = await authorize(params)
  if (!access.ok) return access.response
  const [subscription, user] = await Promise.all([
    prisma.organizerDigestSubscription.findUnique({
      where: { competitionId_userId: { competitionId: access.competitionId, userId: access.userId } },
    }),
    prisma.user.findUnique({ where: { id: access.userId }, select: { email: true } }),
  ])
  return NextResponse.json({ subscription: serialize(subscription), email: user?.email ?? null })
}

async function handlePUT(req: Request, { params }: Params) {
  const access = await authorize(params)
  if (!access.ok) return access.response
  const body = await req.json().catch(() => ({}))
  const registration = body.registration === true
  const mandate = body.mandate === true
  if (!registration && !mandate) {
    return NextResponse.json({ error: "Vali vähemalt üks teema" }, { status: 400 })
  }
  if (!isDigestInterval(body.interval)) {
    return NextResponse.json({ error: "Vigane intervall" }, { status: 400 })
  }
  const now = new Date()
  const nextSendAt = nextDigestAt(body.interval, now)
  // Uus tellimus hõlmab sündmusi alates tellimise hetkest; muutmisel jääb
  // eelmise kokkuvõtte piir alles, et vahepealsed sündmused ei kaoks.
  const subscription = await prisma.organizerDigestSubscription.upsert({
    where: { competitionId_userId: { competitionId: access.competitionId, userId: access.userId } },
    create: { competitionId: access.competitionId, userId: access.userId, registration, mandate, interval: body.interval, coveredUntil: now, nextSendAt },
    update: { registration, mandate, interval: body.interval, nextSendAt },
  })
  return NextResponse.json({ subscription: serialize(subscription) })
}

async function handleDELETE(_req: Request, { params }: Params) {
  const access = await authorize(params)
  if (!access.ok) return access.response
  await prisma.organizerDigestSubscription.deleteMany({
    where: { competitionId: access.competitionId, userId: access.userId },
  })
  return NextResponse.json({ subscription: null })
}

export const GET = withSecurityRoute("/api/competitions/[id]/notification-subscription", handleGET)
export const PUT = withSecurityRoute("/api/competitions/[id]/notification-subscription", handlePUT)
export const DELETE = withSecurityRoute("/api/competitions/[id]/notification-subscription", handleDELETE)
