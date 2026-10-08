"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

type DashboardNavigationProps = {
  isAdmin: boolean
  unreadNotifications: number
  openSecurityAlerts: number
}

export function DashboardNavigation({
  isAdmin,
  unreadNotifications,
  openSecurityAlerts,
}: DashboardNavigationProps) {
  const pathname = usePathname()
  const [notificationCount, setNotificationCount] = useState(unreadNotifications)

  useEffect(() => {
    setNotificationCount(unreadNotifications)
  }, [unreadNotifications])

  const isActive = (href: string) =>
    href === "/dashboard"
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`)

  const linkClass = (href: string) =>
    cn(
      "inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500",
      isActive(href)
        ? "bg-blue-50 text-blue-700"
        : "text-gray-600 hover:bg-gray-50 hover:text-blue-600"
    )

  return (
    <div className="border-t border-gray-100">
      <div className="mx-auto max-w-7xl overflow-x-auto px-4 py-1">
        <div className="flex min-w-max items-center gap-3">
          <nav className="flex items-center gap-1" aria-label="Põhinavigatsioon">
            <Link
              href="/dashboard"
              aria-current={isActive("/dashboard") ? "page" : undefined}
              className={linkClass("/dashboard")}
            >
              Töölaud
            </Link>
            <Link
              href="/competitions"
              aria-current={isActive("/competitions") ? "page" : undefined}
              className={linkClass("/competitions")}
            >
              Avalikud võistlused
            </Link>
            <Link
              href="/dashboard/notifications"
              aria-current={isActive("/dashboard/notifications") ? "page" : undefined}
              aria-label={notificationCount > 0 ? `Teavitused, ${notificationCount} lugemata` : "Teavitused"}
              onClick={() => setNotificationCount(0)}
              className={linkClass("/dashboard/notifications")}
            >
              Teavitused
              {notificationCount > 0 && (
                <span aria-hidden="true" className="rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-semibold leading-4 text-white">
                  {notificationCount > 99 ? "99+" : notificationCount}
                </span>
              )}
            </Link>
          </nav>
          {isAdmin && (
            <nav className="flex items-center gap-1 border-l pl-3" aria-label="Administraatori tööriistad">
              <Link
                href="/dashboard/users"
                aria-current={isActive("/dashboard/users") ? "page" : undefined}
                className={linkClass("/dashboard/users")}
              >
                Kasutajad
              </Link>
              <Link
                href="/dashboard/series"
                aria-current={isActive("/dashboard/series") ? "page" : undefined}
                className={linkClass("/dashboard/series")}
              >
                Üleriiklik arvestus
              </Link>
              <Link
                href="/dashboard/security"
                aria-current={isActive("/dashboard/security") ? "page" : undefined}
                className={linkClass("/dashboard/security")}
              >
                Turvalogi
                {openSecurityAlerts > 0 && (
                  <span className="relative rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-semibold leading-4 text-white">
                    {openSecurityAlerts}<span className="sr-only"> avatud hoiatust</span>
                  </span>
                )}
              </Link>
            </nav>
          )}
        </div>
      </div>
    </div>
  )
}
