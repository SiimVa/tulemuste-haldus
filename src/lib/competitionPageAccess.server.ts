import "server-only"

import { cache } from "react"
import { notFound, redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { canAccessCompetition } from "@/lib/competitionAccess"

// Next.js can render a page without re-running its parent layouts (the client
// names the layouts it already has), so layouts are not an access boundary.
// Every management page must call this itself before loading data.
export const requireCompetitionManager = cache(async (competitionId: string) => {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")
  const allowed = await canAccessCompetition(competitionId, {
    id: session.user.id,
    role: session.user.role,
  })
  if (!allowed) notFound()
  return session
})
