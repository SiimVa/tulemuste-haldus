export type LeaderboardGap = {
  classFirst: number | null
  classPrevious: number | null
  overallFirst: number | null
  overallPrevious: number | null
}

// Rows must already be sorted in scoring order and contain only ranked teams.
export function leaderboardGaps<T extends { team: { id: string; class: string | null }; total: number; classRank?: number | null }>(rows: T[]): Map<string, LeaderboardGap> {
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
  // Class tie-break order can differ from overall order.
  for (const cls of new Set(rows.map(row => row.team.class))) {
    if (!cls) continue
    const classRows = rows.filter(row => row.team.class === cls)
      .sort((a, b) => (a.classRank ?? 0) - (b.classRank ?? 0))
    classRows.forEach((row, index) => {
      const gap = gaps.get(row.team.id)!
      gap.classFirst = difference(row.total, classRows[0]?.total)
      gap.classPrevious = difference(row.total, classRows[index - 1]?.total)
    })
  }
  return gaps
}

export function leaderboardClassFilter(value: string | string[] | undefined, classes: string[]) {
  const selected = (Array.isArray(value) ? value : value === undefined ? [] : [value])
    .filter(cls => classes.includes(cls))
  return (team: { class: string | null }) => selected.length === 0 || selected.includes(team.class ?? "")
}
