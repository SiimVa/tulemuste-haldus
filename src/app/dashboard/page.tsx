import Link from "next/link"
import { CompetitionCopyButton } from "@/components/competition/CompetitionCopyButton"
import { TeamResultActions } from "@/components/representative/TeamResultActions"
import { auth } from "@/lib/auth"
import { managedCompetitionsWhere } from "@/lib/competitionAccess"
import {
  getCompetitionMandateStatus,
  getCompetitionRegistrationStatus,
} from "@/lib/competitionPhases"
import { canCreateCompetition } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import { teamDisplayName } from "@/lib/teamDisplay"

const competitionStatusLabel: Record<string, string> = {
  SETUP: "Ettevalmistus",
  ACTIVE: "Toimub",
  FINISHED: "Lõppenud",
  CANCELLED: "Tühistatud",
  ARCHIVED: "Arhiveeritud",
}

const competitionStatusColor: Record<string, string> = {
  SETUP: "bg-gray-100 text-gray-600",
  ACTIVE: "bg-green-100 text-green-700",
  FINISHED: "bg-blue-100 text-blue-700",
  CANCELLED: "bg-red-100 text-red-700",
  ARCHIVED: "bg-slate-100 text-slate-600",
}

const registrationGroups = [
  {
    key: "confirmed",
    title: "Kinnitatud võistkonnad",
    description: "Võistkonnad, kelle koht võistlusel on kinnitatud.",
    statuses: ["CONFIRMED", "APPROVED"],
    badge: "Kinnitatud",
    badgeClass: "bg-green-100 text-green-700",
    borderClass: "border-green-200",
  },
  {
    key: "waitlisted",
    title: "Ootenimekirjas",
    description: "Võistkonnad, mis ootavad vaba kohta.",
    statuses: ["WAITLISTED"],
    badge: "Ootenimekirjas",
    badgeClass: "bg-amber-100 text-amber-800",
    borderClass: "border-amber-200",
  },
  {
    key: "changes",
    title: "Tagasi saadetud",
    description: "Täienda andmeid ja esita registreering uuesti.",
    statuses: ["CHANGES_REQUESTED"],
    badge: "Vajab täiendamist",
    badgeClass: "bg-red-100 text-red-700",
    borderClass: "border-red-200",
  },
  {
    key: "review",
    title: "Ootavad kinnitamist",
    description: "Esitatud või pooleliolevad registreeringud.",
    statuses: ["PENDING_REVIEW", "DRAFT", "SUBMITTED"],
    badge: "Ootab kinnitamist",
    badgeClass: "bg-blue-100 text-blue-700",
    borderClass: "border-blue-200",
  },
] as const

const mandateGroups = [
  {
    key: "draft",
    title: "Vajavad täitmist",
    description: "Ava mandaat, täienda koosseis ja esita see korraldajale.",
    statuses: ["DRAFT"],
    badge: "Täitmata",
    badgeClass: "bg-blue-100 text-blue-700",
    borderClass: "border-blue-200",
  },
  {
    key: "submitted",
    title: "Esitatud mandaadid",
    description: "Korraldaja ei ole neid veel kinnitanud.",
    statuses: ["SUBMITTED"],
    badge: "Esitatud",
    badgeClass: "bg-amber-100 text-amber-800",
    borderClass: "border-amber-200",
  },
  {
    key: "changes",
    title: "Tagasi saadetud mandaadid",
    description: "Paranda korraldaja märkused ja esita mandaat uuesti.",
    statuses: ["CHANGES_REQUESTED"],
    badge: "Vajab täiendamist",
    badgeClass: "bg-red-100 text-red-700",
    borderClass: "border-red-200",
  },
  {
    key: "approved",
    title: "Kinnitatud mandaadid",
    description: "Korraldaja on mandaadi kinnitanud.",
    statuses: ["APPROVED"],
    badge: "Kinnitatud",
    badgeClass: "bg-green-100 text-green-700",
    borderClass: "border-green-200",
  },
] as const

