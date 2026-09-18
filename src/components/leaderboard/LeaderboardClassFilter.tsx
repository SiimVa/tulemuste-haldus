"use client"

import { useOptimistic, useTransition } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

export function LeaderboardClassFilter({ classes }: { classes: string[] }) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [selected, setSelected] = useOptimistic(params.getAll("class").filter(cls => classes.includes(cls)))
  if (!classes.some(Boolean)) return null
  function update(next: string[]) {
    const query = new URLSearchParams(params.toString())
    query.delete("class")
    next.forEach(cls => query.append("class", cls))
    startTransition(() => {
      setSelected(next)
      router.replace(`${pathname}${query.size ? `?${query}` : ""}`, { scroll: false })
    })
  }
  return (
    <fieldset disabled={pending} aria-busy={pending} className="no-print flex flex-wrap items-center gap-3 rounded-lg border bg-white p-3 mb-4 text-sm">
      <legend className="px-1 text-gray-600">Klassifilter</legend>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={selected.length > 0} onChange={event => update(event.target.checked ? [classes.find(Boolean)!] : [])} />
        Filtreeri klassi järgi
      </label>
      {selected.length > 0 && classes.map(cls => <label key={cls} className="flex items-center gap-1.5">
        <input type="checkbox" checked={selected.includes(cls)} onChange={event => update(event.target.checked ? [...selected, cls] : selected.filter(value => value !== cls))} />
        {cls || "Klassita"}
      </label>)}
      <span className="text-xs text-gray-500">{selected.length ? "Kohad ja vahed säilivad kogu pingerea järgi." : "Näidatakse kõiki klasse."}</span>
    </fieldset>
  )
}
