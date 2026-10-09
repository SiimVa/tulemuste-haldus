import { applicationRepresentativeId, applicationRepresentativeWhere } from "@/lib/representativeIdentity"
import Link from "next/link"
import { CompetitionCopyButton } from "@/components/competition/CompetitionCopyButton"
import { DashboardViews } from "@/components/dashboard/DashboardViews"
import { ParticipantTeams } from "@/components/dashboard/ParticipantTeams"
import { auth } from "@/lib/auth"
import { managedCompetitionsWhere } from "@/lib/competitionAccess"
import { getCompetitionMandateStatus, getCompetitionRegistrationStatus } from "@/lib/competitionPhases"
import { participantTeamPhase, type ParticipantItem } from "@/lib/participantWorkflow"
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

// Sama staatuse sees säilib päringu järjestus: uuemad loodud võistlused ees.
const competitionStatusOrder: Record<string, number> = {
  SETUP: 0,
  ACTIVE: 1,
  FINISHED: 2,
  CANCELLED: 3,
  ARCHIVED: 4,
}

const competitionStatusColor: Record<string, string> = {
  SETUP: "bg-gray-100 text-gray-600",
  ACTIVE: "bg-green-100 text-green-700",
  FINISHED: "bg-blue-100 text-blue-700",
  CANCELLED: "bg-red-100 text-red-700",
  ARCHIVED: "bg-slate-100 text-slate-600",
}

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
  const managedWhere = managedCompetitionsWhere({ id: currentUser.id, role: currentUser.role })
  const [competitions, ownTeams, openCompetitionCandidates, registrationApplications, judgeMemberships] = await Promise.all([
    prisma.competition.findMany({
      where: managedWhere, orderBy: { createdAt: "desc" },
      include: { organizer: { select: { name: true } }, _count: { select: { teams: true, elements: true } } },
    }),
    prisma.team.findMany({
      where: {
        AND: [{ OR: [{ competition: { status: "SETUP" } }, { competition: { status: "ACTIVE" }, registrationStatus: "APPROVED" }] }],
        OR: [{ representative: { is: { member: { userId: currentUser.id } } } }, { members: { some: { userId: currentUser.id } } }],
      },
      select: {
        id: true, code: true, name: true, class: true,
        registrationStatus: true, registrationReviewNote: true,
        registrationApplication: { select: { id: true } },
        mandateStatus: true, mandateReviewNote: true,
        competition: { select: {
          id: true, name: true, date: true, status: true,
          registrationFinalizedAt: true, mandateOverride: true, mandateOpensAt: true, mandateClosesAt: true, mandateFinalizedAt: true,
        } },
        representative: { select: { member: { select: { userId: true } } } },
        members: { where: { userId: currentUser.id }, select: { id: true }, take: 1 },
        accessTokens: { where: { type: "ATHLETE" }, select: { token: true }, orderBy: { createdAt: "asc" }, take: 1 },
      },
      orderBy: [{ competition: { date: "asc" } }, { code: "asc" }],
    }),
    prisma.competition.findMany({
      where: { isPublic: true, registrationAccessMode: "PUBLIC", status: { notIn: ["CANCELLED", "ARCHIVED", "FINISHED"] } },
      select: {
        id: true, name: true, date: true, endDate: true, location: true,
        registrationOverride: true, registrationOpensAt: true, registrationClosesAt: true, registrationFinalizedAt: true,
      },
      orderBy: [{ date: "asc" }, { createdAt: "desc" }],
    }),
    prisma.registrationApplication.findMany({
      where: { OR: [{ submittedById: currentUser.id }, applicationRepresentativeWhere(currentUser.id)], status: { notIn: ["REJECTED", "WITHDRAWN"] }, competition: { status: "SETUP" } },
      select: {
        id: true, representativeId: true, submittedById: true, pendingRepresentativeEmail: true, teamId: true, teamName: true, status: true, allocationReason: true, waitlistPosition: true,
        competition: { select: { id: true, name: true, date: true, registrationFinalizedAt: true } }, class: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.competitionMember.findMany({
      where: { userId: currentUser.id, roles: { some: { role: "JUDGE" } }, judgedElements: { some: {} }, competition: { status: { in: ["SETUP", "ACTIVE"] } } },
      select: {
        id: true, competition: { select: { id: true, name: true, date: true, status: true } },
        judgedElements: { select: { element: { select: { id: true, code: true, name: true, order: true } } }, orderBy: { element: { order: "asc" } } },
      },
      orderBy: { competition: { date: "desc" } },
    }),
  ])
  const now = new Date()
  const openCompetitions = openCompetitionCandidates.filter(competition => getCompetitionRegistrationStatus(competition, now) === "OPEN")
  const ownTeamIds = new Set(ownTeams.map(team => team.id))
  const ownApplicationsByTeamId = new Map(registrationApplications.filter(application => application.teamId).map(application => [application.teamId!, application]))
  const participantItems: ParticipantItem[] = registrationApplications
    .filter(application => !application.teamId || !ownTeamIds.has(application.teamId))
    .map(application => ({
      id: `application-${application.id}`, teamId: application.teamId, phase: "REGISTRATION", status: application.status,
      competitionId: application.competition.id, competitionName: application.competition.name,
      teamName: application.teamName, className: application.class?.name ?? null, date: application.competition.date?.toISOString() ?? null,
      href: `/dashboard/registrations/${application.id}`,
      action: applicationRepresentativeId(application) !== currentUser.id || application.teamId || application.competition.registrationFinalizedAt ? "Vaata registreeringut" : application.status === "CHANGES_REQUESTED" ? "Täienda registreeringut" : application.status === "DRAFT" ? "Jätka registreerimist" : "Vaata registreeringut",
      description: applicationRepresentativeId(application) !== currentUser.id ? "Registreerisid selle võistkonna. Andmeid haldab praegune esindaja." : ["CONFIRMED", "APPROVED"].includes(application.status) ? "Sinu võistkonna koht on kinnitatud. Mandaadietapi avanemisel saad koosseisu täiendada." : application.status === "CHANGES_REQUESTED" ? "Korraldaja palus registreeringut täiendada ja uuesti esitada." : application.status === "DRAFT" ? "Registreering on pooleli. Täida andmed ja esita registreering." : application.status === "WAITLISTED" ? "Võistkond ootab vaba kohta. Kinnitamisest antakse teada." : "Registreering on esitatud ja ootab korraldaja kinnitust.",
      note: application.allocationReason, waitlistPosition: application.waitlistPosition,
      isRepresentative: false, isMember: false, resultsToken: null,
      requiresAction: applicationRepresentativeId(application) === currentUser.id && !application.teamId && !application.competition.registrationFinalizedAt && ["DRAFT", "CHANGES_REQUESTED"].includes(application.status),
    }))
  for (const team of ownTeams) {
    const isRepresentative = team.representative?.member.userId === currentUser.id
    const isMember = team.members.length > 0
    const mandatePhase = getCompetitionMandateStatus(team.competition, now)
    const phase = participantTeamPhase({ competitionStatus: team.competition.status, registrationStatus: team.registrationStatus, mandateStatus: team.mandateStatus, mandatePhase, hasRegistrationApplication: Boolean(team.registrationApplication) })
    const ownApplication = ownApplicationsByTeamId.get(team.id)
    const canFillMandate = mandatePhase === "OPEN" || !team.registrationApplication
    const status = phase === "MANDATE" ? team.mandateStatus : team.registrationStatus
    let description = ""
    let action = ""
    if (phase === "REGISTRATION") {
      if (status === "APPROVED") {
        description = "Registreerimine on kinnitatud. Mandaat pole veel avatud."
        if (team.competition.mandateOverride === "AUTO" && team.competition.mandateOpensAt && team.competition.mandateOpensAt > now) {
          description = `Registreerimine on kinnitatud. Mandaat avaneb ${team.competition.mandateOpensAt.toLocaleString("et-EE", { timeZone: "Europe/Tallinn", dateStyle: "short", timeStyle: "short" })}.`
        }
        action = "Vaata võistkonda"
      } else if (status === "CHANGES_REQUESTED") {
        description = "Täienda registreerimise andmeid ja esita need uuesti."
        action = "Täienda registreeringut"
      } else if (status === "DRAFT") {
        description = "Registreering on pooleli. Täida andmed ja esita registreering."
        action = "Jätka registreerimist"
      } else {
        description = "Registreering on esitatud ja ootab korraldaja kinnitust."
        action = "Vaata registreeringut"
      }
    } else if (phase === "MANDATE") {
      if (status === "APPROVED") {
        description = "Mandaat on kinnitatud. Järgmine etapp on võistlus; tulemused ilmuvad siia võistluse alguses."
        action = "Vaata mandaati"
      } else if (status === "CHANGES_REQUESTED") {
        description = "Täienda mandaati korraldaja märkuste järgi ja esita uuesti."
        action = "Täienda mandaati"
      } else if (status === "SUBMITTED") {
        description = "Mandaat on esitatud ja ootab korraldaja kinnitust."
        action = "Vaata mandaati"
      } else {
        description = canFillMandate ? "Täienda võistkonna koosseisu ja esita mandaat korraldajale." : "Mandaadi esitamine on suletud. Võta järgmise sammu osas ühendust korraldajaga."
        action = canFillMandate ? "Täida mandaat" : "Vaata mandaati"
      }
    } else {
      description = [isRepresentative ? "Esindaja" : null, isMember ? "Võistkonna liige" : null].filter(Boolean).join(" · ")
    }
    if (!isRepresentative && phase !== "ACTIVE") description += " Andmeid haldab sinu võistkonna esindaja."
    participantItems.push({
      id: `team-${team.id}`, teamId: team.id, phase, status,
      competitionId: team.competition.id, competitionName: team.competition.name,
      teamName: teamDisplayName(team), className: team.class, date: team.competition.date?.toISOString() ?? null,
      href: isRepresentative && phase !== "ACTIVE" ? `/dashboard/representative/teams/${team.id}${phase === "MANDATE" ? "#mandate" : ""}` : ownApplication && phase !== "ACTIVE" ? `/dashboard/registrations/${ownApplication.id}` : null,
      action: isRepresentative && phase !== "ACTIVE" ? action : ownApplication && phase !== "ACTIVE" ? "Vaata registreeringut" : null, description,
      note: phase === "MANDATE" ? team.mandateReviewNote : phase === "REGISTRATION" ? team.registrationReviewNote : null,
      requiresAction: isRepresentative && (phase === "REGISTRATION" ? ["DRAFT", "CHANGES_REQUESTED"].includes(status) : phase === "MANDATE" && (status === "CHANGES_REQUESTED" || (status === "DRAFT" && canFillMandate))),
      waitlistPosition: null, isRepresentative, isMember, resultsToken: phase === "ACTIVE" ? team.accessTokens[0]?.token ?? null : null,
    })
  }
  const mayCreateCompetition = canCreateCompetition(currentUser.role)
  const discoverContent = (
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
          {openCompetitions.length === 0 && <p className="rounded-xl border bg-white p-5 text-sm text-gray-500">Praegu ei ole avalikke registreerimisi avatud. <Link href="/competitions" className="text-blue-600 hover:underline">Vaata kõiki avalikke võistlusi →</Link></p>}
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
  )
  const judgeContent = (
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
  )
  const managedContent = (
        <section aria-labelledby="managed-competitions-title">
          <SectionHeading
            id="managed-competitions-title"
            title="Minu hallatavad võistlused"
            description="Võistlused, mida saad administraatori, peakorraldaja või korraldajana hallata."
          />
          {competitions.length === 0 && <p className="rounded-xl border bg-white p-5 text-sm text-gray-500">Sul pole praegu hallatavaid võistlusi.</p>}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[...competitions].sort((a, b) =>
              (competitionStatusOrder[a.status] ?? 5) - (competitionStatusOrder[b.status] ?? 5)
            ).map((competition) => (
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
                      Peakorraldaja: {competition.organizer?.name ?? "määramata"}
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
  )
  const views = [
    { id: "teams", label: "Minu võistkonnad", count: participantItems.length, content: <ParticipantTeams items={participantItems} /> },
    ...(judgeMemberships.length ? [{ id: "judge", label: "Hindamine", count: judgeMemberships.length, content: judgeContent }] : []),
    ...(competitions.length || mayCreateCompetition ? [{ id: "manage", label: "Võistluste haldamine", count: competitions.length, content: managedContent }] : []),
    { id: "discover", label: "Leia võistlus", count: openCompetitions.length, content: discoverContent },
  ]
  const initialView = participantItems.length ? "teams" : judgeMemberships.length ? "judge" : competitions.length || mayCreateCompetition ? "manage" : "teams"
  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Töölaud</h1>
          <p className="mt-2 text-sm text-gray-500">Sinu võistkonnad, ülesanded ja võistlused ühes kohas.</p>
        </div>
        {mayCreateCompetition && <Link href="/dashboard/competitions/new" className="shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 sm:px-4">+ Uus võistlus</Link>}
      </div>
      <DashboardViews views={views} initialView={initialView} />
    </div>
  )
}
