"use client"

import { signOut } from "next-auth/react"
import Link from "next/link"
import { useState } from "react"
import { useRouter } from "next/navigation"

export function CompetitionRoleInvitationActions({
  token,
  signedIn,
  emailMatches,
}: {
  token: string
  signedIn: boolean
  emailMatches: boolean
}) {
  const router = useRouter()
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState("")
  const callbackUrl = `/invitations/${token}`

  if (!signedIn) {
    return (
      <Link
        href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}
        className="inline-flex justify-center w-full bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700"
      >
        Logi sisse ja võta kutse vastu
      </Link>
    )
  }

  if (!emailMatches) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          Oled sisse logitud teise e-postiga. Kutse vastuvõtmiseks vaheta
          kontot.
        </p>
        <button
          type="button"
          onClick={() =>
            signOut({
              callbackUrl: `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`,
            })
          }
          className="w-full border border-gray-300 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50"
        >
          Logi välja ja vaheta kontot
        </button>
      </div>
    )
  }

  async function acceptInvitation() {
    setAccepting(true)
    setError("")
    const response = await fetch(`/api/invitations/${token}/accept`, {
      method: "POST",
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      setError(data.error ?? "Kutse vastuvõtmine ebaõnnestus")
      setAccepting(false)
      return
    }
    router.push("/dashboard")
    router.refresh()
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={acceptInvitation}
        disabled={accepting}
        className="w-full bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
      >
        {accepting ? "Võtan kutset vastu..." : "Võta kutse vastu"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
