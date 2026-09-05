import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { RegistrationPanel } from "@/components/registration/RegistrationPanel"
import { auth } from "@/lib/auth"
import { getCompetitionRegistrationStatus } from "@/lib/competitionPhases"
import { prisma } from "@/lib/prisma"
import { parseFormAnswer, toFormFieldDefinition } from "@/lib/registrationForm"

export default async function OwnRegistrationPage({
  params,
}: {
  params: Promise<{ applicationId: string }>
}) {
  const { applicationId } = await params
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  // The submitter keeps access to their own application even when public
  // registration is disabled or the invitation link has been rotated.
  const application = await prisma.registrationApplication.findFirst({
    where: { id: applicationId, submittedById: session.user.id },
    select: {
      id: true,
      teamId: true,
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
      competition: {
        select: {
          id: true,
          name: true,
          status: true,
          registrationOverride: true,
          registrationOpensAt: true,
          registrationClosesAt: true,
          registrationFinalizedAt: true,
          registrationClasses: {
            where: { isActive: true },
            orderBy: [{ order: "asc" }, { name: "asc" }],
            select: { id: true, name: true },
          },
          registrationFormFields: {
            where: { isActive: true, showInRegistration: true },
            orderBy: [{ order: "asc" }, { createdAt: "asc" }],
          },
        },
      },
    },
  })
  if (!application) notFound()

  const { competition, fieldValues, teamId, ...registration } = application
  const readOnly = Boolean(
    teamId ||
    competition.registrationFinalizedAt ||
    competition.status !== "SETUP"
  )

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/dashboard" className="text-sm text-blue-600 hover:underline">
        ← Minu töölaud
      </Link>
      <div className="mb-6 mt-4">
        <h1 className="text-2xl font-bold text-gray-900">{competition.name}</h1>
        <p className="mt-2 text-sm text-gray-500">
          Võistkonna „{application.teamName}” registreering.
        </p>
        {readOnly && (
          <p className="mt-2 text-sm text-gray-500">
            Registreerimisetapp on lõppenud. Mandaadi ja tulemused leiad oma
            töölaualt.
          </p>
        )}
      </div>
      <RegistrationPanel
        key={application.id}
        competitionId={competition.id}
        registrationOpen={
          getCompetitionRegistrationStatus(competition) === "OPEN"
        }
        loggedIn
        allowCreate={false}
        readOnly={readOnly}
        initialApplicationId={application.id}
        classes={competition.registrationClasses}
        formFields={competition.registrationFormFields.map(toFormFieldDefinition)}
        representativeDefaults={{
          name: session.user.name ?? "",
          email: session.user.email ?? "",
        }}
        applications={[
          {
            ...registration,
            formValues: Object.fromEntries(
              fieldValues.flatMap(({ field, value }) => {
                const parsed = parseFormAnswer(value)
                return parsed === undefined ? [] : [[field.key, parsed]]
              })
            ),
          },
        ]}
      />
    </div>
  )
}
