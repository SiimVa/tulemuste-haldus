import Link from "next/link"
import { auth } from "@/lib/auth"
import {
  getRoleInvitationState,
  maskInvitationEmail,
  parseStoredRoleInvitation,
} from "@/lib/competitionRoleInvitations"
import { findCompetitionRoleInvitationByToken } from "@/lib/competitionRoleInvitations.server"
import { CompetitionRoleInvitationActions } from "@/components/CompetitionRoleInvitationActions"

const ROLE_LABELS = {
  ORGANIZER: "Korraldaja",
  JUDGE: "Kohtunik",
  REPRESENTATIVE: "Võistkonna esindaja",
} as const

export default async function CompetitionRoleInvitationPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const [session, invitation] = await Promise.all([
    auth(),
    findCompetitionRoleInvitationByToken(token),
  ])

  if (!invitation) {
    return (
      <InvitationShell>
        <h1 className="text-xl font-bold text-gray-900">Kutset ei leitud</h1>
        <p className="text-sm text-gray-500 mt-2">
          Link võib olla vigane või asendatud uue kutselingiga.
        </p>
      </InvitationShell>
    )
  }

  const state = getRoleInvitationState(invitation)
  const values = parseStoredRoleInvitation(invitation)
  if (!values) {
    return (
      <InvitationShell>
        <h1 className="text-xl font-bold text-gray-900">Kutse on vigane</h1>
        <p className="text-sm text-gray-500 mt-2">
          Palu korraldajal luua uus kutse.
        </p>
      </InvitationShell>
    )
  }

  if (state !== "PENDING") {
    const content = {
      ACCEPTED: {
        title: "Kutse on juba vastu võetud",
        text: "Määratud õigused on kasutajakontole lisatud.",
      },
      REVOKED: {
        title: "Kutse on tühistatud",
        text: "Palu korraldajal vajaduse korral uus kutse saata.",
      },
      EXPIRED: {
        title: "Kutse on aegunud",
        text: "Kutse kehtib seitse päeva. Palu korraldajal link uuendada.",
      },
    }[state]
    return (
      <InvitationShell>
        <h1 className="text-xl font-bold text-gray-900">{content.title}</h1>
        <p className="text-sm text-gray-500 mt-2">{content.text}</p>
        {state === "ACCEPTED" && (
          <Link
            href="/dashboard"
            className="inline-flex mt-5 text-sm text-blue-600 hover:underline"
          >
            Ava töölaud →
          </Link>
        )}
      </InvitationShell>
    )
  }

  const signedInEmail = session?.user?.email?.trim().toLowerCase() ?? ""
  const emailMatches = signedInEmail === invitation.email.toLowerCase()

  return (
    <InvitationShell>
      <p className="text-xs font-medium text-blue-600 uppercase tracking-wide">
        Võistluse rollikutse
      </p>
      <h1 className="text-2xl font-bold text-gray-900 mt-2">
        {invitation.competition.name}
      </h1>
      <p className="text-sm text-gray-500 mt-2">
        {invitation.invitedBy.name} kutsus konto {maskInvitationEmail(invitation.email)}
        {" "}selle võistlusega liituma.
      </p>

      <div className="border rounded-lg px-4 py-3 mt-5">
        <p className="text-xs text-gray-400 mb-2">Määratavad rollid</p>
        <div className="flex flex-wrap gap-2">
          {values.roles.map((role) => (
            <span
              key={role}
              className="text-sm bg-blue-50 text-blue-700 rounded-full px-3 py-1"
            >
              {ROLE_LABELS[role]}
            </span>
          ))}
        </div>
      </div>

      <p className="text-xs text-gray-400 mt-4 mb-5">
        Kutse aegub {invitation.expiresAt.toLocaleString("et-EE")}.
      </p>

      <CompetitionRoleInvitationActions
        token={token}
        signedIn={Boolean(session?.user?.id)}
        emailMatches={emailMatches}
      />
    </InvitationShell>
  )
}

function InvitationShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg bg-white border rounded-2xl p-6 sm:p-8 shadow-sm">
        {children}
      </div>
    </main>
  )
}
