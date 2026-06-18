export type FieldValidation = {
  required?: boolean
  min?: number | null
  max?: number | null
  integer?: boolean
}

export type ValidationError = { field: string; label: string; message: string }

export function parseValidation(raw?: string | null): FieldValidation {
  if (!raw) return {}
  try { return JSON.parse(raw) } catch { return {} }
}

export function validateFieldValue(
  value: string | number | undefined | null,
  fieldName: string,
  fieldLabel: string,
  fieldType: string,
  validation: FieldValidation
): ValidationError | null {
  const isEmpty = value === undefined || value === null || String(value).trim() === ""

  if (validation.required && isEmpty) {
    return { field: fieldName, label: fieldLabel, message: `${fieldLabel} on kohustuslik` }
  }

  if (isEmpty) return null

  if (fieldType === "NUMBER") {
    const num = parseFloat(String(value))
    if (isNaN(num)) {
      return { field: fieldName, label: fieldLabel, message: `${fieldLabel} peab olema arv` }
    }
    if (validation.integer && !Number.isInteger(num)) {
      return { field: fieldName, label: fieldLabel, message: `${fieldLabel} peab olema täisarv` }
    }
    if (validation.min != null && num < validation.min) {
      return { field: fieldName, label: fieldLabel, message: `${fieldLabel} peab olema vähemalt ${validation.min}` }
    }
    if (validation.max != null && num > validation.max) {
      return { field: fieldName, label: fieldLabel, message: `${fieldLabel} ei tohi olla rohkem kui ${validation.max}` }
    }
  }

  if (fieldType === "TIME") {
    const str = String(value).trim()
    if (!/^\d+:\d{1,2}(:\d{1,2})?$/.test(str)) {
      return { field: fieldName, label: fieldLabel, message: `${fieldLabel} peab olema formaadis h:mm:ss` }
    }
    if (validation.min != null || validation.max != null) {
      const parts = str.split(":")
      let seconds = 0
      if (parts.length === 3) seconds = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2])
      else if (parts.length === 2) seconds = parseInt(parts[0]) * 60 + parseInt(parts[1])
      if (validation.min != null && seconds < validation.min) {
        return { field: fieldName, label: fieldLabel, message: `${fieldLabel} on liiga väike (min ${validation.min}s)` }
      }
      if (validation.max != null && seconds > validation.max) {
        return { field: fieldName, label: fieldLabel, message: `${fieldLabel} on liiga suur (max ${validation.max}s)` }
      }
    }
  }

  return null
}
