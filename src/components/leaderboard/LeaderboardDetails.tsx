import type { LeaderboardGap } from "@/lib/leaderboard"

export function RankBadge({ rank }: { rank: number | null }) {
  const medals = [
    { label: "Kuld", style: "bg-yellow-100 text-yellow-900 border-yellow-400" },
    { label: "Hõbe", style: "bg-slate-200 text-slate-800 border-slate-400" },
    { label: "Pronks", style: "bg-orange-200 text-orange-950 border-orange-400" },
  ]
  const medal = rank !== null && rank >= 1 && rank <= 3 ? medals[rank - 1] : null
  return medal ? (
    <span title={medal.label} aria-label={`${rank}. koht – ${medal.label}`} className={`inline-flex min-w-7 justify-center rounded border px-1.5 py-0.5 font-bold ${medal.style} [print-color-adjust:exact]`}>
      {rank}
    </span>
  ) : <>{rank ?? "–"}</>
}

const headings = ["Vahe esimesega (klass)", "Vahe eelmisega (klass)", "Vahe esimesega (üld)", "Vahe eelmisega (üld)"]
const values = (gap?: LeaderboardGap) => [gap?.classFirst, gap?.classPrevious, gap?.overallFirst, gap?.overallPrevious]
const format = (value: number | null | undefined) => value == null ? "–" : value.toFixed(2)

export function GapHeadings({ showClasses }: { showClasses: boolean }) {
  return headings.slice(showClasses ? 0 : 2).map(label => (
    <th key={label} className="sticky top-0 z-20 bg-gray-50 px-3 py-3 text-xs font-medium text-gray-600 text-right min-w-28">{label}</th>
  ))
}

export function GapCells({ gap, showClasses }: { gap?: LeaderboardGap; showClasses: boolean }) {
  return values(gap).slice(showClasses ? 0 : 2).map((value, index) => (
    <td key={index} className="px-3 py-3 text-right font-mono text-xs text-gray-600">{format(value)}</td>
  ))
}

export function GapSummary({ gap, showClasses }: { gap?: LeaderboardGap; showClasses: boolean }) {
  return <dl className="grid grid-cols-2 gap-2 text-xs">
    {headings.slice(showClasses ? 0 : 2).map((heading, index) => <div key={heading}>
      <dt className="text-gray-500">{heading}</dt>
      <dd className="font-mono">{format(values(gap)[index + (showClasses ? 0 : 2)])}</dd>
    </div>)}
  </dl>
}
