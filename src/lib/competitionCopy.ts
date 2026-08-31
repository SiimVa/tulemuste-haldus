export function copiedCompetitionName(name: string) {
  return `${name.trim()} – koopia`
}

export function copiedElementName(name: string, sameCompetition: boolean) {
  return sameCompetition ? `${name.trim()} – koopia` : name.trim()
}

export function nextElementCopyCode(
  preferredCode: string,
  existingCodes: readonly string[]
) {
  const base = preferredCode.trim() || "ELEMENT"
  const existing = new Set(existingCodes)
  if (!existing.has(base)) return base

  let suffix = 2
  while (existing.has(`${base}-${suffix}`)) suffix += 1
  return `${base}-${suffix}`
}

export function remapCompetitionAllocationValues(
  source: string,
  storedValues: string,
  classIdMap: ReadonlyMap<string, string>
) {
  if (source !== "CLASS") return storedValues

  try {
    const values = JSON.parse(storedValues)
    if (!Array.isArray(values)) return "[]"
    return JSON.stringify(
      values.flatMap((value) => {
        const mapped = typeof value === "string" ? classIdMap.get(value) : null
        return mapped ? [mapped] : []
      })
    )
  } catch {
    return "[]"
  }
}
