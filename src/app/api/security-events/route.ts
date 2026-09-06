import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { SECURITY_ACTION_LABELS, SECURITY_OUTCOMES, type SecurityOutcome } from "@/lib/security"
import { withSecurityRoute } from "@/lib/securityRoute.server"

export const dynamic = "force-dynamic"

async function handleGET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "ADMIN") return Response.json({ error: "Keelatud" }, { status: 403 })
  const params = new URL(request.url).searchParams
  const outcome = params.get("outcome")
  const action = params.get("action")
  const cursor = params.get("cursor")
  if ((outcome && !SECURITY_OUTCOMES.includes(outcome as SecurityOutcome)) ||
      (action && !Object.hasOwn(SECURITY_ACTION_LABELS, action)) ||
      (cursor && !/^c[a-z0-9]{24}$/.test(cursor))) {
    return Response.json({ error: "Vigane filter" }, { status: 400 })
  }
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const [rows, counts] = await Promise.all([
    prisma.securityEvent.findMany({
      where: { ...(outcome ? { outcome } : {}), ...(action ? { action } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 51,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    }),
    prisma.securityEvent.groupBy({
      by: ["outcome"], where: { createdAt: { gte: since } }, _count: { _all: true },
    }),
  ])
  const events = rows.slice(0, 50)
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(events.flatMap(event => event.actorUserId ? [event.actorUserId] : []))] } },
    select: { id: true, name: true },
  })
  const names = new Map(users.map(user => [user.id, user.name]))
  return Response.json({
    events: events.map(event => ({ ...event, actorName: event.actorUserId ? names.get(event.actorUserId) ?? null : null })),
    nextCursor: rows.length > 50 ? events[events.length - 1].id : null,
    last24Hours: Object.fromEntries(counts.map(row => [row.outcome, row._count._all])),
  }, { headers: { "Cache-Control": "private, no-store" } })
}

export const GET = withSecurityRoute("/api/security-events", handleGET)
