"use client"
import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"

type ExportOption = {
  label: string
  href?: string           // otsene allalaadimine
  printHref?: string      // print/PDF leht (avaneb uues vahekaardis)
}

type ExportGroup = {
  title: string
  options: ExportOption[]
}

export function ExportMenu({ groups }: { groups: ExportGroup[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-sm px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 font-medium transition-colors flex items-center gap-1.5"
      >
        <span>↓ Ekspordi</span>
        <span className="text-gray-400 text-xs">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 min-w-56 py-1 overflow-hidden">
          {groups.map((group, gi) => (
            <div key={gi}>
              {gi > 0 && <div className="h-px bg-gray-100 my-1" />}
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 pt-2 pb-1">
                {group.title}
              </p>
              {group.options.map((opt, oi) => (
                <div key={oi} className="flex items-center justify-between px-3 py-1.5 hover:bg-gray-50">
                  <span className="text-sm text-gray-700">{opt.label}</span>
                  <div className="flex items-center gap-2 ml-4">
                    {opt.href && (
                      <a
                        href={opt.href}
                        download
                        onClick={() => setOpen(false)}
                        className="text-xs text-blue-600 hover:underline font-medium"
                      >
                        Excel
                      </a>
                    )}
                    {opt.printHref && (
                      <a
                        href={opt.printHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setOpen(false)}
                        className="text-xs text-gray-500 hover:underline font-medium"
                        title="Ava prindivaadet → Salvesta PDF-ina"
                      >
                        PDF
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))}
          <p className="text-xs text-gray-400 px-3 py-2 border-t border-gray-100 mt-1">
            PDF: ava → vali &quot;Salvesta PDF-ina&quot; printerina
          </p>
        </div>
      )}
    </div>
  )
}
