import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { timingSafeEqual } from "node:crypto"

// Ühekordne setup: loo admin konto (kasutada ainult esimest korda)
export async function POST(req: Request) {
  const configuredSecret = process.env.SETUP_SECRET
  if (!configuredSecret) {
    return NextResponse.json({ error: "Algseadistus ei ole lubatud" }, { status: 503 })
  }

  const providedSecret = req.headers.get("x-setup-secret") ?? ""
  const expected = Buffer.from(configuredSecret)
  const provided = Buffer.from(providedSecret)
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const existing = await prisma.user.findFirst({ where: { role: "ADMIN" } })
  if (existing) {
    return NextResponse.json({ error: "Admin on juba loodud" }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const { email, name, password } = body

  if (typeof email !== "string" || typeof password !== "string" || typeof name !== "string" || !email.trim() || !name.trim()) {
    return NextResponse.json({ error: "Kõik väljad on kohustuslikud" }, { status: 400 })
  }
  if (password.length < 12) {
    return NextResponse.json({ error: "Parool peab olema vähemalt 12 tähemärki" }, { status: 400 })
  }

  const passwordHash = await bcrypt.hash(password, 12)
  const user = await prisma.user.create({
    data: { email: email.trim().toLowerCase(), name: name.trim(), passwordHash, role: "ADMIN" },
  })

  return NextResponse.json({ id: user.id, email: user.email, name: user.name })
}
