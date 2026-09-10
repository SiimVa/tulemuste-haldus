// Klassigrupid: korraldaja võib mitu klassi ühte pingeritta koondada, nt
// {"name":"Noored","classes":["N","S"]}. Kasutatakse fikseeritud pingereas,
// kui punktid sõltuvad võistkondade arvust.

export type ClassGroup = { name: string; classes: string[] }

export const TEAM_COUNT_SCOPES = ["ALL", "CLASS", "GROUP"] as const
export type TeamCountScope = (typeof TEAM_COUNT_SCOPES)[number]

export function isTeamCountScope(value: unknown): value is TeamCountScope {
  return typeof value === "string" && TEAM_COUNT_SCOPES.includes(value as TeamCountScope)
}

export function parseClassGroups(json: string | null | undefined): ClassGroup[] {
  if (!json) return []
  try {
    const raw = JSON.parse(json)
    if (!Array.isArray(raw)) return []
    return raw.flatMap((g): ClassGroup[] => {
      if (!g || typeof g !== "object") return []
      const name = typeof g.name === "string" ? g.name.trim() : ""
      const classes: string[] = Array.isArray(g.classes)
        ? [
            ...new Set(
              (g.classes as unknown[])
                .filter((c): c is string => typeof c === "string" && c.trim() !== "")
                .map((c) => c.trim())
            ),
          ]
        : []
      if (!name || classes.length === 0) return []
      return [{ name, classes }]
    })
  } catch {
    return []
  }
}

// Klass võib kuuluda ainult ühte gruppi — esimene võit, hilisemad duplikaadid
// jäetakse välja, et sama võistkond ei satuks kahte pingeritta.
export function normalizeClassGroups(groups: ClassGroup[]): ClassGroup[] {
  const seenClass = new Set<string>()
  const seenName = new Set<string>()
  const out: ClassGroup[] = []
  for (const g of groups) {
    const name = g.name.trim()
    if (!name || seenName.has(name)) continue
    const classes = g.classes.map((c) => c.trim()).filter((c) => c !== "" && !seenClass.has(c))
    if (classes.length === 0) continue
    classes.forEach((c) => seenClass.add(c))
    seenName.add(name)
    out.push({ name, classes })
  }
  return out
}

// Millisesse pingeritta võistkond kuulub. Grupita klass jääb omaette.
// Võti kannab alati skoopi, sest sama klassi kohta hoitakse eraldi arvu iga
// skoobi jaoks — muidu loeks GROUP-skoobi grupita klass CLASS-skoobi arvu üle.
export function scopeKeyFor(
  scope: TeamCountScope,
  teamClass: string | null | undefined,
  groups: ClassGroup[]
): string {
  if (scope === "ALL") return "ALL"
  const cls = (teamClass ?? "").trim() || "–"
  if (scope === "CLASS") return `CLASS:${cls}`
  const group = groups.find((g) => g.classes.includes(cls))
  return group ? `GROUP:${group.name}` : `GROUP:~${cls}`
}
