import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { notFound } from "next/navigation"
import { naturalCompare } from "@/lib/utils"
import Link from "next/link"
import { ElementResultsTable } from "@/components/competition/ElementResultsTable"
import { computeFields } from "@/lib/calculators"
import { CalcFormulaDisplay } from "@/components/CalcFormulaDisplay"
import { ExportMenu } from "@/components/ExportMenu"
import { ElementCancelButton } from "@/components/competition/ElementCancelButton"
import { ElementDeleteButton } from "@/components/competition/ElementDeleteButton"
import { MiscEntriesTable } from "@/components/competition/MiscEntriesTable"
import { ElementSectionsManager } from "@/components/competition/ElementSectionsManager"
import { ResultsImportTrigger } from "@/components/competition/ResultsImportTrigger"
import { RecalcButton } from "@/components/competition/RecalcButton"
import { explainElementScores } from "@/lib/scoreExplainer"

export default async function ElementPage({
  params,
}: {
  params: Promise<{ id: string; elementId: string }>
}) {
  await auth()
  const { id: competitionId, elementId } = await params

  const element = await prisma.scoringElement.findUnique({
    where: { id: elementId },
    include: {
      fields: { orderBy: { order: "asc" } },
      exceptions: { orderBy: { order: "asc" } },
      calcMethod: true,
      competition: { select: { scoringMode: true, defaultKPMaxValue: true } },
      results: {
        include: { team: true },
        orderBy: { updatedAt: "desc" },
      },
      scores: {
        include: { team: true },
      },
      miscEntries: {
        include: { team: { select: { id: true, name: true, code: true } } },
        orderBy: { createdAt: "asc" },
      },
      sections: {
        include: {
          fields: { orderBy: { order: "asc" } },
          calcMethod: true,
        },
        orderBy: { order: "asc" },
      },
    },
  })

  if (!element) notFound()

  const teams = (await prisma.team.findMany({
    where: { competitionId },
  })).sort((a, b) => naturalCompare(a.code, b.code))

  const breakdowns = explainElementScores(
    {
      type: element.type,
      maxValue: element.maxValue,
      fields: element.fields,
      calcMethod: element.calcMethod,
      sections: element.sections.map(s => ({
        id: s.id,
        name: s.name,
        maxValue: s.maxValue,
        fields: s.fields,
        calcMethod: s.calcMethod,
      })),
    },
    element.results.map(r => ({
      teamId: r.teamId,
      values: r.values,
      exceptionLabel: r.exceptionLabel,
      exceptionPenalty: r.exceptionPenalty,
    })),
    teams,
    element.scores,
    {
      scoringMode: element.competition.scoringMode as "PENALTY" | "PLUS",
      defaultKPMaxValue: element.competition.defaultKPMaxValue ?? 30,
    }
  )

  const CALC_LABELS: Record<string, string> = {
    RELATIVE_RANKING: "Pingerida valemiga",
    ABSOLUTE_TIME: "Absoluutne aeg",
    ABSOLUTE_POINTS: "Absoluutsed punktid",
    ABSOLUTE_PENALTY: "Absoluutsed karistuspunktid",
    FIXED_RANKING: "Fikseeritud pingerida",
    VALUE_BASED: "Tulemuspõhiselt jaotav",
    PERFORMANCE_BASED: "Soorituspõhine",
    CUSTOM: "Korraldaja valem",
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2 text-sm text-gray-400">
        <Link href="/dashboard">Võistlused</Link> /
        <Link href={`/dashboard/competitions/${competitionId}`}>Võistlus</Link> /
        <span className="text-gray-700 font-medium">{element.name}</span>
      </div>

      {element.isCancelled && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <span className="text-xs font-bold bg-red-600 text-white px-2 py-0.5 rounded">TÜHISTATUD</span>
          <p className="text-sm text-red-700">See element on annuleeritud. Kõik võistkonnad saavad 0 punkti selle KP eest.</p>
        </div>
      )}

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            <span className="text-gray-400 font-mono mr-2">[{element.code}]</span>
            {element.name}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Arvutusmeetod: {element.calcMethod ? CALC_LABELS[element.calcMethod.type] : element.type === "OTHER" ? "Muu element (kirjepõhine)" : "Määramata"}
            {element.calcMethod?.customFormula && (
              <code className="ml-2 bg-gray-100 px-1.5 py-0.5 rounded text-xs">{element.calcMethod.customFormula}</code>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ResultsImportTrigger elementId={element.id} competitionId={competitionId} elementName={element.name} />
          <RecalcButton competitionId={competitionId} />
          <ElementCancelButton elementId={element.id} isCancelled={element.isCancelled} competitionId={competitionId} />
          <ElementDeleteButton elementId={element.id} elementName={element.name} competitionId={competitionId} />
          <ExportMenu groups={[{
            title: "Selle KP tulemused",
            options: [
              { label: "Excel (.xlsx)", href: `/api/competitions/${competitionId}/elements/${elementId}/export?format=xlsx` },
              { label: "CSV", href: `/api/competitions/${competitionId}/elements/${elementId}/export?format=csv` },
              { label: "Täidetud protokoll (PDF)", printHref: `/dashboard/competitions/${competitionId}/elements/${elementId}/results-print` },
              { label: "Tühi protokoll (PDF)", printHref: `/dashboard/competitions/${competitionId}/elements/${elementId}/protocol` },
            ],
          }]} />
          <Link
            href={`/dashboard/competitions/${competitionId}/elements/new?copyFrom=${elementId}`}
            className="text-sm px-3 py-1.5 border rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Kopeeri
          </Link>
          <Link
            href={`/dashboard/competitions/${competitionId}/elements/${elementId}/edit`}
            className="text-sm px-3 py-1.5 border rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Muuda
          </Link>
        </div>
      </div>

      {/* Arvutusvalem */}
      {element.calcMethod && (
        <div className="bg-white border rounded-xl p-4 mb-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Arvutusvalem
            <span className="ml-2 text-xs font-normal text-gray-400">
              ({CALC_LABELS[element.calcMethod.type] ?? element.calcMethod.type})
            </span>
          </h3>
          <CalcFormulaDisplay
            type={element.calcMethod.type}
            params={element.calcMethod.params}
            customFormula={element.calcMethod.customFormula}
            maxValue={element.maxValue}
          />
        </div>
      )}

      {/* Kombineeritud hindamise sektsioonid */}
      {element.sections.length > 0 && (
        <div className="bg-white border rounded-xl p-5 mb-4">
          <div className="flex items-center gap-2 mb-4">
            <h3 className="font-semibold text-gray-900">Hindamisosad</h3>
            {element.sections.length > 0 && (
              <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                Kombineeritud · {element.sections.length} osa
              </span>
            )}
          </div>
          <ElementSectionsManager
            elementId={element.id}
            competitionId={competitionId}
            initialSections={element.sections.map(s => ({
              id: s.id,
              name: s.name,
              order: s.order,
              maxValue: s.maxValue,
              fields: s.fields.map(f => ({
                id: f.id,
                name: f.name,
                label: f.label,
                type: f.type,
                isResultField: f.isResultField,
                rankingPriority: f.rankingPriority,
                formula: f.formula,
              })),
              calcMethod: s.calcMethod ? {
                id: s.calcMethod.id,
                type: s.calcMethod.type,
                params: s.calcMethod.params,
                customFormula: s.calcMethod.customFormula,
              } : null,
            }))}
          />
        </div>
      )}

      {/* Käsitsi kirjed (misc bonus/karistus) — CHECKPOINT ja MANUAL tüüpidele */}
      {(element.type === "CHECKPOINT" || element.type === "MANUAL") && (
        <div className="bg-white border rounded-xl p-5 mb-4">
          <div className="flex items-center gap-2 mb-4">
            <h3 className="font-semibold text-gray-900">Käsitsi kirjed</h3>
            <span className="text-xs text-gray-400 font-normal">lisanduvad arvutatud skoorile</span>
          </div>
          <MiscEntriesTable
            competitionId={competitionId}
            elementId={element.id}
            teams={teams.map(t => ({ id: t.id, name: t.name, code: t.code }))}
            initialEntries={element.miscEntries.map(e => ({
              id: e.id,
              teamId: e.teamId,
              team: e.team,
              points: e.points,
              description: e.description,
            }))}
          />
        </div>
      )}

      {/* Väljad + erandid info */}
      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Sisendväljad</h3>
          <div className="space-y-2">
            {element.fields.map((f) => {
              const priority = f.rankingPriority ?? (f.isResultField ? 1 : null)
              const priorityLabel =
                priority === 1 ? { text: "1. esmane", cls: "bg-green-100 text-green-700" } :
                priority === 2 ? { text: "2. viik", cls: "bg-blue-100 text-blue-700" } :
                priority === 3 ? { text: "3. viik", cls: "bg-blue-50 text-blue-600" } :
                priority != null ? { text: `${priority}. viik`, cls: "bg-gray-100 text-gray-500" } :
                null
              return (
                <div key={f.id} className="flex items-center gap-2 text-sm flex-wrap">
                  <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{f.name}</span>
                  <span className="text-gray-700">{f.label}</span>
                  <span className="text-gray-400 text-xs">({f.type})</span>
                  {priorityLabel && (
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${priorityLabel.cls}`}>
                      {priorityLabel.text}
                    </span>
                  )}
                  {f.formula && <code className="text-xs text-blue-600">{f.formula}</code>}
                </div>
              )
            })}
          </div>
          {(() => {
            const rankingTypes = ["RELATIVE_RANKING", "FIXED_RANKING", "VALUE_BASED"]
            const usesRanking = element.calcMethod && rankingTypes.includes(element.calcMethod.type)
            const hasComputedFields = element.fields.some(f => f.type === "COMPUTED")
            const rankableTypes = ["NUMBER", "TIME", "TIME_RANGE"]
            const unprioritized = element.fields.filter(f => !f.formula && !f.rankingPriority && !f.isResultField && rankableTypes.includes(f.type))
            if (usesRanking && unprioritized.length > 0 && !hasComputedFields) {
              return (
                <p className="text-xs text-amber-600 mt-2">
                  ⚠ Väljad <strong>{unprioritized.map(f => f.label || f.name).join(", ")}</strong> pole tiebreakerina märgitud — viiki ei lahendata.{" "}
                  <Link href={`/dashboard/competitions/${competitionId}/elements/${elementId}/edit`} className="underline">Muuda elementi</Link>
                </p>
              )
            }
            return null
          })()}
        </div>

        <div className="bg-white border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Erandid</h3>
          <div className="space-y-1.5">
            {element.exceptions.map((ex) => {
              const magnitude = Math.abs(ex.penalty)
              const isPlus = element.competition.scoringMode === "PLUS"
              return (
                <div key={ex.id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">{ex.label}</span>
                  <span className="font-mono text-red-600">
                    {isPlus ? `−${magnitude}p` : `+${magnitude}p`}
                  </span>
                </div>
              )
            })}
          </div>
          <p className="text-xs text-gray-400 mt-2">
            {element.competition.scoringMode === "PLUS"
              ? "Erandid lahutavad punkte kogusummast"
              : "Erandid lisavad karistuspunkte kogusummale"}
          </p>
        </div>
      </div>

      {/* Muu element: kirjete haldus */}
      {element.type === "OTHER" && (
        <div className="bg-white border rounded-xl p-5 mb-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Kirjed</h3>
          <MiscEntriesTable
            competitionId={competitionId}
            elementId={element.id}
            teams={teams.map(t => ({ id: t.id, name: t.name, code: t.code }))}
            initialEntries={element.miscEntries.map(e => ({
              id: e.id,
              teamId: e.teamId,
              team: e.team,
              points: e.points,
              description: e.description,
            }))}
          />
        </div>
      )}

      {/* Arvutuste ülevaade — korraldajale kontrolliks */}
      {breakdowns.length > 0 && (
        <details className="bg-white border rounded-xl mb-4 group">
          <summary className="px-5 py-4 cursor-pointer flex items-center justify-between list-none select-none hover:bg-gray-50 rounded-xl">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-gray-900 text-sm">Arvutuste ülevaade</h3>
              <span className="text-xs text-gray-400 font-normal">kuidas iga tiimi punktid tekkisid</span>
            </div>
            <span className="text-gray-400 text-sm group-open:rotate-180 transition-transform">▾</span>
          </summary>
          <div className="px-5 pb-5 border-t">
            <div className="overflow-x-auto mt-3">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-400 border-b">
                    <th className="pb-2 pr-3 font-medium w-8">#</th>
                    <th className="pb-2 pr-3 font-medium">Tiim</th>
                    <th className="pb-2 pr-3 font-medium">Arvutuse selgitus</th>
                    <th className="pb-2 font-medium text-right">Punktid</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdowns.map((b, i) => (
                    <tr key={b.teamId} className={`border-b last:border-0 ${b.isHorsDeCompetition ? "opacity-60" : ""}`}>
                      <td className="py-2 pr-3 text-gray-400 tabular-nums">{i + 1}</td>
                      <td className="py-2 pr-3">
                        <span className="font-mono text-xs text-gray-400 mr-1">[{b.teamCode}]</span>
                        <span className="text-gray-800">{b.teamName}</span>
                        {b.isHorsDeCompetition && <span className="ml-1 text-xs text-gray-400">(HC)</span>}
                        {b.isException && (
                          <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
                            {b.exceptionLabel}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-gray-500 text-xs">
                        {b.sections && b.sections.length > 0 ? (
                          <div className="space-y-0.5">
                            {b.sections.map((s, si) => (
                              <div key={si}>
                                <span className="font-medium text-gray-600">{s.sectionName}:</span>{" "}
                                {s.explanation}
                              </div>
                            ))}
                          </div>
                        ) : (
                          b.explanation
                        )}
                      </td>
                      <td className="py-2 text-right font-mono font-semibold text-gray-900 tabular-nums">
                        {element.competition.scoringMode === "PLUS"
                          ? `+${b.score}p`
                          : `${b.score}p`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-400 mt-3">
              {element.competition.scoringMode === "PENALTY"
                ? "Väiksem arv karistuspunkte = parem tulemus."
                : "Suurem punktisumma = parem tulemus."}
              {" "}Tabel sorteeritud parimast halvimani.
            </p>
          </div>
        </details>
      )}

      {/* Tulemuste tabel (ainult tavaliste elementide jaoks) */}
      {element.type !== "OTHER" && <ElementResultsTable
        element={{
          id: element.id,
          name: element.name,
          fields: element.fields,
          exceptions: element.exceptions,
          directPointsEntry: element.directPointsEntry,
          scoringMode: element.competition.scoringMode as "PENALTY" | "PLUS",
          results: element.results.map(r => {
            let rawValues: Record<string, unknown> = {}
            try { rawValues = JSON.parse(r.values || "{}") } catch {}
            const allValues = computeFields(rawValues as Record<string, string | number>, element.fields)
            return {
              ...r,
              teamName: r.team.name,
              teamCode: r.team.code,
              allValues,
            }
          }),
          scores: element.scores.map(s => ({
            teamId: s.teamId,
            penaltyPoints: s.penaltyPoints,
          })),
        }}
        teams={teams.map(t => ({ id: t.id, name: t.name, code: t.code, isHorsDeCompetition: t.isHorsDeCompetition }))}
      />}
    </div>
  )
}
