import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"

// Oma parooli muutmine (vajab praeguse parooli kinnitust)
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { currentPassword, newPassword } = await req.json()
  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: "Kõik väljad on kohustuslikud" }, { status: 400 })
  }
  if (newPassword.length < 6) {
    return NextResponse.json({ error: "Uus parool peab olema vähemalt 6 tähemärki" }, { status: 400 })
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } })
  if (!user) return NextResponse.json({ error: "Kasutajat ei leitud" }, { status: 404 })

  const valid = await bcrypt.compare(currentPassword, user.passwordHash)
  if (!valid) return NextResponse.json({ error: "Praegune parool on vale" }, { status: 400 })

  const passwordHash = await bcrypt.hash(newPassword, 12)
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } })
  return NextResponse.json({ ok: true })
}
