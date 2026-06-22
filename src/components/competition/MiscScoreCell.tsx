"use client"

import { useState, useRef } from "react"

type Entry = { description: string; points: number }

// Pingerea "Muu" elemendi lahter, mis näitab kirjeldusi popoveris (hiire all + klõpsates).
// position: fixed väldib overflow-x-auto kerimisriba lõikamist.
export function MiscScoreCell({
  value,
  entries,
  className,
}: {
  value: string
  entries: Entry[]
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const ref = useRef<HTMLTableCellElement>(null)

  function show() {
    const r = ref.current?.getBoundingClientRect()
    if (r) setPos({ top: r.bottom + 4, left: r.right })
    setOpen(true)
  }

  return (
    <td
      ref={ref}
      onMouseEnter={show}
      onMouseLeave={() => setOpen(false)}
      onClick={() => (open ? setOpen(false) : show())}
      className={`${className ?? ""} underline decoration-dotted decoration-gray-400 cursor-help`}
    >
      {value}
      {open && pos && entries.length > 0 && (
        <div
          style={{ position: "fixed", top: pos.top, left: pos.left, transform: "translateX(-100%)" }}
          className="z-50 bg-gray-900 text-white text-xs rounded-lg shadow-xl px-3 py-2 max-w-xs text-left pointer-events-none"
        >
          {entries.map((e, i) => (
            <div key={i} className="flex items-center justify-between gap-3 whitespace-nowrap py-0.5">
              <span className="font-sans">{e.description}</span>
              <span className={`font-mono ${e.points >= 0 ? "text-green-300" : "text-red-300"}`}>
                {e.points >= 0 ? "+" : ""}{e.points}p
              </span>
            </div>
          ))}
        </div>
      )}
    </td>
  )
}
