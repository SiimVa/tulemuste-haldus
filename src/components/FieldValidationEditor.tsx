"use client"

import { FieldValidation } from "@/lib/fieldValidation"

interface Props {
  fieldType: string
  validation: FieldValidation
  onChange: (v: FieldValidation) => void
}

export function FieldValidationEditor({ fieldType, validation, onChange }: Props) {
  if (fieldType === "TEXT" || fieldType === "COMPUTED") return null

  const hasRules = validation.required || validation.min != null || validation.max != null || validation.integer

  return (
    <details open={!!hasRules} className="text-xs">
      <summary className="cursor-pointer text-gray-400 hover:text-gray-600 select-none py-0.5">
        Reeglid {hasRules ? <span className="text-indigo-500 font-medium">● aktiivne</span> : ""}
      </summary>
      <div className="mt-2 pl-2 border-l-2 border-gray-100 space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={!!validation.required}
            onChange={e => onChange({ ...validation, required: e.target.checked || undefined })}
            className="accent-indigo-600" />
          <span className="text-gray-600">Kohustuslik väli</span>
        </label>

        {fieldType === "NUMBER" && (
          <>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={!!validation.integer}
                onChange={e => onChange({ ...validation, integer: e.target.checked || undefined })}
                className="accent-indigo-600" />
              <span className="text-gray-600">Ainult täisarvud</span>
            </label>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-gray-500">Min:</span>
                <input type="number" step="any"
                  value={validation.min ?? ""}
                  onChange={e => onChange({ ...validation, min: e.target.value !== "" ? Number(e.target.value) : null })}
                  onFocus={e => e.target.select()}
                  placeholder="—"
                  className="w-20 px-2 py-1 border rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-gray-500">Max:</span>
                <input type="number" step="any"
                  value={validation.max ?? ""}
                  onChange={e => onChange({ ...validation, max: e.target.value !== "" ? Number(e.target.value) : null })}
                  onFocus={e => e.target.select()}
                  placeholder="—"
                  className="w-20 px-2 py-1 border rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400" />
              </div>
            </div>
          </>
        )}

        {fieldType === "TIME" && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-gray-500">Min (s):</span>
              <input type="number" min={0} step={1}
                value={validation.min ?? ""}
                onChange={e => onChange({ ...validation, min: e.target.value !== "" ? Number(e.target.value) : null })}
                onFocus={e => e.target.select()}
                placeholder="—"
                className="w-20 px-2 py-1 border rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-gray-500">Max (s):</span>
              <input type="number" min={0} step={1}
                value={validation.max ?? ""}
                onChange={e => onChange({ ...validation, max: e.target.value !== "" ? Number(e.target.value) : null })}
                onFocus={e => e.target.select()}
                placeholder="—"
                className="w-20 px-2 py-1 border rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400" />
            </div>
            <span className="text-gray-400">(sekundites)</span>
          </div>
        )}
      </div>
    </details>
  )
}
