import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { Card } from "@/components/ui/card"
import { TableScroll, td, tdNum, th } from "@/components/dashboard/WidgetCard"
import { LeaderboardClassFilter } from "@/components/leaderboard/LeaderboardClassFilter"
import { SeriesLeaderboard } from "@/components/series/SeriesLeaderboard"
import { formatDateTime, formatNumber } from "@/lib/dashboard/format"
import { leaderboardClassFilter } from "@/lib/leaderboard"
import { loadSeriesView } from "@/lib/seriesRanking.server"
import { seriesGaps, seriesKpCodes } from "@/lib/seriesInsights"
import { ELEMENT_TYPE_LABELS } from "@/lib/seriesRules"

export const dynamic = "force-dynamic"

export default async function SeriesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ class?: string | string[] }>
}) {
  const session = await auth()
  if (!session?.user) redirect("/login")
  if (session.user.role !== "ADMIN") redirect("/dashboard")
  const [{ id }, query] = await Promise.all([params, searchParams])

  const view = await loadSeriesView(id, "internal")
  if (!view?.rules) notFound()
  const { series, competitions, ranking, rules } = view
  const competitionName = new Map(competitions.map((competition) => [competition.id, competition.name]))
  const names = (ids: string[]) => ids.map((competitionId) => competitionName.get(competitionId) ?? competitionId).join(", ")
  const unfinished = competitions.filter((competition) => competition.status !== "FINISHED")
  const minimum = ranking.competitions.filter((summary) => summary.roundedAverage !== null && summary.roundedAverage === ranking.countedKpCount)
  const matchesClass = leaderboardClassFilter(query.class, ranking.classes)
  const rows = ranking.rows.filter((row) => matchesClass(row.team))
  const unit = ranking.scoringMode === "PENALTY" ? "karistuspunktid" : "punktid"
  const differenceCodes = new Set(rules.differences.map((difference) => difference.code))
  const rulesOk = rules.scoringModes.length <= 1 && rules.differences.length === 0 && rules.missing.length === 0

  return (
    <div className="space-y-6">
      {series.freezeAt && (
        <p role="status" className="rounded-card border border-primary-soft bg-primary-soft px-4 py-3 text-sm text-primary-hover">
          {series.frozen
            ? `Avalik vaade on külmutatud alates ${formatDateTime(series.freezeAt)}. Siin näed jooksvat seisu.`
            : `Avalik vaade külmutatakse ${formatDateTime(series.freezeAt)}.`}{" "}
          <Link href={`/dashboard/series/${series.id}/public`} className="font-medium underline">Muuda</Link>
        </p>
      )}
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

      <section aria-labelledby="series-ranking-title" className="space-y-3">
        <div>
          <h2 id="series-ranking-title" className="font-semibold text-ink">Pingerida</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Tulemus = {ranking.countedKpCount ?? "kõigi"} parima KP {unit} + karistused (vastutegevus, varustus, hilinemine, katkestamine, muu element ja käsitsi karistused).
            Hallid KP-d ei lähe arvesse. Võrdse tulemusega võistkonnad jagavad kohta.
          </p>
        </div>
        {ranking.mixedScoringModes ? <p className="py-6 text-center text-sm text-ink-muted">Pingerida ei arvutata.</p> : (
          <>
            <LeaderboardClassFilter classes={ranking.classes} />
            <SeriesLeaderboard rows={rows} gaps={seriesGaps(ranking)} kpCodes={seriesKpCodes(ranking)} showClasses={ranking.classes.length > 0} unit={unit} />
          </>
        )}
      </section>
    </div>
  )
}
