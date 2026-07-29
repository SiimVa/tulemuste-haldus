import { auth } from "@/lib/auth"
import { canCreateCompetition } from "@/lib/permissions"
import { redirect } from "next/navigation"

export default async function NewCompetitionLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  if (!session?.user) redirect("/login")
  if (!canCreateCompetition(session.user.role)) redirect("/dashboard")

  return children
}
