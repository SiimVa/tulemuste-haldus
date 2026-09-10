"use client"

import { useState } from "react"
import Link from "next/link"

type PrintOrientation = "landscape" | "portrait"

export function ProtocolPrintToolbar({
  backHref,
  buttonLabel,
  info,
  className = "",
}: {
  backHref: string
  buttonLabel: string
  info?: string
  className?: string
}) {
  const [orientation, setOrientation] = useState<PrintOrientation>("landscape")

  return (
    <>
      <style>{`@page { size: A4 ${orientation}; margin: 0; }`}</style>
      <div
        className={`no-print flex flex-wrap items-center gap-3 bg-gray-50 p-3 border ${className}`}
      >
        <Link href={backHref} className="text-sm text-gray-500 hover:text-gray-700">
          ← Tagasi
        </Link>
        <span className="text-gray-300">|</span>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          Paigutus
          <select
            value={orientation}
            onChange={(event) => setOrientation(event.target.value as PrintOrientation)}
            className="rounded-lg border bg-white px-2 py-1.5 text-sm text-gray-700"
          >
            <option value="landscape">Horisontaalne</option>
            <option value="portrait">Vertikaalne</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
        >
          {buttonLabel}
        </button>
        {info && <span className="text-xs text-gray-400">{info}</span>}
      </div>
    </>
  )
}
