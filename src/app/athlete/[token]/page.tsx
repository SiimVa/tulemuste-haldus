import { prisma } from "@/lib/prisma"
import { notFound } from "next/navigation"

export const dynamic = "force-dynamic"


export default async function AthletePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const accessToken = await prisma.accessToken.findUnique({
    where: { token },
    include: {
      competition: { select: { id: true, name: true } },
      team: { include: { members: true } },
    },
  })

  if (!accessToken || accessToken.type !== "ATHLETE" || !accessToken.team) notFound()

  const team = accessToken.team
  const competitionId = accessToken.competition.id

  const [results, miscEntries, elements] = await Promise.all([
    prisma.result.findMany({
      where: { teamId: team.id },
      include: {
        element: {
          select: { id: true, name: true, code: true, order: true, type: true, fields: { orderBy: { order: "asc" } } },
        },
      },
    }),
    prisma.miscEntry.findMany({
      where: { teamId: team.id },
      include: {
        element: { select: { id: true, name: true, code: true, order: true, type: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.scoringElement.findMany({
      where: { competitionId },
      orderBy: { order: "asc" },
      select: { id: true, name: true, code: true, order: true, type: true, isCancelled: true },
    }),
  ])

  await prisma.accessToken.update({ where: { token }, data: { lastUsedAt: new Date() } })

  // Grupeeri MiscEntry-d elemendi järgi
  const miscByElement = new Map<string, typeof miscEntries>()
  for (const e of miscEntries) {
    const list = miscByElement.get(e.elementId) ?? []
    list.push(e)
    miscByElement.set(e.elementId, list)
  }

  // Kõik elemendid mille kohta on andmeid (Result või MiscEntry)
  const resultMap = new Map(results.map(r => [r.elementId, r]))
  const activeElementIds = new Set([
    ...results.map(r => r.elementId),
    ...miscEntries.map(e => e.elementId),
  ])
  const activeElements = elements
    .filter(el => activeElementIds.has(el.id))
    .sort((a, b) => a.order - b.order)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <span className="font-semibold text-gray-900">{accessToken.competition.name}</span>
          <span className="text-sm text-gray-500">{team.name}</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <div className="bg-white border rounded-xl p-5">
          <h1 className="text-lg font-bold text-gray-900">{team.name}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {team.class && <span className="bg-gray-100 px-2 py-0.5 rounded-full text-xs mr-2">{team.class}</span>}
            {team.members.filter(m => m.role === "COMPETITOR").map(m => m.name).join(", ")}
          </p>
        </div>

        {activeElements.length === 0 ? (
          <div className="text-center py-10 text-gray-400 bg-white border rounded-xl">
            <p className="text-2xl mb-2">📋</p>
            <p>Tulemusi pole veel sisestatud</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeElements.map(el => {
              const result = resultMap.get(el.id)
              const miscList = miscByElement.get(el.id) ?? []

              // Muu element — kuva MiscEntry kirjed
              if (el.type === "OTHER") {
                const total = miscList.reduce((s, e) => s + e.points, 0)
                return (
                  <div key={el.id} className="bg-white border rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <span className="font-mono text-xs text-gray-400 mr-1">[{el.code}]</span>
                        <span className="font-semibold text-gray-900">{el.name}</span>
                        <span className="ml-2 text-xs bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded">Muu</span>
                      </div>
                      <span className={`text-sm font-mono font-semibold ${total >= 0 ? "text-green-700" : "text-red-700"}`}>
                        {total >= 0 ? "+" : ""}{total}p
                      </span>
                    </div>
                    <div className="space-y-1">
                      {miscList.map(entry => (
                        <div key={entry.id} className="flex items-center justify-between text-sm py-1 border-t first:border-t-0">
                          <span className="text-gray-600">{entry.description}</span>
                          <span className={`font-mono font-medium ${entry.points >= 0 ? "text-green-600" : "text-red-600"}`}>
                            {entry.points >= 0 ? "+" : ""}{entry.points}p
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              }

              // Tavaline element — kuva Result väljad
              if (!result) return null
              let values: Record<string, string> = {}
              try { values = JSON.parse(result.values) } catch {}

              const resultEl = result.element
              const inputFields = resultEl.fields.filter(f => f.type !== "COMPUTED")

              return (
                <div key={el.id} className="bg-white border rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <span className="font-mono text-xs text-gray-400 mr-1">[{el.code}]</span>
                      <span className="font-semibold text-gray-900">{el.name}</span>
                    </div>
                    {result.exceptionLabel && (
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                        {result.exceptionLabel}
                      </span>
                    )}
                  </div>

                  {!result.exceptionLabel && inputFields.map(field => {
                    let display = "–"
                    if (field.type === "TIME_RANGE") {
                      const toSec = (v: string) => { const p = String(v).trim().split(":"); return p.length === 3 ? +p[0]*3600 + +p[1]*60 + +p[2] : p.length === 2 ? +p[0]*60 + +p[1] : 0 }
                      const st = toSec(values[field.name + "_start"] ?? "")
                      const en = toSec(values[field.name + "_end"] ?? "")
                      if (values[field.name + "_start"] && values[field.name + "_end"]) {
                        const dur = en >= st ? en - st : en + 86400 - st
                        const h = Math.floor(dur/3600), m = Math.floor((dur%3600)/60), s = dur%60
                        display = `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`
                      }
                    } else {
                      display = values[field.name] ?? "–"
                    }
                    return (
                      <div key={field.id} className="flex items-center justify-between text-sm py-1 border-t first:border-t-0">
                        <span className="text-gray-500">{field.label}</span>
                        <span className="font-mono font-medium text-gray-900">{display}</span>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
