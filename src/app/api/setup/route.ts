import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"

// Ühekordne setup: loo admin konto (kasutada ainult esimest korda)
export async function POST(req: Request) {
  const existing = await prisma.user.findFirst({ where: { role: "ADMIN" } })
  if (existing) {
    return NextResponse.json({ error: "Admin on juba loodud" }, { status: 400 })
  }

  const body = await req.json()
  const { email, name, password } = body

  if (!email || !password || !name) {
    return NextResponse.json({ error: "Kõik väljad on kohustuslikud" }, { status: 400 })
  }

  const passwordHash = await bcrypt.hash(password, 12)
  const user = await prisma.user.create({
    data: { email, name, passwordHash, role: "ADMIN" },
  })

  return NextResponse.json({ id: user.id, email: user.email, name: user.name })
}
