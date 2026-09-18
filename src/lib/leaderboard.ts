export type LeaderboardGap = {
  classFirst: number | null
  classPrevious: number | null
  overallFirst: number | null
  overallPrevious: number | null
}

// Rows must already be sorted in scoring order and contain only ranked teams.
export function leaderboardGaps<T extends { team: { id: string; class: string | null }; total: number }>(rows: T[]): Map<string, LeaderboardGap> {
  const firstByClass = new Map<string, number>()
  const previousByClass = new Map<string, number>()
  const gaps = new Map<string, LeaderboardGap>()
  const difference = (total: number, reference: number | undefined) =>
    reference === undefined ? null : Math.round(Math.abs(total - reference) * 1000) / 1000
  rows.forEach((row, index) => {
    const cls = row.team.class
    if (cls && !firstByClass.has(cls)) firstByClass.set(cls, row.total)
    gaps.set(row.team.id, {
      classFirst: cls ? difference(row.total, firstByClass.get(cls)) : null,
      classPrevious: cls ? difference(row.total, previousByClass.get(cls)) : null,
      overallFirst: difference(row.total, rows[0]?.total),
      overallPrevious: difference(row.total, rows[index - 1]?.total),
    })
    if (cls) previousByClass.set(cls, row.total)
  })
  return gaps
}

export function leaderboardClassFilter(value: string | string[] | undefined, classes: string[]) {
  const selected = (Array.isArray(value) ? value : value === undefined ? [] : [value])
    .filter(cls => classes.includes(cls))
  return (team: { class: string | null }) => selected.length === 0 || selected.includes(team.class ?? "")
}
