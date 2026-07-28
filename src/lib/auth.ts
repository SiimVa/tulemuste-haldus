import NextAuth from "next-auth"
import type { NextAuthConfig } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import Google, { type GoogleProfile } from "next-auth/providers/google"
import { PrismaAdapter } from "@auth/prisma-adapter"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"

const providers: NextAuthConfig["providers"] = [
  Credentials({
    name: "Parool",
    credentials: {
      email: { label: "E-post", type: "email" },
      password: { label: "Parool", type: "password" },
    },
    async authorize(credentials) {
      if (!credentials?.email || !credentials?.password) return null
      const email = String(credentials.email).trim().toLowerCase()
      const user = await prisma.user.findUnique({ where: { email } })
      if (!user?.passwordHash) return null

      const valid = await bcrypt.compare(
        String(credentials.password),
        user.passwordHash
      )
      if (!valid) return null
      return { id: user.id, email: user.email, name: user.name, role: user.role }
    },
  }),
]

const googleClientId = process.env.AUTH_GOOGLE_ID
const googleClientSecret = process.env.AUTH_GOOGLE_SECRET

if (googleClientId && googleClientSecret) {
  providers.push(
    Google({
      clientId: googleClientId,
      clientSecret: googleClientSecret,
      // Google'i provider lubatakse ainult kinnitatud e-postiga (vt profile
      // kontroll all), seega võib olemasoleva paroolikonto sama e-posti järgi
      // turvaliselt Google'i kontoga siduda.
      allowDangerousEmailAccountLinking: true,
      profile(profile: GoogleProfile) {
        if (!profile.email_verified || !profile.email || !profile.name) {
          throw new Error("Google'i konto e-post ei ole kinnitatud")
        }

        return {
          id: profile.sub,
          email: profile.email.trim().toLowerCase(),
          name: profile.name.trim(),
          image: profile.picture,
          emailVerified: new Date(),
        }
      },
    })
  )
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET,
  trustHost: true,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers,
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider === "google") {
        const googleProfile = profile as GoogleProfile | undefined
        return Boolean(googleProfile?.email_verified && googleProfile.email)
      }
      return true
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = (user as { role?: string }).role
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string
        session.user.role = token.role as string
      }
      return session
    },
  },
})
