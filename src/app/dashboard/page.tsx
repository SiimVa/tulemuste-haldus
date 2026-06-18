import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import Link from "next/link"

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.id) return null

  const where =
    session.user.role === "ADMIN"
      ? {}
      : { OR: [{ organizerId: session.user.id }, { members: { some: { userId: session.user.id } } }] }

  const competitions = await prisma.competition.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      organizer: { select: { name: true } },
      _count: { select: { teams: true, elements: true } },
    },
  })

  const statusLabel: Record<string, string> = { SETUP: "Ettevalmistus", ACTIVE: "Aktiivne", FINISHED: "Lõppenud" }
  const statusColor: Record<string, string> = {
    SETUP: "bg-gray-100 text-gray-600",
    ACTIVE: "bg-green-100 text-green-700",
    FINISHED: "bg-blue-100 text-blue-700",
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Võistlused</h1>
        <Link
          href="/dashboard/competitions/new"
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + Uus võistlus
        </Link>
      </div>

      {competitions.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">🏁</p>
          <p className="font-medium">Ühtegi võistlust veel pole</p>
          <p className="text-sm mt-1">Loo oma esimene võistlus nupuga üleval</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {competitions.map((c) => (
            <Link
              key={c.id}
              href={`/dashboard/competitions/${c.id}`}
              className="bg-white border rounded-xl p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <h2 className="font-semibold text-gray-900 leading-tight">{c.name}</h2>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ml-2 shrink-0 ${statusColor[c.status]}`}>
                  {statusLabel[c.status]}
                </span>
              </div>
              {(c.date || c.endDate) && (
                <p className="text-sm text-gray-500 mb-3">
                  📅 {c.date ? c.date.toLocaleDateString("et-EE") : ""}
                  {c.endDate && (!c.date || c.endDate.toDateString() !== c.date.toDateString()) && ` – ${c.endDate.toLocaleDateString("et-EE")}`}
                </p>
              )}
              <div className="flex gap-4 text-sm text-gray-400">
                <span>🏳 {c._count.elements} elementi</span>
                <span>👥 {c._count.teams} võistkonda</span>
              </div>
              {session.user.role === "ADMIN" && (
                <p className="text-xs text-gray-400 mt-2">Korraldaja: {c.organizer.name}</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
