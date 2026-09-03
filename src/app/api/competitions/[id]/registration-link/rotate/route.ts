import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { canAccessCompetition } from "@/lib/competitionAccess"
import { prisma } from "@/lib/prisma"
import {
  generateRegistrationLinkToken,
  hashRegistrationLinkToken,
} from "@/lib/registrationAccess.server"

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const allowed = await canAccessCompetition(id, {
    id: session.user.id,
    role: session.user.role,
  })
  if (!allowed) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  }

  const competition = await prisma.competition.findUnique({
    where: { id },
    select: { registrationAccessMode: true },
  })
  if (!competition) {
    return NextResponse.json({ error: "Võistlust ei leitud" }, { status: 404 })
  }
  if (competition.registrationAccessMode !== "LINK_ONLY") {
    return NextResponse.json(
      { error: "Uue lingi saab luua ainult lingiga registreerimise režiimis" },
      { status: 409 }
    )
  }

  const registrationLinkToken = generateRegistrationLinkToken()
  await prisma.competition.update({
    where: { id },
    data: {
      registrationTokenHash: hashRegistrationLinkToken(registrationLinkToken),
    },
  })

  return NextResponse.json({ registrationLinkToken })
}
