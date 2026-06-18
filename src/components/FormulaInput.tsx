"use client"

import { useRef, useState, useEffect } from "react"

type Field = { name: string; label: string; type: string }

interface Props {
  value: string
  onChange: (v: string) => void
  availableFields: Field[]
  placeholder?: string
}

const OPERATORS = ["+", "-", "*", "/", "(", ")", "min(", "max(", "floor(", "round("]

function tryEval(formula: string, fields: Field[]): number | null {
  try {
    const scope: Record<string, number> = {}
    fields.forEach(f => { scope[f.name] = f.type === "TIME" ? 60 : 1 })
    const argNames = Object.keys(scope)
    const argValues = Object.values(scope)
    // eslint-disable-next-line no-new-func
    const fn = new Function(...argNames, "min", "max", "floor", "round", "abs", `return (${formula})`)
    const result = fn(...argValues, Math.min, Math.max, Math.floor, Math.round, Math.abs)
    return typeof result === "number" && isFinite(result) ? Math.round(result * 100) / 100 : null
  } catch {
    return null
  }
}

export function FormulaInput({ value, onChange, availableFields, placeholder }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)

  const insertAtCursor = (text: string) => {
    const el = inputRef.current
    if (!el) { onChange(value + text); return }
    const start = el.selectionStart ?? value.length
    const end = el.selectionEnd ?? value.length
    const next = value.slice(0, start) + text + value.slice(end)
    onChange(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + text.length, start + text.length)
    })
  }

  useEffect(() => {
    if (!value.trim()) { setPreview(null); return }
    const result = tryEval(value, availableFields.filter(f => f.type !== "COMPUTED"))
    setPreview(result !== null ? String(result) : null)
  }, [value, availableFields])

  const inputFields = availableFields.filter(f => f.type !== "COMPUTED")

  return (
    <div className="space-y-2">
      {/* Klõpsatavad väljanimed */}
      {inputFields.length > 0 && (
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-xs text-gray-400 shrink-0">Väljad:</span>
          {inputFields.map(f => (
            <button key={f.name} type="button"
              onClick={() => insertAtCursor(f.name)}
              title={`Sisesta: ${f.name}`}
              className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded hover:bg-blue-100 transition-colors font-mono">
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* Tehtemärgid */}
      <div className="flex flex-wrap gap-1">
        <span className="text-xs text-gray-400 self-center shrink-0">Tehted:</span>
        {OPERATORS.map(op => (
          <button key={op} type="button"
            onClick={() => insertAtCursor(op.endsWith("(") ? op + ")" : op)}
            className="text-xs bg-gray-100 text-gray-600 border border-gray-200 px-2 py-0.5 rounded hover:bg-gray-200 transition-colors font-mono">
            {op}
          </button>
        ))}
      </div>

      {/* Valemi sisend */}
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? "nt: aeg + eksimused * 10"}
        className="w-full px-3 py-2 border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <p className="text-xs text-gray-400">Kümnendkoha eraldajana kasuta <span className="font-mono font-medium text-gray-600">.</span> (punkt), mitte koma — nt <span className="font-mono text-gray-600">0.5</span></p>

      {/* Eelvaade */}
      <div className="text-xs text-gray-400 flex items-center gap-2">
        {preview !== null ? (
          <>
            <span className="text-green-600 font-medium">✓ Valem töötab</span>
            <span>— näidistulemus: <span className="font-mono text-gray-600">{preview}</span></span>
            {inputFields.some(f => f.type === "TIME") && (
              <span className="text-gray-400">(aeg=60s, arvud=1)</span>
            )}
          </>
        ) : value.trim() ? (
          <span className="text-red-500">✗ Valemis on viga</span>
        ) : (
          <span>Kirjuta valem ülal</span>
        )}
      </div>
    </div>
  )
}
