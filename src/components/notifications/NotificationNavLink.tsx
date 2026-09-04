"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

export function NotificationNavLink({ unreadCount }: { unreadCount: number }) {
  const [count, setCount] = useState(unreadCount)

  useEffect(() => {
    setCount(unreadCount)
  }, [unreadCount])

  return (
    <Link
      href="/dashboard/notifications"
      aria-label={count > 0 ? `Teavitused, ${count} lugemata` : "Teavitused"}
      onClick={() => setCount(0)}
      className="relative shrink-0 text-sm text-gray-500 hover:text-blue-600"
    >
      <span className="sm:hidden" aria-hidden="true">🔔</span>
      <span className="hidden sm:inline">Teavitused</span>
      {count > 0 && (
        <span className="absolute -right-2.5 -top-2 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-4 text-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  )
}
