import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import Link from "next/link"
import { SignOutButton } from "@/components/SignOutButton"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect("/login")

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/dashboard" className="font-semibold text-gray-900 hover:text-blue-600">
            🏆 Võistlused
          </Link>
          <div className="flex items-center gap-4">
            {session.user.role === "ADMIN" && (
              <Link href="/dashboard/users" className="text-sm text-gray-500 hover:text-blue-600">
                Kasutajad
              </Link>
            )}
            <span className="text-sm text-gray-500">
              {session.user.name}{" "}
              <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full">
                {session.user.role === "ADMIN" ? "Admin" : "Korraldaja"}
              </span>
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-8">{children}</main>
    </div>
  )
}
