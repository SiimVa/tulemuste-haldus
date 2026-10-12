// Korraldaja registreerimise töölaua loendurid ja filtrid. Hoitud puhtana,
// et neid saaks testida ilma andmebaasi ja Reacti komponentideta.

export type MandateWorkflowStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "CHANGES_REQUESTED"

export type MandateProgress = {
  total: number
  // Esitatud või kinnitatud: võistkond on oma mandaadi ära teinud.
  done: number
  approved: number
  submitted: number
  changesRequested: number
  notStarted: number
}

export function mandateProgress(teams: { mandateStatus: MandateWorkflowStatus }[]): MandateProgress {
  const count = (status: MandateWorkflowStatus) => teams.filter((team) => team.mandateStatus === status).length
  const approved = count("APPROVED")
  const submitted = count("SUBMITTED")
  return {
    total: teams.length,
    done: approved + submitted,
    approved,
    submitted,
    changesRequested: count("CHANGES_REQUESTED"),
    notStarted: count("DRAFT"),
  }
}

export function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase("et-EE")
}

// Tühi otsing sobib kõigile; muidu peab iga sõna leiduma mõnes väljas.
export function matchesSearch(query: string, values: (string | null | undefined)[]) {
  const words = normalizeSearch(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const haystack = normalizeSearch(values.filter(Boolean).join(" "))
  return words.every((word) => haystack.includes(word))
}

// Olekufiltrid näitavad ainult olekuid, mis listis tegelikult esinevad,
// kindlas järjekorras ja koos arvuga.
export function statusCounts<T extends string>(items: { status: T }[], order: readonly T[]) {
  return order
    .map((status) => ({ status, count: items.filter((item) => item.status === status).length }))
    .filter((entry) => entry.count > 0)
}
