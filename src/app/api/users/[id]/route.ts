import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"

// Admin: lähtesta teise kasutaja parool
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (session?.user?.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const { password } = await req.json()
  if (!password || password.length < 6) {
    return NextResponse.json({ error: "Parool peab olema vähemalt 6 tähemärki" }, { status: 400 })
  }

  const passwordHash = await bcrypt.hash(password, 12)
  await prisma.user.update({ where: { id }, data: { passwordHash } })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (session?.user?.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  if (id === session.user.id) return NextResponse.json({ error: "Ei saa ennast kustutada" }, { status: 400 })

  await prisma.user.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
