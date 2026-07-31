export const ALLOCATION_RULE_TYPES = [
  "GROUP_GUARANTEE",
  "PRIORITY",
] as const
export type AllocationRuleType = (typeof ALLOCATION_RULE_TYPES)[number]

export const ALLOCATION_RULE_SOURCES = ["CLASS", "FORM_FIELD"] as const
export type AllocationRuleSource = (typeof ALLOCATION_RULE_SOURCES)[number]

export const CLASS_BALANCE_MODES = ["OFF", "BALANCED"] as const
export type ClassBalanceMode = (typeof CLASS_BALANCE_MODES)[number]

export type AllocationRuleDefinition = {
  id?: string
  label: string
  type: AllocationRuleType
  source: AllocationRuleSource
  fieldId: string | null
  fieldKey?: string | null
  values: string[]
  quota: number | null
  order: number
}

export type AllocationCandidate = {
  id: string
  submittedAt: number
  createdAt: number
  classId: string | null
  fieldValues: Record<string, string>
}

export type AllocationResult = {
  confirmedIds: string[]
  waitlistedIds: string[]
  reasons: Record<string, string>
}

export function isAllocationRuleType(
  value: unknown
): value is AllocationRuleType {
  return (
    typeof value === "string" &&
    ALLOCATION_RULE_TYPES.includes(value as AllocationRuleType)
  )
}

export function isAllocationRuleSource(
  value: unknown
): value is AllocationRuleSource {
  return (
    typeof value === "string" &&
    ALLOCATION_RULE_SOURCES.includes(value as AllocationRuleSource)
  )
}

export function isClassBalanceMode(
  value: unknown
): value is ClassBalanceMode {
  return (
    typeof value === "string" &&
    CLASS_BALANCE_MODES.includes(value as ClassBalanceMode)
  )
}

function compareCandidates(a: AllocationCandidate, b: AllocationCandidate) {
  return (
    a.submittedAt - b.submittedAt ||
    a.createdAt - b.createdAt ||
    a.id.localeCompare(b.id)
  )
}

function classKey(candidate: AllocationCandidate) {
  return candidate.classId ?? "__NO_CLASS__"
}

function sourceValue(
  candidate: AllocationCandidate,
  rule: AllocationRuleDefinition
): string | null {
  if (rule.source === "CLASS") return candidate.classId
  return rule.fieldId ? candidate.fieldValues[rule.fieldId] ?? null : null
}

function matchesRule(
  candidate: AllocationCandidate,
  rule: AllocationRuleDefinition
) {
  const value = sourceValue(candidate, rule)
  if (!value) return false
  return rule.values.length === 0 || rule.values.includes(value)
}

function nextCandidate(
  candidates: AllocationCandidate[],
  selected: Set<string>,
  classCounts: Map<string, number>,
  balanceClasses: boolean
) {
  const available = candidates.filter(({ id }) => !selected.has(id))
  available.sort((a, b) => {
    if (balanceClasses) {
      const classDifference =
        (classCounts.get(classKey(a)) ?? 0) -
        (classCounts.get(classKey(b)) ?? 0)
      if (classDifference !== 0) return classDifference
    }
    return compareCandidates(a, b)
  })
  return available[0]
}

/**
 * Jaotus on deterministlik:
 * 1. grupigarantiid täidetakse voorudena, et vastuoluliste garantiide korral
 *    ei täidaks esimene grupp kogu mahutavust;
 * 2. prioriteedireeglid rakenduvad korraldaja määratud järjekorras;
 * 3. ülejäänud kohad täidetakse registreerimisjärjekorras.
 *
 * Klassitasakaal valib sama etapi sees esmalt klassi, millel on parajasti
 * vähem kinnitatud kohti. Võrdse seisu korral otsustab registreerimisaeg.
 */
