import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { recomputeCompetitionScores } from "@/lib/recompute"

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id: competitionId } = await params

  // Kasutab sama per-element loogikat mis tulemuse salvestamine → tulemused ei saa lahku minna
  const total = await recomputeCompetitionScores(competitionId)

  return NextResponse.json({ ok: true, recalculated: total })
}
