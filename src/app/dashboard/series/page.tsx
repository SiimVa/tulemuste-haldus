import Link from "next/link"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Card } from "@/components/ui/card"
import { SeriesForm } from "@/components/series/SeriesForm"
import { COMPETITION_STATUS_LABELS } from "@/lib/seriesRanking.server"

export const dynamic = "force-dynamic"

export default async function SeriesListPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  if (session.user.role !== "ADMIN") redirect("/dashboard")

  const [series, competitions] = await Promise.all([
    prisma.competitionSeries.findMany({
      orderBy: { createdAt: "desc" },
      include: { competitions: { orderBy: { order: "asc" }, include: { competition: { select: { name: true } } } } },
    }),
    prisma.competition.findMany({
      orderBy: [{ date: "desc" }, { name: "asc" }],
      select: { id: true, name: true, date: true, status: true },
    }),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Üleriiklik arvestus</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-muted">
          Ühendab mitme osavõistluse tulemused üheks pingereaks. Arvesse läheb iga võistkonna nii mitu parimat KP tulemust,
          kui palju on osavõistluste väikseim ümardatud keskmine läbitud KP-de arv; karistused lähevad arvesse täies ulatuses.
          Arvestus on nähtav ainult administraatorile.
        </p>
      </div>

      {series.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {series.map((item) => (
            <li key={item.id}>
              <Link href={`/dashboard/series/${item.id}`} className="block rounded-card border border-line bg-surface p-4 hover:border-primary">
                <span className="block font-semibold text-ink">{item.name}</span>
                <span className="mt-1 block text-sm text-ink-muted">
                  {item.competitions.length} osavõistlust: {item.competitions.map(({ competition }) => competition.name).join(", ")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Card className="p-4 sm:p-5">
        <h2 className="mb-4 font-semibold text-ink">Uus arvestus</h2>
        <SeriesForm competitions={competitions.map((competition) => ({
          id: competition.id,
          name: competition.name,
          date: competition.date?.toISOString() ?? null,
          statusLabel: COMPETITION_STATUS_LABELS[competition.status] ?? competition.status,
        }))} />
      </Card>
    </div>
  )
}