export function allocateRegistrationPlaces({
  candidates,
  capacity,
  rules,
  classBalanceMode,
}: {
  candidates: AllocationCandidate[]
  capacity: number | null
  rules: AllocationRuleDefinition[]
  classBalanceMode: ClassBalanceMode
}): AllocationResult {
  const orderedCandidates = [...candidates].sort(compareCandidates)
  if (capacity === null || capacity >= orderedCandidates.length) {
    return {
      confirmedIds: orderedCandidates.map(({ id }) => id),
      waitlistedIds: [],
      reasons: Object.fromEntries(
        orderedCandidates.map(({ id }) => [id, "Kohtade piirang puudub"])
      ),
    }
  }

  const admissionLimit = Math.max(0, capacity)
  const selected = new Set<string>()
  const selectedOrder: string[] = []
  const classCounts = new Map<string, number>()
  const reasons: Record<string, string> = {}
  const balanceClasses = classBalanceMode === "BALANCED"

  function add(candidate: AllocationCandidate, reason: string) {
    if (selected.has(candidate.id)) return false
    selected.add(candidate.id)
    selectedOrder.push(candidate.id)
    const key = classKey(candidate)
    classCounts.set(key, (classCounts.get(key) ?? 0) + 1)
    reasons[candidate.id] = reason
    return true
  }

  const orderedRules = [...rules].sort(
    (a, b) => a.order - b.order || (a.id ?? "").localeCompare(b.id ?? "")
  )
  const guaranteeRules = orderedRules.filter(
    ({ type }) => type === "GROUP_GUARANTEE"
  )
  const priorityRules = orderedRules.filter(({ type }) => type === "PRIORITY")

  for (const rule of guaranteeRules) {
    if (selected.size >= orderedCandidates.length) break
    const quota = rule.quota ?? 0
    if (quota < 1) continue

    const groups = new Map<string, AllocationCandidate[]>()
    for (const candidate of orderedCandidates) {
      if (!matchesRule(candidate, rule)) continue
      const value = sourceValue(candidate, rule)
      if (!value) continue
      const group = groups.get(value) ?? []
      group.push(candidate)
      groups.set(value, group)
    }
    const orderedGroups = [...groups.entries()].sort((a, b) =>
      compareCandidates(a[1][0], b[1][0])
    )
    const groupCounts = new Map(
      orderedGroups.map(([value, group]) => [
        value,
        group.filter(({ id }) => selected.has(id)).length,
      ])
    )

    let progressed = true
    while (selected.size < orderedCandidates.length && progressed) {
      progressed = false
      for (const [value, group] of orderedGroups) {
        if (selected.size >= orderedCandidates.length) break
        if ((groupCounts.get(value) ?? 0) >= quota) continue
        const candidate = nextCandidate(
          group,
          selected,
          classCounts,
          balanceClasses
        )
        if (!candidate) continue
        if (add(candidate, `Garanteeritud koht: ${rule.label}`)) {
          groupCounts.set(value, (groupCounts.get(value) ?? 0) + 1)
          progressed = true
        }
      }
    }
  }

  for (const rule of priorityRules) {
    if (selected.size >= orderedCandidates.length) break
    const matching = orderedCandidates.filter((candidate) =>
      matchesRule(candidate, rule)
    )
    let candidate = nextCandidate(
      matching,
      selected,
      classCounts,
      balanceClasses
    )
    while (candidate && selected.size < orderedCandidates.length) {
      add(candidate, `Prioriteet: ${rule.label}`)
      candidate = nextCandidate(
        matching,
        selected,
        classCounts,
        balanceClasses
      )
    }
  }

  let fallback = nextCandidate(
    orderedCandidates,
    selected,
    classCounts,
    balanceClasses
  )
  while (fallback && selected.size < orderedCandidates.length) {
    add(
      fallback,
      balanceClasses
        ? "Registreerimisjärjekord ja klasside tasakaal"
        : "Registreerimisjärjekord"
    )
    fallback = nextCandidate(
      orderedCandidates,
      selected,
      classCounts,
      balanceClasses
    )
  }

  const confirmedIds = selectedOrder.slice(0, admissionLimit)
  const waitlistedIds = selectedOrder.slice(admissionLimit)
  for (const id of waitlistedIds) {
    reasons[id] = "Ootenimekiri: vabu prioriteetseid kohti ei ole"
  }
  return { confirmedIds, waitlistedIds, reasons }
}
