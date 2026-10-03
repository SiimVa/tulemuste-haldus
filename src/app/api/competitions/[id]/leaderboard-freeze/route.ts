import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { canAccessCompetition } from "@/lib/competitionAccess"
import { withSecurityRoute } from "@/lib/securityRoute.server"
import { getFreezeState, revealLeaderboard, setLeaderboardFreeze } from "@/lib/leaderboardFreeze.server"

const bodySchema = z.union([
  z.object({ now: z.literal(true) }).strict(),
  z.object({ freezeAt: z.string().max(40) }).strict(),
])

type Access = { ok: false; response: Response } | { ok: true; id: string; userId: string }

async function authorize(params: Promise<{ id: string }>): Promise<Access> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  const { id } = await params
  if (!await canAccessCompetition(id, { id: session.user.id, role: session.user.role })) {
    return { ok: false, response: NextResponse.json({ error: "Keelatud" }, { status: 403 }) }
  }
  return { ok: true, id, userId: session.user.id }
}

function stateJson(state: Awaited<ReturnType<typeof getFreezeState>>) {
  return state ? { freezeAt: state.freezeAt.toISOString(), frozen: state.frozen } : { freezeAt: null, frozen: false }
}

// Määrab avaliku pingerea külmutamise aja või külmutab kohe.
async function handlePUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await authorize(params)
  if (!access.ok) return access.response
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Vigane külmutamise aeg" }, { status: 400 })
  const now = new Date()
  const freezeAt = "now" in parsed.data ? now : new Date(parsed.data.freezeAt)
  if (Number.isNaN(freezeAt.getTime())) return NextResponse.json({ error: "Vigane külmutamise aeg" }, { status: 400 })
  if (freezeAt.getTime() > now.getTime() + 366 * 24 * 60 * 60 * 1000) {
    return NextResponse.json({ error: "Külmutamise aeg on liiga kaugel tulevikus" }, { status: 400 })
  }
  // Möödunud aeg tähendaks hiljem sisestatud tulemuste tagasiulatuvat peitmist; külmutame siis kohe.
  await setLeaderboardFreeze(access.id, freezeAt < now ? now : freezeAt, access.userId, now)
  return NextResponse.json(stateJson(await getFreezeState(access.id)))
}

// Avalikustab tulemused: avalikud vaated näitavad taas jooksvat seisu.
async function handleDELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await authorize(params)
  if (!access.ok) return access.response
  await revealLeaderboard(access.id)
  return NextResponse.json(stateJson(null))
}

export const PUT = withSecurityRoute("/api/competitions/[id]/leaderboard-freeze", handlePUT)
export const DELETE = withSecurityRoute("/api/competitions/[id]/leaderboard-freeze", handleDELETE)
