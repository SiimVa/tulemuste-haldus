import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Card } from "@/components/ui/card"
import { TableScroll, td, tdNum, th } from "@/components/dashboard/WidgetCard"
import { SeriesEditPanel } from "@/components/series/SeriesForm"
import { formatNumber } from "@/lib/dashboard/format"
import { COMPETITION_STATUS_LABELS, loadSeriesRanking } from "@/lib/seriesRanking.server"
import { ELEMENT_TYPE_LABELS } from "@/lib/seriesRules"

export const dynamic = "force-dynamic"

const points = (value: number) => formatNumber(value, 2)

export default async function SeriesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ klass?: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect("/login")
  if (session.user.role !== "ADMIN") redirect("/dashboard")
  const [{ id }, { klass }] = await Promise.all([params, searchParams])

  const [data, allCompetitions] = await Promise.all([
    loadSeriesRanking(id),
    prisma.competition.findMany({ orderBy: [{ date: "desc" }, { name: "asc" }], select: { id: true, name: true, date: true, status: true } }),
  ])
  if (!data) notFound()
  const { series, competitions, ranking, rules } = data
  const competitionName = new Map(competitions.map((competition) => [competition.id, competition.name]))
  const names = (ids: string[]) => ids.map((competitionId) => competitionName.get(competitionId) ?? competitionId).join(", ")
  const unfinished = competitions.filter((competition) => competition.status !== "FINISHED")
  const minimum = ranking.competitions.filter((summary) => summary.roundedAverage !== null && summary.roundedAverage === ranking.countedKpCount)
  const selectedClass = klass && ranking.classes.includes(klass) ? klass : null
  const rows = selectedClass ? ranking.rows.filter((row) => row.team.class === selectedClass) : ranking.rows
  const unit = ranking.scoringMode === "PENALTY" ? "Karistuspunktid" : "Punktid"
  const differenceCodes = new Set(rules.differences.map((difference) => difference.code))
  const rulesOk = rules.scoringModes.length <= 1 && rules.differences.length === 0 && rules.missing.length === 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/dashboard/series" className="text-sm text-ink-muted hover:text-primary">← Üleriiklik arvestus</Link>
          <h1 className="mt-1 text-2xl font-bold text-ink">{series.name}</h1>
          <p className="mt-1 text-sm text-ink-muted">{competitions.length} osavõistlust · nähtav ainult administraatorile</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href={`/api/series/${series.id}/export`} className="rounded-control border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-canvas">
            ↓ Ekspordi Excel
          </a>
          <SeriesEditPanel
            competitions={allCompetitions.map((competition) => ({
              id: competition.id,
              name: competition.name,
              date: competition.date?.toISOString() ?? null,
              statusLabel: COMPETITION_STATUS_LABELS[competition.status] ?? competition.status,
            }))}
            initial={{ id: series.id, name: series.name, competitionIds: competitions.map((competition) => competition.id) }}
          />
        </div>
      </div>

      {unfinished.length > 0 && (
        <p role="status" className="rounded-card border border-line bg-canvas px-4 py-3 text-sm text-ink-muted">
          Esialgne arvestus: {unfinished.map((competition) => `${competition.name} (${competition.statusLabel.toLocaleLowerCase("et")})`).join(", ")} pole veel lõppenud.
        </p>
      )}

      <Card className="p-4 sm:p-5">
        <h2 className="font-semibold text-ink">Osavõistlused</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Läbitud KP = sooritus, „Ebaõnnestus” või „Läbis, aga ei sooritanud”. Keskmises on arvestuses olevad võistkonnad, kellel on mõni KP tulemus.
        </p>
        <div className="mt-3">
          <TableScroll>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className={th}>Osavõistlus</th><th className={th}>Olek</th><th className={`${th} text-right`}>KP-sid</th>
                  <th className={`${th} text-right`}>Võistkondi</th><th className={`${th} text-right`}>Läbitud KP kokku</th>
                  <th className={`${th} text-right`}>Keskmine</th><th className={`${th} text-right`}>Ümardatud</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {ranking.competitions.map((summary) => {
                  const competition = competitions.find((item) => item.id === summary.id)
                  return (
                    <tr key={summary.id}>
                      <td className={td}><Link href={`/dashboard/competitions/${summary.id}`} className="text-primary hover:underline">{summary.name}</Link></td>
                      <td className={td}>{competition?.statusLabel}</td>
                      <td className={tdNum}>{summary.kpCount}</td>
                      <td className={tdNum}>{summary.startedTeamCount}{summary.startedTeamCount !== summary.teamCount && <span className="text-xs text-ink-muted"> / {summary.teamCount}</span>}</td>
                      <td className={tdNum}>{summary.passedTotal}</td>
                      <td className={tdNum}>{summary.average === null ? "–" : formatNumber(summary.average, 2)}</td>
                      <td className={`${tdNum} font-semibold`}>{summary.roundedAverage ?? "–"}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </TableScroll>
        </div>
        <p className="mt-4 text-sm text-ink" data-testid="counted-kp">
          Arvestatav KP-de arv: <strong className="text-lg">{ranking.countedKpCount ?? "–"}</strong>
          {minimum.length > 0 && <span className="text-ink-muted"> (väikseim ümardatud keskmine: {minimum.map((summary) => summary.name).join(", ")})</span>}
        </p>
      </Card>

      <Card className="p-4 sm:p-5">
        <h2 className="font-semibold text-ink">Reeglite kontroll</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Võrreldakse osavõistluste sama tähisega KP-sid ja karistuselemente: tüüp, maksimum, arvutusmeetod, erandid, väljad, hindamisosad ja seaded.
        </p>
        {rules.scoringModes.length > 1 && (
          <div role="alert" className="mt-3 rounded-control border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">
            Osavõistlustel on erinev hindamissüsteem, seega pingerida ei arvutata:
            <ul className="mt-1 list-disc pl-5">
              {rules.scoringModes.map((variant) => <li key={variant.value}>{names(variant.competitionIds)}: {variant.value}</li>)}
            </ul>
          </div>
        )}
        {rulesOk ? (
          <p className="mt-3 text-sm font-medium text-green-700">✓ Kõik {rules.comparedCodes} võrreldud elementi vastavad kõigil osavõistlustel samadele reeglitele.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {(rules.differences.length > 0 || rules.missing.length > 0) && (
              <p className="text-sm font-medium text-amber-800">
                Erinevusi leiti {differenceCodes.size} elemendis{rules.missing.length > 0 ? `, ${rules.missing.length} elementi puudub mõnel osavõistlusel` : ""}.
              </p>
            )}
            <ul className="space-y-2">
              {rules.differences.map((difference) => (
                <li key={`${difference.code}-${difference.property}`} className="rounded-control border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
                  <span className="font-medium text-ink">{difference.code} · {difference.name} — {difference.property}</span>
                  <ul className="mt-1 space-y-0.5">
                    {difference.variants.map((variant) => (
                      <li key={variant.competitionIds.join()} className="text-ink-muted">
                        <span className="text-ink">{names(variant.competitionIds)}:</span> {variant.value}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
              {rules.missing.map((item) => (
                <li key={`missing-${item.code}`} className="rounded-control border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
                  <span className="font-medium text-ink">{item.code} · {item.name}</span> <span className="text-ink-muted">puudub: {names(item.missingIn)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {rules.ignored.length > 0 && (
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-ink-muted">Arvestusse ei lähe {rules.ignored.length} elementi (postkastid ja käsitsi sisestatavad)</summary>
            <ul className="mt-1 list-disc pl-5 text-ink-muted">
              {rules.ignored.map((item) => (
                <li key={`${item.competitionId}-${item.code}`}>{competitionName.get(item.competitionId)}: {item.code} · {item.name} ({ELEMENT_TYPE_LABELS[item.type] ?? item.type})</li>
              ))}
            </ul>
          </details>
        )}
      </Card>

      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-ink">Pingerida</h2>
          {ranking.classes.length > 0 && (
            <nav aria-label="Klass" className="flex flex-wrap gap-1 text-sm">
              {[null, ...ranking.classes].map((className) => {
                const active = className === selectedClass
                return (
                  <Link
                    key={className ?? "all"}
                    href={className ? `/dashboard/series/${series.id}?klass=${encodeURIComponent(className)}` : `/dashboard/series/${series.id}`}
                    aria-current={active ? "page" : undefined}
                    className={`rounded-full px-3 py-1 ${active ? "bg-primary text-primary-foreground" : "bg-canvas text-ink hover:bg-line"}`}
                  >
                    {className ?? "Kõik"}
                  </Link>
                )
              })}
            </nav>
          )}
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          Tulemus = {ranking.countedKpCount ?? "kõigi"} parima KP punktid + karistused (vastutegevus, varustus, hilinemine, katkestamine, muu element ja käsitsi karistused). Võrdse tulemusega võistkonnad jagavad kohta.
        </p>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">{ranking.mixedScoringModes ? "Pingerida ei arvutata." : "Tulemusi pole veel."}</p>
        ) : (
          <div className="mt-3">
            <TableScroll>
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className={th}>{selectedClass ? "Klassi koht" : "Koht"}</th>
                    <th className={th}>{selectedClass ? "Üldkoht" : "Klassi koht"}</th>
                    <th className={th}>Võistkond</th><th className={th}>Klass</th>
                    <th className={`${th} text-right`}>Läbitud KP</th>
                    <th className={`${th} text-right`}>KP {unit.toLocaleLowerCase("et")}</th>
                    <th className={`${th} text-right`}>Karistused</th>
                    <th className={`${th} text-right`}>Kokku</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((row) => {
                    const counted = row.kpScores.filter((score) => score.counted)
                    const skipped = row.kpScores.filter((score) => !score.counted)
                    return (
                      <tr key={`${row.competitionId}-${row.team.id}`} data-team={row.team.name}>
                        <td className={`${td} font-semibold`}>{selectedClass ? row.classRank : row.rank}</td>
                        <td className={`${td} text-ink-muted`}>{selectedClass ? row.rank : row.classRank ?? "–"}</td>
                        <td className={td}>
                          <span className="font-medium text-ink">{row.team.name}</span>
                          <span className="block text-xs text-ink-muted">{row.team.code} · {row.competitionName}</span>
                          <details className="mt-1 text-xs">
                            <summary className="cursor-pointer text-primary">Arvestatud KP-d ({counted.length})</summary>
                            <p className="mt-1 text-ink">{counted.map((score) => `${score.code} ${points(score.points)}`).join(" · ") || "–"}</p>
                            {skipped.length > 0 && <p className="mt-0.5 text-ink-muted">Arvestamata: {skipped.map((score) => `${score.code} ${points(score.points)}`).join(" · ")}</p>}
                          </details>
                        </td>
                        <td className={td}>{row.team.class ?? "–"}</td>
                        <td className={tdNum}>{row.passedCount}</td>
                        <td className={tdNum}>{points(row.kpTotal)}</td>
                        <td className={tdNum}>{row.penaltyTotal === 0 ? "–" : points(row.penaltyTotal)}</td>
                        <td className={`${tdNum} font-semibold text-ink`}>{points(row.total)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </TableScroll>
          </div>
        )}
      </Card>
    </div>
  )
}
