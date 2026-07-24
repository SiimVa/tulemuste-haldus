import { auth } from "@/lib/auth"
import { canAccessCompetition } from "@/lib/competitionAccess"
import { notFound, redirect } from "next/navigation"

export default async function CompetitionLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const { id } = await params
  const allowed = await canAccessCompetition(id, {
    id: session.user.id,
    role: session.user.role,
  })
  if (!allowed) notFound()

  return children
}
