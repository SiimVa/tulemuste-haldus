"use client"

import { useEffect, useId, useState } from "react"

type UserOption = { id: string; name: string; email: string }

export function CompetitionUserSearch({ competitionId, value, readOnly, onChange, onSelect }: {
  competitionId: string
  value: string
  readOnly: boolean
  onChange: (value: string) => void
  onSelect: (user: UserOption) => void
}) {
  const id = useId()
  const [users, setUsers] = useState<UserOption[]>([])
  const [selected, setSelected] = useState<UserOption | null>(null)
  const [focused, setFocused] = useState(false)
  const [active, setActive] = useState(-1)
  const [status, setStatus] = useState("")
  const hasSelection = selected?.email === value
  const showResults = focused && !readOnly && !hasSelection && value.trim().length >= 2

  useEffect(() => {
    setUsers([])
    setActive(-1)
    setStatus("")
    if (!showResults) return
    const controller = new AbortController()
    setStatus("Otsin kasutajaid...")
    const timeout = setTimeout(async () => {
      try {
        const response = await fetch(`/api/competitions/${competitionId}/role-users?q=${encodeURIComponent(value.trim())}`, { signal: controller.signal })
        if (!response.ok) throw new Error("Search failed")
        const results: UserOption[] = await response.json()
        if (controller.signal.aborted) return
        setUsers(results)
        setStatus(results.length ? "" : "Kasutajat ei leitud. Uue kasutaja kutsumiseks sisesta e-post.")
      } catch {
        if (!controller.signal.aborted) setStatus("Otsing ebaõnnestus. Proovi uuesti või sisesta e-post.")
      }
    }, 250)
    return () => { clearTimeout(timeout); controller.abort() }
  }, [competitionId, value, showResults])

  function select(user: UserOption) {
    setSelected(user)
    setFocused(false)
    onSelect(user)
  }

  return (
    <div className="relative">
      <label htmlFor={id} className="text-xs text-gray-500 mb-1 block">Kasutaja nimi või e-post</label>
      <input
        id={id} type="text" role="combobox" autoComplete="off" required maxLength={254}
        aria-expanded={showResults && users.length > 0} aria-controls={`${id}-options`}
        aria-autocomplete="list" aria-describedby={`${id}-help`}
        aria-activedescendant={showResults && active >= 0 ? `${id}-option-${active}` : undefined}
        readOnly={readOnly} value={hasSelection ? `${selected.name} · ${selected.email}` : value}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        onChange={event => { setSelected(null); onChange(event.target.value); setFocused(true) }}
        onKeyDown={event => {
          if (event.key === "Escape") { setFocused(false); return }
          if (!showResults || !users.length) return
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault()
            setActive(current => event.key === "ArrowDown" ? (current + 1) % users.length : (current <= 0 ? users.length - 1 : current - 1))
          }
          if (event.key === "Enter" && active >= 0) { event.preventDefault(); select(users[active]) }
        }}
        placeholder="Otsi nime või e-posti järgi"
        className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 read-only:bg-gray-50"
      />
      {showResults && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border bg-white shadow-lg">
          <ul id={`${id}-options`} role="listbox" aria-label="Olemasolevad kasutajad" className="max-h-64 overflow-y-auto">
            {users.map((user, index) => (
              <li key={user.id} id={`${id}-option-${index}`} role="option" aria-selected={index === active}
                onMouseDown={event => event.preventDefault()} onClick={() => select(user)}
                className={`cursor-pointer px-3 py-2 text-sm hover:bg-blue-50 ${index === active ? "bg-blue-50" : ""}`}>
                <span className="block font-medium text-gray-900">{user.name}</span>
                <span className="block text-xs text-gray-500">{user.email}</span>
              </li>
            ))}
          </ul>
          {status && <p role="status" className="px-3 py-2 text-xs text-gray-500">{status}</p>}
        </div>
      )}
      <p id={`${id}-help`} className="text-xs text-gray-500 mt-1">Vali olemasolev kasutaja või sisesta uue kasutaja e-post. Uuele kasutajale saadetakse seitsmepäevane rollikutse.</p>
    </div>
  )
}
