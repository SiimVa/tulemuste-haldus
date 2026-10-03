import { notFound } from "next/navigation"
import Link from "next/link"
import { headers } from "next/headers"
import { requireCompetitionManager } from "@/lib/competitionPageAccess.server"
import { loadDashboard } from "@/lib/dashboard/data.server"
import { DashboardView, FreezeNotice } from "@/components/dashboard/DashboardView"
import { AutoRefresh } from "@/components/AutoRefresh"
import { CopyButton } from "@/components/CopyButton"
import { formatDateTime } from "@/lib/dashboard/format"

export const dynamic = "force-dynamic"

export default async function OverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requireCompetitionManager(id)
  const data = await loadDashboard(id, "internal")
  if (!data) notFound()

  const headersList = await headers()
  const host = headersList.get("host") ?? "localhost:3000"
  const proto = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https"
  const publicUrl = `${proto}://${host}/public/${id}/dashboard`
  const linkClass = "inline-flex min-h-11 items-center rounded-lg border border-line bg-surface px-4 text-sm font-medium text-ink hover:bg-canvas"

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Link href={`/dashboard/competitions/${id}`}>← Tagasi</Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">{data.competition.name} — Statistika</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
            <span>Uuendatud {formatDateTime(data.generatedAt)}</span>
            {data.competition.status === "ACTIVE" && <><span>·</span><AutoRefresh intervalSeconds={60} /></>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/dashboard/competitions/${id}/overview/settings`} className={linkClass}>Kohanda vaadet</Link>
          <Link href={`/screen/${id}`} target="_blank" className={linkClass}>Ekraanirežiim</Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
        <span className="w-24 shrink-0 text-xs font-medium text-blue-800">Avalik vaade</span>
        <span className="min-w-0 basis-full truncate rounded border bg-white px-2 py-1 font-mono text-xs text-gray-600 sm:flex-1 sm:basis-auto">{publicUrl}</span>
        <CopyButton text={publicUrl} />
        <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 text-xs text-blue-600 hover:underline">Ava</a>
        <a href={`/public/${id}/screen`} target="_blank" rel="noopener noreferrer" className="shrink-0 text-xs text-blue-600 hover:underline">Avalik ekraan</a>
      </div>

      <FreezeNotice data={data} />
      <DashboardView data={data} />
    </div>
  )
}