function SectionHeading({
  id,
  title,
  description,
  action,
}: {
  id?: string
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 id={id} className="text-xl font-bold text-gray-900">{title}</h2>
        <p className="mt-1 text-sm text-gray-500">{description}</p>
      </div>
      {action}
    </div>
  )
}

function CompetitionDate({
  date,
  endDate,
}: {
  date: Date | null
  endDate?: Date | null
}) {
  if (!date && !endDate) return null
  const start = date?.toLocaleDateString("et-EE") ?? ""
  const end = endDate?.toLocaleDateString("et-EE") ?? ""
  return (
    <p className="mt-2 text-sm text-gray-500">
      📅 {start}
      {endDate && (!date || endDate.toDateString() !== date.toDateString())
        ? ` – ${end}`
        : ""}
    </p>
  )
}

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.id) return null
  const currentUser = session.user
  const managedWhere = managedCompetitionsWhere({
    id: currentUser.id,
    role: currentUser.role,
  })

  const [
    competitions,
    representedTeams,
    openCompetitionCandidates,
    registrationApplications,
    activeTeams,
    judgeMemberships,
  ] = await Promise.all([
    prisma.competition.findMany({
      where: managedWhere,
      orderBy: { createdAt: "desc" },
      include: {
        organizer: { select: { name: true } },
        _count: { select: { teams: true, elements: true } },
      },
    }),
    prisma.team.findMany({
      where: {
        representative: { is: { member: { userId: currentUser.id } } },
      },
      select: {
        id: true,
        code: true,
        name: true,
        class: true,
        registrationStatus: true,
        mandateStatus: true,
        competition: {
          select: {
            id: true,
            name: true,
            date: true,
            endDate: true,
            location: true,
            status: true,
            registrationFinalizedAt: true,
            mandateOverride: true,
            mandateOpensAt: true,
            mandateClosesAt: true,
            mandateFinalizedAt: true,
          },
        },
      },
      orderBy: [
        { competition: { date: "asc" } },
        { code: "asc" },
      ],
    }),
    prisma.competition.findMany({
      where: {
        isPublic: true,
        registrationAccessMode: "PUBLIC",
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
      },
      orderBy: [{ date: "asc" }, { createdAt: "desc" }],
    }),
    prisma.registrationApplication.findMany({
      where: {
        submittedById: currentUser.id,
        status: { notIn: ["REJECTED", "WITHDRAWN"] },
        competition: {
          status: "SETUP",
          registrationFinalizedAt: null,
        },
      },
      select: {
        id: true,
        teamName: true,
        status: true,
        allocationReason: true,
        waitlistPosition: true,
        competition: {
          select: { id: true, name: true, date: true, endDate: true },
        },
        class: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.team.findMany({
      where: {
        registrationStatus: "APPROVED",
        competition: { status: "ACTIVE" },
        OR: [
          { members: { some: { userId: currentUser.id } } },
          {
            representative: {
              is: { member: { userId: currentUser.id } },
            },
          },
        ],
      },
      select: {
        id: true,
        code: true,
        name: true,
        class: true,
        competition: {
          select: {
            id: true,
            name: true,
            date: true,
            endDate: true,
            location: true,
          },
        },
        members: {
          where: { userId: currentUser.id },
          select: { id: true, name: true, role: true },
        },
        representative: {
          select: { member: { select: { userId: true } } },
        },
        accessTokens: {
          where: { type: "ATHLETE" },
          select: { token: true },
          orderBy: { createdAt: "asc" },
          take: 1,
        },
      },
      orderBy: [
        { competition: { date: "asc" } },
        { code: "asc" },
      ],
    }),
    prisma.competitionMember.findMany({
      where: {
        userId: currentUser.id,
        roles: { some: { role: "JUDGE" } },
        judgedElements: { some: {} },
        competition: { status: { in: ["SETUP", "ACTIVE"] } },
      },
      select: {
        id: true,
        competition: {
          select: { id: true, name: true, date: true, status: true },
        },
        judgedElements: {
          select: {
            element: {
              select: { id: true, code: true, name: true, order: true },
            },
          },
          orderBy: { element: { order: "asc" } },
        },
      },
      orderBy: { competition: { date: "desc" } },
    }),
  ])

  const openCompetitions = openCompetitionCandidates.filter(
    (competition) =>
      getCompetitionRegistrationStatus(competition) === "OPEN"
  )
  const mandateTeams = representedTeams.filter((team) => {
    if (
      team.competition.status !== "SETUP" ||
      !team.competition.registrationFinalizedAt
    ) {
      return false
    }
    const phase = getCompetitionMandateStatus(team.competition)
    return (
      team.mandateStatus === "CHANGES_REQUESTED" ||
      phase === "OPEN" ||
      phase === "CLOSED"
    )
  })
  const registrationItems = [
    ...registrationApplications.map((application) => ({
      id: `application-${application.id}`,
      href: `/competitions/${application.competition.id}`,
      competitionName: application.competition.name,
      teamName: application.teamName,
      className: application.class?.name ?? null,
      status: application.status,
      allocationReason: application.allocationReason,
      waitlistPosition: application.waitlistPosition,
    })),
    ...representedTeams
      .filter(
        (team) =>
          team.competition.status === "SETUP" &&
          !team.competition.registrationFinalizedAt
      )
      .map((team) => ({
        id: `team-${team.id}`,
        href: `/dashboard/representative/teams/${team.id}`,
        competitionName: team.competition.name,
        teamName: teamDisplayName(team),
        className: team.class,
        status: team.registrationStatus,
        allocationReason: null,
        waitlistPosition: null,
      })),
  ]
  const mayCreateCompetition = canCreateCompetition(currentUser.role)
  const hasPersonalWorkflow =
    openCompetitions.length > 0 ||
    registrationItems.length > 0 ||
    mandateTeams.length > 0 ||
    activeTeams.length > 0 ||
    judgeMemberships.length > 0

  return (
    <div>
      <div className="mb-8 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
          Töölaud
        </h1>
        {mayCreateCompetition && (
          <Link
            href="/dashboard/competitions/new"
            className="shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 sm:px-4"
          >
            + Uus võistlus
          </Link>
        )}
      </div>

      {openCompetitions.length > 0 && (
        <section className="mb-12" aria-labelledby="open-competitions-title">
          <SectionHeading
            id="open-competitions-title"
            title="Registreerimiseks avatud võistlused"
            description="Vali võistlus ja registreeri üks või mitu võistkonda."
            action={
              <Link
                href="/competitions"
                className="text-sm font-medium text-blue-600 hover:underline"
              >
                Kõik avalikud võistlused →
              </Link>
            }
          />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {openCompetitions.map((competition) => (
              <Link
                key={competition.id}
                href={`/competitions/${competition.id}`}
                className="rounded-xl border border-green-200 bg-white p-4 transition-shadow hover:shadow-md sm:p-5"
              >
                <span className="inline-flex rounded-full bg-green-100 px-2 py-1 text-xs text-green-700">
                  Registreerimine avatud
                </span>
                <h3 className="mt-3 font-semibold text-gray-900">
                  {competition.name}
                </h3>
                <CompetitionDate
                  date={competition.date}
                  endDate={competition.endDate}
                />
                {competition.location && (
                  <p className="mt-1 text-sm text-gray-500">
                    📍 {competition.location}
                  </p>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {registrationItems.length > 0 && (
        <section className="mb-12" aria-labelledby="registrations-title">
          <SectionHeading
            id="registrations-title"
            title="Minu registreerimised"
            description="Aktiivse registreerimisetapi võistkonnad oleku järgi."
          />
          <div className="space-y-7">
            {registrationGroups.map((group) => {
              const applications = registrationItems.filter(
                (item) =>
                  (group.statuses as readonly string[]).includes(
                    item.status
                  )
              )
              if (applications.length === 0) return null
              return (
                <div key={group.key}>
                  <div className="mb-3 flex items-baseline gap-2">
                    <h3 className="font-semibold text-gray-900">
                      {group.title}
                    </h3>
                    <span className="text-xs text-gray-400">
                      {applications.length}
                    </span>
                  </div>
                  <p className="-mt-2 mb-3 text-sm text-gray-500">
                    {group.description}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {applications.map((item) => (
                      <Link
                        key={item.id}
                        href={item.href}
                        className={`rounded-xl border bg-white p-4 transition-shadow hover:shadow-md sm:p-5 ${group.borderClass}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-xs font-medium text-blue-600">
                            {item.competitionName}
                          </p>
                          <span
                            className={`shrink-0 rounded-full px-2 py-1 text-xs ${group.badgeClass}`}
                          >
                            {group.badge}
                          </span>
                        </div>
                        <h4 className="mt-2 font-semibold text-gray-900">
                          {item.teamName}
                        </h4>
                        {item.className && (
                          <p className="mt-1 text-sm text-gray-500">
                            Klass: {item.className}
                          </p>
                        )}
                        {item.status === "WAITLISTED" &&
                          item.waitlistPosition && (
                            <p className="mt-3 text-sm font-medium text-amber-800">
                              Ootenimekirja koht: {item.waitlistPosition}
                            </p>
                          )}
                        {item.allocationReason && (
                          <p className="mt-2 text-xs text-gray-500">
                            {item.allocationReason}
                          </p>
                        )}
                      </Link>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {mandateTeams.length > 0 && (
        <section className="mb-12" aria-labelledby="mandates-title">
          <SectionHeading
            id="mandates-title"
            title="Mandaadid"
            description="Aktiivse mandaadietapi võistkonnad oleku järgi."
          />
          <div className="space-y-7">
            {mandateGroups.map((group) => {
              const teams = mandateTeams.filter((team) =>
                (group.statuses as readonly string[]).includes(
                  team.mandateStatus
                )
              )
              if (teams.length === 0) return null
              return (
                <div key={group.key}>
                  <div className="mb-3 flex items-baseline gap-2">
                    <h3 className="font-semibold text-gray-900">
                      {group.title}
                    </h3>
                    <span className="text-xs text-gray-400">
                      {teams.length}
                    </span>
                  </div>
                  <p className="-mt-2 mb-3 text-sm text-gray-500">
                    {group.description}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {teams.map((team) => (
                      <Link
                        key={team.id}
                        href={`/dashboard/representative/teams/${team.id}`}
                        className={`rounded-xl border bg-white p-4 transition-shadow hover:shadow-md sm:p-5 ${group.borderClass}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-xs font-medium text-blue-600">
                            {team.competition.name}
                          </p>
                          <span
                            className={`shrink-0 rounded-full px-2 py-1 text-xs ${group.badgeClass}`}
                          >
                            {group.badge}
                          </span>
                        </div>
                        <h4 className="mt-2 font-semibold text-gray-900">
                          {teamDisplayName(team)}
                        </h4>
                        {team.class && (
                          <p className="mt-1 text-sm text-gray-500">
                            Klass: {team.class}
                          </p>
                        )}
                      </Link>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {activeTeams.length > 0 && (
        <section className="mb-12" aria-labelledby="active-teams-title">
          <SectionHeading
            id="active-teams-title"
            title="Aktiivsed võistlused"
            description="Vaata oma võistkonna tulemusi või jaga tulemuste linki võistkonnaga."
          />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {activeTeams.map((team) => {
              const isRepresentative =
                team.representative?.member.userId === currentUser.id
              const isMember = team.members.length > 0
              return (
                <article
                  key={team.id}
                  className="rounded-xl border border-violet-200 bg-white p-4 sm:p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs font-medium text-blue-600">
                      {team.competition.name}
                    </p>
                    <span className="shrink-0 rounded-full bg-violet-100 px-2 py-1 text-xs text-violet-700">
                      Võistlus toimub
                    </span>
                  </div>
                  <h3 className="mt-2 font-semibold text-gray-900">
                    {teamDisplayName(team)}
                  </h3>
                  {team.class && (
                    <p className="mt-1 text-sm text-gray-500">
                      Klass: {team.class}
                    </p>
                  )}
                  <p className="mt-3 text-xs text-gray-500">
                    {[
                      isRepresentative ? "Esindaja" : null,
                      isMember ? "Võistkonna liige" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <TeamResultActions
                    teamId={team.id}
                    initialToken={team.accessTokens[0]?.token ?? null}
                  />
                </article>
              )
            })}
          </div>
        </section>
      )}

      {judgeMemberships.length > 0 && (
        <section className="mb-12" aria-labelledby="judge-assignments-title">
          <SectionHeading
            id="judge-assignments-title"
            title="Minu hindamispunktid"
            description="Sisesta tulemusi kohtunikuna oma kasutajakontoga."
          />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {judgeMemberships.map(({ id, competition, judgedElements }) => (
              <Link
                key={id}
                href={`/dashboard/judge/${competition.id}`}
                className="rounded-xl border border-orange-200 bg-white p-4 transition-shadow hover:shadow-md sm:p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold text-gray-900">
                    {competition.name}
                  </h3>
                  <span className="shrink-0 rounded-full bg-orange-100 px-2 py-1 text-xs text-orange-700">
                    Kohtunik
                  </span>
                </div>
                {competition.date && (
                  <CompetitionDate date={competition.date} />
                )}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {judgedElements.slice(0, 3).map(({ element }) => (
                    <span
                      key={element.id}
                      className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600"
                    >
                      {element.code} · {element.name}
                    </span>
                  ))}
                  {judgedElements.length > 3 && (
                    <span className="px-1 py-1 text-xs text-gray-400">
                      +{judgedElements.length - 3}
                    </span>
                  )}
                </div>
                <p className="mt-4 text-sm font-medium text-blue-600">
                  Ava kohtunikuvaade →
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {competitions.length > 0 && (
        <section aria-labelledby="managed-competitions-title">
          <SectionHeading
            id="managed-competitions-title"
            title="Minu hallatavad võistlused"
            description="Võistlused, kus oled peakorraldaja või sulle on antud haldusroll."
          />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {competitions.map((competition) => (
              <div
                key={competition.id}
                className="overflow-hidden rounded-xl border bg-white transition-shadow hover:shadow-md"
              >
                <Link
                  href={`/dashboard/competitions/${competition.id}`}
                  className="block p-4 sm:p-5"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <h3 className="font-semibold leading-tight text-gray-900">
                      {competition.name}
                    </h3>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${competitionStatusColor[competition.status] ?? competitionStatusColor.SETUP}`}
                    >
                      {competitionStatusLabel[competition.status] ??
                        competition.status}
                    </span>
                  </div>
                  <CompetitionDate
                    date={competition.date}
                    endDate={competition.endDate}
                  />
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-400">
                    <span>🏳 {competition._count.elements} elementi</span>
                    <span>👥 {competition._count.teams} võistkonda</span>
                  </div>
                  {currentUser.role === "ADMIN" && (
                    <p className="mt-2 text-xs text-gray-400">
                      Korraldaja: {competition.organizer.name}
                    </p>
                  )}
                </Link>
                {mayCreateCompetition && (
                  <div className="border-t bg-gray-50/60 px-4 py-3 sm:px-5">
                    <CompetitionCopyButton
                      competitionId={competition.id}
                      competitionName={competition.name}
                      elementCount={competition._count.elements}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {!hasPersonalWorkflow && competitions.length === 0 && (
        <div className="py-16 text-center text-gray-400">
          <p className="mb-3 text-4xl">🏁</p>
          <p className="font-medium">Ühtegi aktiivset tegevust pole</p>
          <p className="mt-1 text-sm">
            Avalikud registreerimised ja sinu võistkonnad ilmuvad siia.
          </p>
        </div>
      )}
    </div>
  )
}
