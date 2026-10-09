import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { loadDashboard } from "@/lib/dashboard/data.server"
import { publicDashboardSnapshot } from "@/lib/dashboard/publicSnapshot"
import { PublicDashboard } from "@/components/public/PublicDashboard"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const competition = await prisma.competition.findUnique({ where: { id }, select: { name: true } })
  return { title: competition ? `${competition.name} – Ülevaade` : "Ülevaade" }
}

export default async function PublicDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await loadDashboard(id, "public")
  if (!data) notFound()
  return <PublicDashboard initial={publicDashboardSnapshot(data)} />
}
