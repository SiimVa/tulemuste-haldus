import { AthleteResultCards } from "@/components/athlete/AthleteResultCards"
import type { TeamResultData } from "@/lib/teamResults.server"

export function TeamResultsView({ data }: { data: TeamResultData }) {
  const {
    team,
    totalBlock,
    showTotal,
    showRank,
    cards,
    scoringMode,
    pointsMode,
    pointsRanges,
    defaultMax,
  } = data

  return (
    <div className="space-y-4">
      <div className="bg-white border rounded-xl p-5">
        <h1 className="text-lg font-bold text-gray-900">{team.name}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {team.class && (
            <span className="bg-gray-100 px-2 py-0.5 rounded-full text-xs mr-2">
              {team.class}
            </span>
          )}
          {team.members
            .filter((member) => member.role === "COMPETITOR")
            .map((member) => member.name)
            .join(", ")}
        </p>
      </div>

      {totalBlock && (
        <div className="bg-blue-600 text-white rounded-xl p-5">
          <div className="flex items-center justify-between">
            <div>
              {showTotal ? (
                <>
                  <p className="text-xs text-blue-100">Kokku</p>
                  <p className="text-2xl font-bold font-mono">
                    {totalBlock.totalLabel}
                  </p>
                </>
              ) : (
                <p className="text-sm font-medium text-blue-50">
                  Pingerea koht
                </p>
              )}
            </div>
            {showRank && (
              <div className="text-right">
                {totalBlock.statusLabel && (
                  <p className="text-xs font-medium text-blue-50 mb-0.5">
                    {totalBlock.statusLabel}
                  </p>
                )}
                {totalBlock.rank != null && (
                  <p className="text-xs text-blue-100">
                    Üldkoht{" "}
                    <span className="text-lg font-bold text-white">
                      {totalBlock.notional ? "~" : ""}
                      {totalBlock.rank}
                    </span>
                    <span className="text-blue-200">
                      /{totalBlock.totalTeams}
                    </span>
                  </p>
                )}
                {totalBlock.classRank != null &&
                  totalBlock.classTotal > 1 && (
                    <p className="text-xs text-blue-100 mt-1">
                      Klassis{" "}
                      <span className="font-bold text-white">
                        {totalBlock.notional ? "~" : ""}
                        {totalBlock.classRank}
                      </span>
                      <span className="text-blue-200">
                        /{totalBlock.classTotal}
                      </span>
                    </p>
                  )}
                {totalBlock.notional && (
                  <p className="text-[10px] text-blue-200 mt-0.5">
                    mitteametlik koht
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {cards.length === 0 ? (
        <div className="text-center py-10 text-gray-400 bg-white border rounded-xl">
          <p className="text-2xl mb-2">📋</p>
          <p>Tulemusi pole veel sisestatud</p>
        </div>
      ) : (
        <AthleteResultCards
          cards={cards}
          scoringMode={scoringMode}
          pointsMode={pointsMode}
          pointsRanges={pointsRanges}
          defaultMax={defaultMax}
          allowSimulate={false}
        />
      )}
    </div>
  )
}
