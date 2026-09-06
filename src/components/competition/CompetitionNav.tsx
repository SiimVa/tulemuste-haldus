"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import { cn } from "@/lib/utils"

type NavItem = { href: string; label: string }
type NavEntry = NavItem | { label: string; items: NavItem[] }

function isGroup(entry: NavEntry): entry is { label: string; items: NavItem[] } {
  return "items" in entry
}

export function CompetitionNav({ competitionId }: { competitionId: string }) {
  const pathname = usePathname()
  const base = `/dashboard/competitions/${competitionId}`

  const entries: NavEntry[] = [
    { href: base, label: "Ülevaade" },
    { href: `${base}/teams`, label: "Võistkonnad" },
    {
      label: "Registreerimine",
      items: [
        { href: `${base}/registrations`, label: "Registreerimised" },
        { href: `${base}/registration-settings`, label: "Registreerimise seaded" },
      ],
    },
    {
      label: "Tulemused",
      items: [
        { href: `${base}/leaderboard`, label: "Pingerida" },
        { href: `${base}/overview`, label: "Statistika" },
      ],
    },
    {
      label: "Vaated",
      items: [
        { href: `${base}/athlete-view`, label: "Võistlejate vaade" },
        { href: `${base}/public-view`, label: "Avalik vaade" },
      ],
    },
    {
      label: "Haldus",
      items: [
        { href: `${base}/access`, label: "Juurdepääs" },
        { href: `${base}/settings`, label: "Seaded" },
      ],
    },
  ]

  // Ülevaade on kõigi teiste teede eesliide, seega ainult täpne vaste loeb.
  const isActive = (href: string) =>
    href === base ? pathname === base : pathname.startsWith(href)

  const itemClass = (active: boolean) =>
    cn(
      "px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
      active
        ? "text-primary border-primary"
        : "text-ink-muted border-transparent hover:text-primary"
    )

  return (
    <div className="flex items-center justify-between gap-4 border-b border-line mb-6">
      <nav className="flex items-center flex-wrap">
        {entries.map((entry) =>
          isGroup(entry) ? (
            <DropdownMenu.Root key={entry.label}>
              <DropdownMenu.Trigger
                className={cn(
                  itemClass(entry.items.some((i) => isActive(i.href))),
                  "inline-flex items-center gap-1 outline-none"
                )}
              >
                {entry.label}
                <span aria-hidden className="text-[10px] leading-none">▾</span>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="start"
                  sideOffset={4}
                  className="z-50 min-w-48 bg-surface border border-line rounded-card shadow-md p-1"
                >
                  {entry.items.map((item) => (
                    <DropdownMenu.Item key={item.href} asChild>
                      <Link
                        href={item.href}
                        className={cn(
                          "block px-3 py-2 text-sm rounded-control outline-none cursor-pointer",
                          isActive(item.href)
                            ? "text-primary bg-primary-soft"
                            : "text-ink hover:bg-canvas focus:bg-canvas"
                        )}
                      >
                        {item.label}
                      </Link>
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          ) : (
            <Link
              key={entry.href}
              href={entry.href}
              className={itemClass(isActive(entry.href))}
            >
              {entry.label}
            </Link>
          )
        )}
      </nav>

      <Link
        href={`${base}/elements/new`}
        className="shrink-0 mb-2 inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-control bg-primary text-primary-foreground hover:bg-primary-hover transition-colors"
      >
        + Element
      </Link>
    </div>
  )
}
