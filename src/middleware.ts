import { NextRequest, NextResponse } from "next/server"
import { canonicalAuthRedirect } from "@/lib/authOrigin"

export function middleware(request: NextRequest) {
  const target = canonicalAuthRedirect(request.url, process.env.AUTH_URL ?? process.env.NEXTAUTH_URL)
  return target ? NextResponse.redirect(target, 307) : NextResponse.next()
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] }
