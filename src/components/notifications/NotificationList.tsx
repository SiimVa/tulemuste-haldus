"use client"

import Link from "next/link"
import { useEffect } from "react"
import { useRouter } from "next/navigation"

export type NotificationListItem = {
  id: string
  title: string
  message: string
  href: string | null
  readAt: string | null
  createdAt: string
  competitionName: string | null
}

export function NotificationList({ items }: { items: NotificationListItem[] }) {
  const router = useRouter()

  useEffect(() => {
    if (!items.some(({ readAt }) => readAt === null)) return
    let cancelled = false
    void fetch("/api/notifications/read", { method: "POST" })
      .then((response) => (response.ok ? response.json() : null))
      .then((result: { updated?: number } | null) => {
        if (!cancelled && result?.updated) router.refresh()
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [items, router])

  if (items.length === 0) {
    return (
      <div className="rounded-xl border bg-white px-5 py-12 text-center">
        <div className="text-3xl" aria-hidden="true">🔔</div>
        <h2 className="mt-3 font-semibold text-gray-900">Teavitusi veel ei ole</h2>
        <p className="mt-1 text-sm text-gray-500">
          Siia ilmuvad registreerimise, mandaadi ja aktiivse võistluse teated.
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-white">
      {items.map((item) => {
        const content = (
          <article
            className={`border-b px-5 py-4 last:border-b-0 ${
              item.readAt ? "bg-white" : "bg-blue-50/60"
            }`}
          >
            <div className="flex items-start gap-3">
              <span
                className={`mt-2 h-2 w-2 shrink-0 rounded-full ${
                  item.readAt ? "bg-gray-200" : "bg-blue-600"
                }`}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <h2 className="font-semibold text-gray-900">{item.title}</h2>
                  <time className="shrink-0 text-xs text-gray-400" dateTime={item.createdAt}>
                    {new Date(item.createdAt).toLocaleString("et-EE")}
                  </time>
                </div>
                {item.competitionName && (
                  <p className="mt-0.5 text-xs font-medium text-blue-600">
                    {item.competitionName}
                  </p>
                )}
                <p className="mt-2 text-sm leading-6 text-gray-600">{item.message}</p>
                {item.href && (
                  <span className="mt-3 inline-block text-sm font-medium text-blue-600">
                    Ava →
                  </span>
                )}
              </div>
            </div>
          </article>
        )
        return item.href ? (
          <Link key={item.id} href={item.href} className="block hover:bg-gray-50">
            {content}
          </Link>
        ) : (
          <div key={item.id}>{content}</div>
        )
      })}
    </div>
  )
}
