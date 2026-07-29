import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { managedCompetitionsWhere } from "@/lib/competitionAccess"
import { canCreateCompetition } from "@/lib/permissions"
import Link from "next/link"

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.id) return null

  const where = managedCompetitionsWhere({
    id: session.user.id,
    role: session.user.role,
  })

  const [competitions, representativeAssignments] = await Promise.all([
    prisma.competition.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        organizer: { select: { name: true } },
        _count: { select: { teams: true, elements: true } },
      },
    }),
    prisma.teamRepresentative.findMany({
      where: { member: { userId: session.user.id } },
      include: {
        team: {
          include: {
            competition: {
              select: {
                id: true,
                name: true,
                date: true,
                endDate: true,
                location: true,
              },
            },
          },
        },
      },
      orderBy: [
        { team: { competition: { date: "desc" } } },
        { team: { code: "asc" } },
      ],
    }),
  ])

  const statusLabel: Record<string, string> = { SETUP: "Ettevalmistus", ACTIVE: "Aktiivne", FINISHED: "Lõppenud" }
  const statusColor: Record<string, string> = {
    SETUP: "bg-gray-100 text-gray-600",
    ACTIVE: "bg-green-100 text-green-700",
    FINISHED: "bg-blue-100 text-blue-700",
  }
  const workflowStatusLabel: Record<string, string> = {
    DRAFT: "Mustand",
    SUBMITTED: "Esitatud",
    APPROVED: "Kinnitatud",
    CHANGES_REQUESTED: "Vajab parandamist",
  }
  const mayCreateCompetition = canCreateCompetition(session.user.role)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Võistlused</h1>
        {mayCreateCompetition && (
          <Link
            href="/dashboard/competitions/new"
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            + Uus võistlus
          </Link>
        )}
      </div>

      {competitions.length === 0 && representativeAssignments.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">🏁</p>
          <p className="font-medium">Ühtegi võistlust veel pole</p>
          <p className="text-sm mt-1">
            {mayCreateCompetition
              ? "Loo oma esimene võistlus nupuga üleval"
              : "Sulle pole veel ühtegi võistlust määratud"}
          </p>
        </div>
      ) : competitions.length > 0 ? (
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
      ) : null}

      {representativeAssignments.length > 0 && (
        <section className={competitions.length > 0 ? "mt-10" : ""}>
          <div className="mb-4">
            <h2 className="text-xl font-bold text-gray-900">
              Minu esindatavad võistkonnad
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Täida registreerimine ja täpsusta koosseis mandaadis.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {representativeAssignments.map(({ team }) => (
              <Link
                key={team.id}
                href={`/dashboard/representative/teams/${team.id}`}
                className="bg-white border rounded-xl p-5 hover:shadow-md transition-shadow"
              >
                <p className="text-xs font-medium text-blue-600 mb-1">
                  {team.competition.name}
                </p>
                <h3 className="font-semibold text-gray-900">
                  {team.code} · {team.name}
                </h3>
                {team.class && (
                  <p className="text-sm text-gray-500 mt-1">
                    Klass: {team.class}
                  </p>
                )}
                <div className="flex flex-wrap gap-2 mt-4 text-xs">
                  <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                    Registreerimine:{" "}
                    {workflowStatusLabel[team.registrationStatus] ??
                      team.registrationStatus}
                  </span>
                  <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                    Mandaat:{" "}
                    {workflowStatusLabel[team.mandateStatus] ??
                      team.mandateStatus}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
