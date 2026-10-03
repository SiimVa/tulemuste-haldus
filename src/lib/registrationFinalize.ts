// Osalejate nimekirja kinnitamise eelkontroll. Liikme e-post seob ta
// kasutajakontoga ja võistlusel võib üks e-post olla ainult ühel liikmel.
// Kontroll leiab kõik kordused korraga; kui korraldaja kinnitab nii, jääb
// e-post esimesele: olemasoleva võistkonna liikmele, varem esitatud avaldusele
// ja avalduse sees esimesena kirjas olevale liikmele.

export type FinalizeMember = { name: string; email?: string }
export type FinalizeApplication<T extends FinalizeMember = FinalizeMember> = { id: string; teamName: string; members: T[] }
export type ExistingTeamMember = { email: string | null; userEmail: string | null; teamName: string }

export type FinalizeIssue =
  | { key: string; type: "DUPLICATE_IN_TEAM"; email: string; members: string[] }
  | { key: string; type: "IN_OTHER_APPLICATION"; email: string; member: string; otherTeam: string }
  | { key: string; type: "IN_EXISTING_TEAM"; email: string; member: string; otherTeam: string }

export type ApplicationIssues = { applicationId: string; teamName: string; issues: FinalizeIssue[] }

export type FinalizeAnalysis<T extends FinalizeMember = FinalizeMember> = {
  issues: ApplicationIssues[]
  // Liikmed kinnitamiseks: kordunud e-post on eemaldatud.
  members: Map<string, T[]>
}

export function normalizeMemberEmail(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? ""
}

export function analyzeFinalize<T extends FinalizeMember>(applications: FinalizeApplication<T>[], existing: ExistingTeamMember[]): FinalizeAnalysis<T> {
  const claimed = new Map<string, { teamName: string; existing: boolean }>()
  for (const member of existing) {
    for (const email of [member.email, member.userEmail]) {
      const normalized = normalizeMemberEmail(email)
      if (normalized && !claimed.has(normalized)) claimed.set(normalized, { teamName: member.teamName, existing: true })
    }
  }

  const issues: ApplicationIssues[] = []
  const members = new Map<string, T[]>()
  for (const application of applications) {
    const found: FinalizeIssue[] = []
    const keptInTeam = new Map<string, string[]>()
    const withoutEmail = (member: T): T => ({ ...member, email: undefined })
    const resolved = application.members.map((member, index): T => {
      const email = normalizeMemberEmail(member.email)
      if (!email) return withoutEmail(member)
      const claim = claimed.get(email)
      if (claim) {
        const type = claim.existing ? "IN_EXISTING_TEAM" as const : "IN_OTHER_APPLICATION" as const
        found.push({ key: `${application.id}:${type}:${email}:${index}`, type, email, member: member.name, otherTeam: claim.teamName })
        return withoutEmail(member)
      }
      const names = keptInTeam.get(email)
      if (names) {
        names.push(member.name)
        return withoutEmail(member)
      }
      keptInTeam.set(email, [member.name])
      return { ...member, email: member.email?.trim() }
    })
    for (const [email, names] of keptInTeam) {
      if (names.length > 1) found.push({ key: `${application.id}:DUPLICATE_IN_TEAM:${email}`, type: "DUPLICATE_IN_TEAM", email, members: names })
    }
    for (const email of keptInTeam.keys()) claimed.set(email, { teamName: application.teamName, existing: false })
    members.set(application.id, resolved)
    if (found.length) issues.push({ applicationId: application.id, teamName: application.teamName, issues: found })
  }
  return { issues, members }
}

export function finalizeIssueText(issue: FinalizeIssue): string {
  if (issue.type === "DUPLICATE_IN_TEAM") {
    return `E-post ${issue.email} on mitmel liikmel: ${issue.members.join(", ")}. Kinnitamisel jääb see liikmele ${issue.members[0]}.`
  }
  if (issue.type === "IN_OTHER_APPLICATION") {
    return `${issue.member}: e-post ${issue.email} on ka võistkonna „${issue.otherTeam}” avalduses, mis esitati varem. Kinnitamisel jääb see sinna.`
  }
  return `${issue.member}: e-post ${issue.email} on juba võistkonna „${issue.otherTeam}” liikmel. Kinnitamisel jääb see sinna.`
}

export function finalizeIssueKeys(issues: ApplicationIssues[]): string[] {
  return issues.flatMap((application) => application.issues.map((issue) => issue.key))
}
