import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { canAccessCompetition } from "@/lib/competitionAccess"
import {
  PersonalDataRetentionError,
  purgeCompetitionPersonalData,
} from "@/lib/personalDataRetention.server"
import { prisma } from "@/lib/prisma"

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

  try {
    const result = await prisma.$transaction((tx) =>
      purgeCompetitionPersonalData(tx, id)
    )
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof PersonalDataRetentionError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    throw error
  }
}
