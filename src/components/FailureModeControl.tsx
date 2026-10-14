"use client"

import { evaluateFailureRule, resolveFailure, type FailureElement, type FailureMode } from "@/lib/failureRules"
import { exceptionKind } from "@/lib/exceptionKinds"

export function FailureModeControl({ element, values, mode, onChange, exceptionLabel }: {
  element: FailureElement; values: Record<string, unknown>; mode: FailureMode; onChange: (mode: FailureMode) => void; exceptionLabel?: string | null
}) {
  if (!element.exceptions.some(e => exceptionKind(e) === "FAILED")) return null
  const otherException = exceptionLabel && !element.exceptions.some(e => e.label === exceptionLabel && exceptionKind(e) === "FAILED")
  let reason: string
  if (otherException) reason = `Eriolukord „${exceptionLabel}” määrab tulemuse.`
  else if (mode === "AUTO") reason = evaluateFailureRule(element.config, element.fields, values).reason
  else reason = resolveFailure(element, values, mode).failureReason
  return <div className="space-y-1">
    <label className="block text-xs text-gray-600">Ebaõnnestumise otsus
      <select aria-label="Ebaõnnestumise otsus" value={mode} disabled={Boolean(otherException)} onChange={e => onChange(e.target.value as FailureMode)} className="block w-full rounded border px-2 py-1.5 text-sm">
        <option value="AUTO">Automaatne</option>
        <option value="FORCE_SUCCESS">Ei ebaõnnestunud</option>
        <option value="FORCE_FAILED">Ebaõnnestus</option>
      </select>
    </label>
    <p role="status" className="text-xs text-amber-800">{reason}</p>
  </div>
}
