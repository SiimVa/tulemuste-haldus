import type { CompetitionOverview } from "@/lib/competitionOverview"

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white border rounded-xl px-4 py-3">
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  )
}

const TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  CHECKPOINT: { label: "KP", cls: "bg-blue-100 text-blue-700" },
  PENALTY_BOX: { label: "PK", cls: "bg-orange-100 text-orange-700" },
  COUNTER_ACTION: { label: "VT", cls: "bg-red-100 text-red-700" },
  EQUIPMENT_CHECK: { label: "VA", cls: "bg-yellow-100 text-yellow-700" },
  LATENESS: { label: "HL", cls: "bg-purple-100 text-purple-700" },
  ABANDONMENT: { label: "KT", cls: "bg-rose-100 text-rose-700" },
  OTHER: { label: "MU", cls: "bg-teal-100 text-teal-700" },
  MANUAL: { label: "KS", cls: "bg-gray-100 text-gray-600" },
}

export function CompetitionDashboard({ data }: { data: CompetitionOverview }) {
  const { competition, teamCount, inCompCount, classCount, elementCount, elements, totalEntered, totalSlots, progressPct } = data
  const statusLabel = competition.status === "ACTIVE" ? "Aktiivne" : competition.status === "FINISHED" ? "Lõppenud" : "Ettevalmistus"

  return (
    <div className="space-y-6">
      {/* Põhinumbrid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Võistkonda" value={teamCount} sub={inCompCount !== teamCount ? `${inCompCount} arvestuses` : undefined} />
        <StatCard label="Klassi" value={classCount} />
        <StatCard label="Hindamiselementi" value={elementCount} />
        <StatCard label="Tulemusi sisestatud" value={`${progressPct}%`} sub={`${totalEntered} / ${totalSlots}`} />
      </div>

      {/* Üldine edenemine */}
      <div className="bg-white border rounded-xl p-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-gray-900">Üldine edenemine</h2>
          <span className="text-sm text-gray-500">{totalEntered} / {totalSlots} sooritust</span>
        </div>
        <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      {/* Per-element edenemine */}
      <div className="bg-white border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h2 className="font-semibold text-gray-900">Sooritused elementide kaupa</h2>
          <p className="text-xs text-gray-400 mt-0.5">Mitu võistkonda on igas elemendis tulemuse saanud</p>
        </div>
        <div className="divide-y">
          {elements.length === 0 ? (
            <p className="px-5 py-6 text-sm text-gray-400 text-center">Ühtegi elementi pole lisatud</p>
          ) : (
            elements.map((el) => {
              const pct = el.total > 0 ? Math.round((el.entered / el.total) * 100) : 0
              const badge = TYPE_BADGE[el.type] ?? { label: "?", cls: "bg-gray-100 text-gray-600" }
              const done = el.entered >= el.total && el.total > 0
              return (
                <div key={el.id} className={`px-5 py-3 flex items-center gap-3 ${el.isCancelled ? "opacity-50" : ""}`}>
                  <span className="font-mono text-xs text-gray-400 w-7 shrink-0">{el.code}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${badge.cls}`}>{badge.label}</span>
                  <span className={`text-sm font-medium shrink-0 w-40 truncate ${el.isCancelled ? "line-through text-gray-400" : "text-gray-900"}`}>{el.name}</span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${done ? "bg-green-500" : "bg-blue-400"}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className={`text-sm font-mono shrink-0 w-16 text-right ${done ? "text-green-700 font-semibold" : "text-gray-600"}`}>
                    {el.entered}/{el.total}
                  </span>
                </div>
              )
            })
          )}
        </div>
      </div>

      <p className="text-center text-xs text-gray-400">
        {statusLabel} · {competition.location ?? "Tulemuste haldus"}
      </p>
    </div>
  )
}
