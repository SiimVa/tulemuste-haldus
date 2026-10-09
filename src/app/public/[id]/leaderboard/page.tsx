import { notFound } from "next/navigation"
import { PublicLeaderboard } from "@/components/public/PublicLeaderboard"
import { getPublicLeaderboard } from "@/lib/publicLeaderboard.server"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const snapshot = await getPublicLeaderboard(id)
  return { title: snapshot ? `${snapshot.competition.name} – Pingerida` : "Pingerida" }
}

export default async function PublicLeaderboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const snapshot = await getPublicLeaderboard(id)
  if (!snapshot) notFound()
  return <PublicLeaderboard initial={snapshot} />
}
