"use client"

import { signOut } from "next-auth/react"

export function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      aria-label="Logi välja"
      className="shrink-0 text-sm text-gray-500 transition-colors hover:text-red-600"
    >
      <span className="sm:hidden">Välju</span>
      <span className="hidden sm:inline">Logi välja</span>
    </button>
  )
}
