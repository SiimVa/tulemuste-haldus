"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

export function SeriesTabs({ seriesId }: { seriesId: string }) {
  const pathname = usePathname()
  const base = `/dashboard/series/${seriesId}`
  const items = [
    { href: base, label: "Pingerida" },
    { href: `${base}/overview`, label: "Ülevaade" },
    { href: `${base}/analysis`, label: "Analüüs" },
    { href: `${base}/public`, label: "Avalik vaade" },
  ]
  // Pingerida on teiste teede eesliide, seega ainult täpne vaste loeb.
  const isActive = (href: string) => (href === base ? pathname === base : pathname.startsWith(href))
  return (
    <nav aria-label="Arvestuse vaated" className="flex flex-wrap gap-x-1 border-b border-line">
      {items.map((item) => (
        <Link key={item.href} href={item.href} aria-current={isActive(item.href) ? "page" : undefined}
          className={cn("-mb-px border-b-2 px-3 py-2 text-sm font-medium", isActive(item.href) ? "border-primary text-primary" : "border-transparent text-ink-muted hover:text-ink")}>
          {item.label}
        </Link>
      ))}
    </nav>
  )
}
