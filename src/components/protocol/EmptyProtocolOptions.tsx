"use client"

import { createContext, useContext, useState, type ReactNode } from "react"
import { MAX_EMPTY_PROTOCOL_ROWS, normalizeEmptyProtocolRowCount } from "@/lib/protocol"

const EmptyProtocolContext = createContext<{
  rowCount: number
  setRowCount: (value: number) => void
}>({
  rowCount: 0,
  setRowCount: () => {},
})

export function EmptyProtocolOptions({ children }: { children: ReactNode }) {
  const [rowCount, setRowCount] = useState(0)

  return (
    <EmptyProtocolContext.Provider value={{ rowCount, setRowCount: (value) => setRowCount(normalizeEmptyProtocolRowCount(value)) }}>
      {children}
    </EmptyProtocolContext.Provider>
  )
}

export function EmptyProtocolRowCountInput() {
  const { rowCount, setRowCount } = useContext(EmptyProtocolContext)

  return (
    <label className="flex items-center gap-2 text-sm text-gray-600">
      Tühje lisaridu igas protokollis (0–{MAX_EMPTY_PROTOCOL_ROWS})
      <input
        type="number"
        min={0}
        max={MAX_EMPTY_PROTOCOL_ROWS}
        step={1}
        value={rowCount}
        onChange={(event) => {
          const value = event.target.valueAsNumber
          setRowCount(value)
        }}
        className="w-24 rounded-lg border bg-white px-2 py-1.5 text-sm text-gray-700"
      />
    </label>
  )
}

export function EmptyProtocolAdditionalRows({ columnCount }: { columnCount: number }) {
  const { rowCount } = useContext(EmptyProtocolContext)

  return Array.from({ length: normalizeEmptyProtocolRowCount(rowCount) }, (_, rowIndex) => (
    <tr key={`empty-${rowIndex}`}>
      {Array.from({ length: columnCount }, (_, columnIndex) => (
        <td key={columnIndex} className={columnIndex < 4 ? "narrow" : "fill"} />
      ))}
    </tr>
  ))
}
