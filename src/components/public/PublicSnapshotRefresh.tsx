"use client"

import { useCallback, useEffect, useRef, useState } from "react"

export type PublicSnapshotRefreshState<T> = {
  snapshot: T
  remaining: number
  refreshing: boolean
  error: boolean
  refresh: () => Promise<void>
}

export function usePublicSnapshot<T>(endpoint: string, initial: T, intervalSeconds = 30): PublicSnapshotRefreshState<T> {
  const [snapshot, setSnapshot] = useState(initial)
  const [remaining, setRemaining] = useState(intervalSeconds)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(false)
  const request = useRef<AbortController | null>(null)
  const etag = useRef<string | null>(null)

  const refresh = useCallback(async () => {
    if (request.current || document.visibilityState === "hidden") return
    const controller = new AbortController()
    request.current = controller
    setRefreshing(true)
    const timeout = setTimeout(() => controller.abort(), 15_000)
    try {
      const response = await fetch(endpoint, {
        cache: "no-store", signal: controller.signal,
        headers: etag.current ? { "If-None-Match": etag.current } : undefined,
      })
      if (response.status !== 304) {
        if (!response.ok) throw new Error("Snapshot unavailable")
        const updated = await response.json() as T
        if (request.current !== controller || controller.signal.aborted) return
        setSnapshot(updated)
        etag.current = response.headers.get("ETag")
      }
      if (request.current === controller) setError(false)
    } catch {
      // Keep the last successful view; tell the viewer it may be out of date.
      if (request.current === controller) setError(true)
    } finally {
      clearTimeout(timeout)
      if (request.current === controller) {
        request.current = null
        setRefreshing(false)
        setRemaining(intervalSeconds)
      }
    }
  }, [endpoint, intervalSeconds])

  useEffect(() => {
    request.current?.abort()
    request.current = null
    etag.current = null
    setSnapshot(initial)
    setError(false)
    setRefreshing(false)
    setRemaining(intervalSeconds)
    let nextRefresh = Date.now() + intervalSeconds * 1_000
    const timer = setInterval(() => {
      if (document.visibilityState === "hidden") return
      const left = Math.max(0, Math.ceil((nextRefresh - Date.now()) / 1_000))
      setRemaining(left)
      if (left === 0 && !request.current) {
        nextRefresh = Date.now() + intervalSeconds * 1_000
        void refresh()
      }
    }, 1_000)
    const visible = () => {
      if (document.visibilityState !== "hidden" && Date.now() >= nextRefresh) {
        nextRefresh = Date.now() + intervalSeconds * 1_000
        void refresh()
      }
    }
    document.addEventListener("visibilitychange", visible)
    return () => {
      clearInterval(timer)
      document.removeEventListener("visibilitychange", visible)
      request.current?.abort()
      request.current = null
    }
  }, [initial, intervalSeconds, refresh])

  return { snapshot, remaining, refreshing, error, refresh }
}

export function PublicSnapshotRefreshStatus<T>({ state }: { state: PublicSnapshotRefreshState<T> }) {
  return <span className={state.error ? "text-amber-700" : "text-xs text-gray-400"} role={state.error ? "status" : undefined}>
    {state.error ? "Uuendamine ebaõnnestus. Proovime uuesti." : state.refreshing ? "Uuendan…" : `Uueneb ${state.remaining}s pärast`}
  </span>
}
