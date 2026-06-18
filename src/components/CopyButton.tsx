"use client"

import { useState } from "react"

export function CopyButton({ text, label = "Kopeeri" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={copy}
      className="text-xs px-2.5 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors shrink-0"
    >
      {copied ? "Kopeeritud!" : label}
    </button>
  )
}
