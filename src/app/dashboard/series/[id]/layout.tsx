import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { SeriesEditPanel } from "@/components/series/SeriesForm"
import { SeriesTabs } from "@/components/series/SeriesTabs"
import { COMPETITION_STATUS_LABELS } from "@/lib/seriesRanking.server"

// Üleriikliku arvestuse päis ja vaated. Iga leht kontrollib õigusi ka ise.
export default async function SeriesLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) redirect("/login")
  if (session.user.role !== "ADMIN") redirect("/dashboard")
  const { id } = await params
  const [series, allCompetitions] = await Promise.all([
    prisma.competitionSeries.findUnique({
      where: { id },
      select: { id: true, name: true, isPublished: true, competitions: { orderBy: [{ order: "asc" }, { competition: { name: "asc" } }], select: { competitionId: true } } },
    }),
    prisma.competition.findMany({ orderBy: [{ date: "desc" }, { name: "asc" }], select: { id: true, name: true, date: true, status: true } }),
  ])
  if (!series) notFound()

  return (
    <div className="space-y-6">
      {/* Prindilehel (print) peidetakse päis ja vaadete sakid. */}
      <div className="no-print flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/dashboard/series" className="text-sm text-ink-muted hover:text-primary">← Üleriiklik arvestus</Link>
          <h1 className="mt-1 text-2xl font-bold text-ink">{series.name}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {series.competitions.length} osavõistlust · {series.isPublished
              ? <Link href={`/public/series/${series.id}`} className="text-primary hover:underline">avaldatud</Link>
              : "avaldamata, nähtav ainult administraatorile"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href={`/api/series/${series.id}/export`} className="rounded-control border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-canvas">
            ↓ Ekspordi Excel
          </a>
          <Link href={`/dashboard/series/${series.id}/print`} className="rounded-control border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-canvas">
            Prindi
          </Link>
          <SeriesEditPanel
            competitions={allCompetitions.map((competition) => ({
              id: competition.id,
              name: competition.name,
              date: competition.date?.toISOString() ?? null,
              statusLabel: COMPETITION_STATUS_LABELS[competition.status] ?? competition.status,
            }))}
            initial={{ id: series.id, name: series.name, competitionIds: series.competitions.map((item) => item.competitionId) }}
          />
        </div>
      </div>
      <div className="no-print"><SeriesTabs seriesId={series.id} /></div>
      {children}
    </div>
  )
}
