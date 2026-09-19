export type ProgressTeam = { id: string; dnfFromElementOrder?: number | null }

export function isWithdrawnAtElement(team: ProgressTeam, order: number): boolean {
  return team.dnfFromElementOrder != null && order >= team.dnfFromElementOrder
}

export function elementProgress(teams: ProgressTeam[], order: number, enteredTeamIds: Iterable<string>) {
  const enteredIds = new Set(enteredTeamIds)
  const eligible = teams.filter(team => !isWithdrawnAtElement(team, order))
  return {
    entered: eligible.filter(team => enteredIds.has(team.id)).length,
    total: eligible.length,
    withdrawn: teams.length - eligible.length,
  }
}
