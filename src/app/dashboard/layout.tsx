import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import Link from "next/link"
import { SignOutButton } from "@/components/SignOutButton"
import { NotificationNavLink } from "@/components/notifications/NotificationNavLink"
import { prisma } from "@/lib/prisma"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect("/login")
  const unreadNotifications = await prisma.notification.count({
    where: { userId: session.user.id, readAt: null },
  })
  const roleLabel =
    session.user.role === "ADMIN"
      ? "Admin"
      : "Kasutaja"

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex min-h-14 max-w-7xl items-center justify-between gap-3 px-4 py-2">
          <Link
            href="/dashboard"
            aria-label="Töölaud"
            className="flex shrink-0 items-center gap-1.5 font-semibold text-gray-900 hover:text-blue-600"
          >
            <span aria-hidden="true">🏆</span>
            <span className="hidden sm:inline">Võistlused</span>
          </Link>
          <nav className="flex min-w-0 items-center gap-2 sm:gap-4" aria-label="Põhinavigatsioon">
            <Link href="/competitions" className="shrink-0 text-sm text-gray-500 hover:text-blue-600">
              <span className="sm:hidden">Avalikud</span>
              <span className="hidden sm:inline">Avalikud võistlused</span>
            </Link>
            <NotificationNavLink unreadCount={unreadNotifications} />
            {session.user.role === "ADMIN" && (
              <Link href="/dashboard/users" className="hidden text-sm text-gray-500 hover:text-blue-600 sm:inline">
                Kasutajad
              </Link>
            )}
            <Link href="/dashboard/profile" className="flex min-w-0 items-center gap-1 text-sm text-gray-500 hover:text-blue-600">
              <span className="max-w-20 truncate sm:max-w-40">
                {session.user.name}
              </span>
              <span className="hidden rounded-full bg-gray-100 px-2 py-0.5 text-xs md:inline">
                {roleLabel}
              </span>
            </Link>
            <SignOutButton />
          </nav>
        </div>
        {session.user.role === "ADMIN" && (
          <nav aria-label="Administraatori tööriistad" className="mx-auto flex max-w-7xl flex-wrap gap-4 px-4 pb-2 text-sm">
            <Link href="/dashboard/users" className="text-gray-600 hover:text-blue-600 sm:hidden">Kasutajad</Link>
            <Link href="/dashboard/security" className="text-gray-600 hover:text-blue-600">Turvalogi</Link>
          </nav>
        )}
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:py-8">{children}</main>
    </div>
  )
}
