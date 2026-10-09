"use client"

import { memo, useMemo } from "react"
import Link from "next/link"
import { DashboardView, FreezeNotice } from "@/components/dashboard/DashboardView"
import { PublicSnapshotRefreshStatus, usePublicSnapshot } from "@/components/public/PublicSnapshotRefresh"
import { dashboardDataFromSnapshot, type PublicDashboardSnapshot } from "@/lib/dashboard/publicSnapshot"

// The countdown changes every second; widgets only need a new render when
// their shared data snapshot changes.
const PublicDashboardWidgets = memo(DashboardView)
const PublicFreezeNotice = memo(FreezeNotice)

export function PublicDashboard({ initial }: { initial: PublicDashboardSnapshot }) {
  const state = usePublicSnapshot(`/api/public/competitions/${initial.competition.id}/dashboard`, initial, 30)
  const data = useMemo(() => dashboardDataFromSnapshot(state.snapshot), [state.snapshot])
  const id = data.competition.id
  const updatedAt = data.generatedAt.toLocaleString("et-EE", { timeZone: "Europe/Tallinn", dateStyle: "medium", timeStyle: "short" })

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-5xl space-y-5 px-4 py-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">{data.competition.name}</h1>
            <p className="mt-1 text-sm text-gray-500">Võistluse ülevaade</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Link href={`/public/${id}/leaderboard`} className="text-blue-600 hover:underline">Pingerida →</Link>
            {state.snapshot.analysisAvailable && (
              <Link href={`/public/${id}/analysis`} className="text-blue-600 hover:underline">Analüüs →</Link>
            )}
            <Link href={`/public/${id}/screen`} className="text-blue-600 hover:underline">Ekraanirežiim →</Link>
          </div>
        </div>

        <PublicFreezeNotice data={data} />
        <PublicDashboardWidgets data={data} />

        <p className="flex items-center justify-center gap-2 text-xs text-gray-400">
          <span>Uuendatud: {updatedAt}</span>
          <span>·</span>
          <PublicSnapshotRefreshStatus state={state} />
        </p>
      </div>
    </div>
  )
}
