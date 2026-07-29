import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const assignments = await prisma.teamRepresentative.findMany({
    where: { member: { userId: session.user.id } },
    select: {
      id: true,
      addedAt: true,
      team: {
        select: {
          id: true,
          code: true,
          name: true,
          class: true,
          registrationStatus: true,
          registrationSubmittedAt: true,
          registrationReviewedAt: true,
          registrationReviewNote: true,
          mandateStatus: true,
          mandateSubmittedAt: true,
          mandateReviewedAt: true,
          mandateReviewNote: true,
          workflowUpdatedAt: true,
          members: {
            select: { id: true, name: true, role: true },
            orderBy: { name: "asc" },
          },
          competition: {
            select: {
              id: true,
              name: true,
              date: true,
              endDate: true,
              location: true,
              status: true,
            },
          },
        },
      },
    },
    orderBy: [
      { team: { competition: { date: "desc" } } },
      { team: { code: "asc" } },
    ],
  })

  return NextResponse.json(assignments)
}
