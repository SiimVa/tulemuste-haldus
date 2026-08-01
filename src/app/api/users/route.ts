import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { linkPendingTeamMembersToUser } from "@/lib/teamMemberAccounts.server"
import bcrypt from "bcryptjs"

export async function GET() {
  const session = await auth()
  if (session?.user?.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  })
  return NextResponse.json(users)
}

export async function POST(req: Request) {
  const session = await auth()
  if (session?.user?.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { email, name, password } = await req.json()
  if (!email || !name || !password) return NextResponse.json({ error: "Kõik väljad on kohustuslikud" }, { status: 400 })
  const normalizedEmail = String(email).trim().toLowerCase()
  const normalizedName = String(name).trim()

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } })
  if (existing) return NextResponse.json({ error: "E-post on juba kasutusel" }, { status: 400 })

  const passwordHash = await bcrypt.hash(password, 12)
  const user = await prisma.$transaction(async (tx) => {
    const createdUser = await tx.user.create({
      data: {
        email: normalizedEmail,
        name: normalizedName,
        passwordHash,
        role: "USER",
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    })
    await linkPendingTeamMembersToUser(tx, createdUser)
    return createdUser
  })
  return NextResponse.json(user)
}
