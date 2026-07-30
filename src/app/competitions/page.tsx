import Link from "next/link"
import { auth } from "@/lib/auth"
import { getCompetitionRegistrationStatus } from "@/lib/competitionPhases"
import { prisma } from "@/lib/prisma"

const PHASE_LABEL = {
  NOT_OPEN: "Registreerimine pole veel avatud",
  OPEN: "Registreerimine avatud",
  CLOSED: "Registreerimine suletud",
  FINALIZED: "Osalejad kinnitatud",
}

const PHASE_COLOR = {
  NOT_OPEN: "bg-gray-100 text-gray-700",
  OPEN: "bg-green-100 text-green-700",
  CLOSED: "bg-amber-100 text-amber-800",
  FINALIZED: "bg-blue-100 text-blue-700",
}

export default async function PublicCompetitionsPage() {
  const session = await auth()
  const competitions = await prisma.competition.findMany({
    where: {
      isPublic: true,
      status: { notIn: ["CANCELLED", "ARCHIVED", "FINISHED"] },
    },
    select: {
      id: true,
      name: true,
      date: true,
      endDate: true,
      location: true,
      registrationOverride: true,
      registrationOpensAt: true,
      registrationClosesAt: true,
      registrationFinalizedAt: true,
      _count: { select: { registrationApplications: true } },
    },
    orderBy: [{ date: "asc" }, { createdAt: "desc" }],
  })

  const withStatus = competitions.map((competition) => ({
    ...competition,
    registrationStatus: getCompetitionRegistrationStatus(competition),
  }))
  withStatus.sort((a, b) => {
    if (a.registrationStatus === b.registrationStatus) return 0
    if (a.registrationStatus === "OPEN") return -1
    if (b.registrationStatus === "OPEN") return 1
    return 0
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/competitions" className="font-semibold text-gray-900">
            🏆 Võistlused
          </Link>
          <Link
            href={session?.user ? "/dashboard" : "/login"}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            {session?.user ? "Minu töölaud" : "Logi sisse"}
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-10">
        <div className="mb-7">
          <h1 className="text-2xl font-bold text-gray-900">Avalikud võistlused</h1>
          <p className="text-sm text-gray-500 mt-1">
            Vaata võistlusi ja registreeri oma võistkond.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {withStatus.map((competition) => (
            <Link
              key={competition.id}
              href={`/competitions/${competition.id}`}
              className="bg-white border rounded-xl p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h2 className="font-semibold text-gray-900">{competition.name}</h2>
                <span
                  className={`text-xs px-2.5 py-1 rounded-full ${
                    PHASE_COLOR[competition.registrationStatus]
                  }`}
                >
                  {PHASE_LABEL[competition.registrationStatus]}
                </span>
              </div>
              {(competition.date || competition.endDate) && (
                <p className="text-sm text-gray-500 mt-3">
                  📅{" "}
                  {competition.date?.toLocaleDateString("et-EE") ?? ""}
                  {competition.endDate &&
                    competition.endDate.toDateString() !==
                      competition.date?.toDateString() &&
                    ` – ${competition.endDate.toLocaleDateString("et-EE")}`}
                </p>
              )}
              {competition.location && (
                <p className="text-sm text-gray-500 mt-1">
                  📍 {competition.location}
                </p>
              )}
              <p className="text-xs text-gray-400 mt-4">
                {competition._count.registrationApplications} avaldust
              </p>
            </Link>
          ))}
        </div>

        {withStatus.length === 0 && (
          <div className="bg-white border rounded-xl py-16 text-center text-gray-400">
            <p className="text-3xl mb-3">🏁</p>
            <p>Avalikke võistlusi praegu pole.</p>
          </div>
        )}
      </main>
    </div>
  )
}
