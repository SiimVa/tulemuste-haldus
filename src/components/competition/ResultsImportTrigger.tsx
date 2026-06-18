"use client"

import { useState } from "react"
import { ResultsImportModal } from "./ResultsImportModal"

type Props = {
  elementId: string
  competitionId: string
  elementName: string
}

export function ResultsImportTrigger({ elementId, competitionId, elementName }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-sm px-3 py-1.5 border rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
      >
        ↑ Impordi tulemused
      </button>
      {open && (
        <ResultsImportModal
          elementId={elementId}
          competitionId={competitionId}
          elementName={elementName}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
