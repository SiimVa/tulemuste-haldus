import Link from "next/link"
import { notFound } from "next/navigation"
import { RegistrationPanel } from "@/components/registration/RegistrationPanel"
import { auth } from "@/lib/auth"
import { getCompetitionRegistrationStatus } from "@/lib/competitionPhases"
import { prisma } from "@/lib/prisma"
import {
  parseFormAnswer,
  toFormFieldDefinition,
} from "@/lib/registrationForm"

const STATUS_LABEL = {
  NOT_OPEN: "Registreerimine pole veel avatud",
  OPEN: "Registreerimine avatud",
  CLOSED: "Registreerimine suletud",
  FINALIZED: "Osalejate nimekiri kinnitatud",
}

export default async function PublicCompetitionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  const { id } = await params
  const competition = await prisma.competition.findFirst({
    where: {
      id,
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
      registrationCapacity: true,
      registrationClasses: {
        where: { isActive: true },
        orderBy: [{ order: "asc" }, { name: "asc" }],
        select: { id: true, name: true },
      },
      registrationFormFields: {
        where: { isActive: true, showInRegistration: true },
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          key: true,
          label: true,
          helpText: true,
          type: true,
          semanticKey: true,
          options: true,
          memberFields: true,
          showInRegistration: true,
          requiredInRegistration: true,
          showInMandate: true,
          requiredInMandate: true,
          editableInMandate: true,
          conditionFieldKey: true,
          conditionOperator: true,
          conditionValue: true,
          order: true,
        },
      },
      registrationApplications: {
        where: {
          submittedById: session?.user?.id ?? "__anonymous-user__",
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          teamName: true,
          status: true,
          allocationReason: true,
          waitlistPosition: true,
          submittedAt: true,
          class: { select: { id: true, name: true } },
          fieldValues: {
            select: {
              value: true,
              field: { select: { key: true } },
            },
          },
        },
      },
      _count: {
        select: {
          registrationApplications: {
            where: { status: "CONFIRMED" },
          },
        },
      },
    },
  })
  if (!competition) notFound()

  const registrationStatus = getCompetitionRegistrationStatus(competition)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
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

      <main className="max-w-4xl mx-auto px-4 py-10">
        <Link
          href="/competitions"
          className="text-sm text-gray-400 hover:text-gray-600"
        >
          ← Kõik võistlused
        </Link>

        <div className="mt-4 mb-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {competition.name}
              </h1>
              {(competition.date || competition.endDate) && (
                <p className="text-sm text-gray-500 mt-2">
                  📅 {competition.date?.toLocaleDateString("et-EE") ?? ""}
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
            </div>
            <span className="text-sm bg-white border rounded-full px-3 py-1">
              {STATUS_LABEL[registrationStatus]}
            </span>
          </div>

          {registrationStatus === "OPEN" &&
            competition.registrationClosesAt && (
              <p className="text-sm text-gray-600 mt-4">
                Registreerimine on avatud kuni{" "}
                {competition.registrationClosesAt.toLocaleString("et-EE", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
                .
              </p>
            )}
          {competition.registrationCapacity && (
            <p className="text-sm text-gray-500 mt-1">
              Kinnitatud kohti:{" "}
              {competition._count.registrationApplications}/
              {competition.registrationCapacity}. Pärast kohtade täitumist
              lisatakse avaldus ootenimekirja.
            </p>
          )}
        </div>

        <RegistrationPanel
          competitionId={competition.id}
          registrationOpen={registrationStatus === "OPEN"}
          loggedIn={Boolean(session?.user)}
          classes={competition.registrationClasses}
          formFields={competition.registrationFormFields.map(
            toFormFieldDefinition
          )}
          applications={competition.registrationApplications.map(
            ({ fieldValues, ...application }) => ({
              ...application,
              formValues: Object.fromEntries(
                fieldValues.flatMap(({ field, value }) => {
                  const parsed = parseFormAnswer(value)
                  return parsed === undefined ? [] : [[field.key, parsed]]
                })
              ),
            })
          )}
        />
      </main>
    </div>
  )
}
