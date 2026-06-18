"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

export function AutoRefresh({ intervalSeconds = 30 }: { intervalSeconds?: number }) {
  const router = useRouter()
  const [remaining, setRemaining] = useState(intervalSeconds)

  useEffect(() => {
    const tick = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          router.refresh()
          return intervalSeconds
        }
        return r - 1
      })
    }, 1000)
    return () => clearInterval(tick)
  }, [router, intervalSeconds])

  return (
    <span className="text-xs text-gray-400">
      Uueneb {remaining}s pärast
    </span>
  )
}
