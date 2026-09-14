import { handlers } from "@/lib/auth"
import type { NextRequest } from "next/server"
import { recordSecurityEvent, requestFingerprint } from "@/lib/security.server"

export async function GET(request: NextRequest) {
  const response = await handlers.GET(request)
  if (request.nextUrl.pathname === "/api/auth/callback/google") {
    const location = response.headers.get("location")
    const error = location ? new URL(location, request.url).searchParams.get("error") : null
    if (error || response.status >= 400) {
      try {
        await recordSecurityEvent({
          action: "LOGIN", outcome: error === "AccessDenied" ? "DENIED" : "FAILED",
          route: "/api/auth/callback/google", method: "AUTH",
          fingerprint: requestFingerprint(request.headers),
        })
      } catch {
        console.error("Google login failure audit unavailable")
      }
    }
  }
  return response
}

export const POST = handlers.POST
