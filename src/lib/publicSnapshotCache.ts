type Namespace = "leaderboard" | "dashboard"
type Entry = {
  competitionId: string
  expiresAt: number
  pending?: Promise<unknown>
  value?: unknown
}

const entries = new Map<string, Entry>()
const MAX_ENTRIES = 64

/** Only public, audience-independent snapshots belong here. Never cache sessions. */
export async function getPublicSnapshot<T>(
  namespace: Namespace,
  competitionId: string,
  version: string,
  load: () => Promise<T>,
  { ttlMs = 5_000 }: { ttlMs?: number } = {},
): Promise<T> {
  const key = JSON.stringify([namespace, competitionId, version])
  const existing = entries.get(key)
  if (existing?.pending) return existing.pending as Promise<T>
  if (existing && existing.expiresAt > Date.now()) return existing.value as T

  entries.delete(key)
  // Remove obsolete freeze versions of this competition's same public view.
  const prefix = JSON.stringify([namespace, competitionId]).slice(0, -1) + ","
  for (const oldKey of entries.keys()) if (oldKey.startsWith(prefix)) entries.delete(oldKey)
  while (entries.size >= MAX_ENTRIES) entries.delete(entries.keys().next().value!)

  const entry: Entry = { competitionId, expiresAt: 0 }
  entries.set(key, entry)
  const pending = Promise.resolve().then(load).then((value) => {
    // A committed write may have invalidated this in-flight snapshot.
    if (entries.get(key) === entry) {
      entry.value = value
      entry.expiresAt = Date.now() + Math.max(0, Math.min(ttlMs, 5_000))
      entry.pending = undefined
    }
    return value
  }, (error: unknown) => {
    if (entries.get(key) === entry) entries.delete(key)
    throw error
  })
  entry.pending = pending
  return pending
}

/** Invalidate only after commit, including freeze/reveal/settings changes. */
export function invalidatePublicSnapshots(competitionId: string): void {
  for (const [key, entry] of entries) {
    if (entry.competitionId === competitionId) entries.delete(key)
  }
}
