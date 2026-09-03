import { PublicCompetitionRegistrationPage } from "@/components/registration/PublicCompetitionRegistrationPage"

export default async function LinkOnlyRegistrationPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return (
    <PublicCompetitionRegistrationPage
      access={{ type: "LINK_ONLY", registrationLinkToken: token }}
    />
  )
}
