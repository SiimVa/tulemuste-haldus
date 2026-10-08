import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import Link from "next/link"
import { SignOutButton } from "@/components/SignOutButton"
import { DashboardNavigation } from "@/components/dashboard/DashboardNavigation"
import { prisma } from "@/lib/prisma"
import { openSecurityAlertCount } from "@/lib/securityAlerts.server"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect("/login")
  const [unreadNotifications, openSecurityAlerts] = await Promise.all([
    prisma.notification.count({ where: { userId: session.user.id, readAt: null } }),
    session.user.role === "ADMIN" ? openSecurityAlertCount() : 0,
  ])
  const roleLabel =
    session.user.role === "ADMIN"
      ? "Admin"
      : "Kasutaja"

  return (
    <div className="dashboard-shell min-h-screen bg-gray-50">
      <header className="dashboard-shell-header border-b bg-white">
        <div className="mx-auto flex min-h-14 max-w-7xl items-center justify-between gap-3 px-4 py-2">
          <Link
            href="/dashboard"
            aria-label="Matkamäng"
            className="flex min-h-10 shrink-0 items-center gap-2 rounded-lg font-semibold text-gray-900 hover:text-blue-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
          >
            <span aria-hidden="true">🏆</span>
            <span>Matkamäng</span>
          </Link>
          <div className="flex min-w-0 items-center gap-2 text-sm sm:gap-4">
            <div className="hidden min-w-0 items-center gap-2 text-gray-600 sm:flex">
              <span className="max-w-36 truncate">
                {session.user.name || session.user.email}
              </span>
              <span className="hidden rounded-full bg-gray-100 px-2 py-0.5 text-xs lg:inline">
                {roleLabel}
              </span>
            </div>
            <Link
              href="/dashboard/profile"
              className="inline-flex min-h-11 shrink-0 items-center rounded-lg px-2 text-gray-600 hover:bg-gray-50 hover:text-blue-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
            >
              Profiil
            </Link>
            <div className="flex min-h-11 items-center [&>button]:min-h-11 [&>button]:rounded-lg [&>button]:px-2 [&>button]:focus-visible:outline-2 [&>button]:focus-visible:outline-offset-2 [&>button]:focus-visible:outline-blue-500">
              <SignOutButton />
            </div>
          </div>
        </div>
        <DashboardNavigation
          isAdmin={session.user.role === "ADMIN"}
          unreadNotifications={unreadNotifications}
          openSecurityAlerts={openSecurityAlerts}
        />
      </header>
      <main className="dashboard-shell-main mx-auto max-w-7xl px-4 py-6 sm:py-8">{children}</main>
    </div>
  )
}
