import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { loadDashboard } from "@/lib/dashboard/data.server"
import { DashboardScreen, FreezeNotice } from "@/components/dashboard/DashboardView"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const competition = await prisma.competition.findUnique({ where: { id }, select: { name: true } })
  return { title: competition ? `${competition.name} – Ekraan` : "Ekraan" }
}

// Avalik ekraan finišialale: ainult avalikuks märgitud vidinad.
export default async function PublicScreenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await loadDashboard(id, "public")
  if (!data) notFound()
  return (
    <>
      {data.freeze && <div className="px-4 pt-4 sm:px-6"><FreezeNotice data={data} /></div>}
      <DashboardScreen data={data} title={data.competition.name} />
    </>
  )
}
