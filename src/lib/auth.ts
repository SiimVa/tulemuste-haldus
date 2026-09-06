import NextAuth from "next-auth"
import type { NextAuthConfig } from "next-auth"
import { headers } from "next/headers"
import Credentials from "next-auth/providers/credentials"
import Google, { type GoogleProfile } from "next-auth/providers/google"
import { PrismaAdapter } from "@auth/prisma-adapter"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { linkPendingTeamMembersToUser } from "@/lib/teamMemberAccounts.server"
import { LOGIN_ACCOUNT_POLICY, LOGIN_IP_POLICY } from "@/lib/security"
import { consumeRateLimit, recordSecurityEvent, requestFingerprint } from "@/lib/security.server"

// Constant-cost comparison for unknown accounts as well as incorrect passwords.
const dummyPasswordHash = bcrypt.hashSync("not-a-real-account-password", 12)

const providers: NextAuthConfig["providers"] = [
  Credentials({
    name: "Parool",
    credentials: {
      email: { label: "E-post", type: "email" },
      password: { label: "Parool", type: "password" },
    },
    async authorize(credentials, request) {
      const fingerprint = requestFingerprint(request.headers)
      const event = { action: "LOGIN", route: "/api/auth/callback/credentials", method: "POST", fingerprint }
      const ipLimit = await consumeRateLimit(LOGIN_IP_POLICY, fingerprint)
      if (!ipLimit.allowed) {
        if (ipLimit.firstBlocked) await recordSecurityEvent({ ...event, outcome: "RATE_LIMITED", status: 429 })
        return null
      }
      if (typeof credentials?.email !== "string" || typeof credentials?.password !== "string" ||
          !credentials.email || !credentials.password || credentials.email.length > 320 || credentials.password.length > 1024) {
        await recordSecurityEvent({ ...event, outcome: "DENIED", status: 401 })
        return null
      }
      const email = String(credentials.email).trim().toLowerCase()
      const accountLimit = await consumeRateLimit(LOGIN_ACCOUNT_POLICY, email)
      if (!accountLimit.allowed) {
        if (accountLimit.firstBlocked) await recordSecurityEvent({ ...event, outcome: "RATE_LIMITED", status: 429 })
        return null
      }
      const user = await prisma.user.findUnique({ where: { email } })
      const valid = await bcrypt.compare(
        String(credentials.password),
        user?.passwordHash ?? dummyPasswordHash
      )
      if (!valid || !user?.passwordHash) {
        await recordSecurityEvent({ ...event, outcome: "DENIED", status: 401 })
        return null
      }
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
  events: {
    async signIn({ user }) {
      if (!user.id || !user.email) return
      await recordSecurityEvent({
        action: "LOGIN", outcome: "SUCCEEDED", route: "/api/auth/[...nextauth]",
        method: "AUTH", actorUserId: user.id, fingerprint: requestFingerprint(await headers()),
      })
      await prisma.$transaction((tx) =>
        linkPendingTeamMembersToUser(tx, {
          id: user.id as string,
          email: user.email as string,
        })
      )
    },
  },
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider === "google") {
        const googleProfile = profile as GoogleProfile | undefined
        const verified = Boolean(googleProfile?.email_verified && googleProfile.email)
        if (!verified) await recordSecurityEvent({
          action: "LOGIN", outcome: "DENIED", route: "/api/auth/callback/google", method: "AUTH",
          fingerprint: requestFingerprint(await headers()),
        })
        return verified
      }
      return true
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
      }
      // Recheck authoritative role and account existence on every session read.
      const currentUser = typeof token.id === "string"
        ? await prisma.user.findUnique({ where: { id: token.id }, select: { role: true } })
        : null
      if (!currentUser) return null
      token.role = currentUser.role
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
