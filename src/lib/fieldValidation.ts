export type FieldValidation = {
  required?: boolean
  min?: number | null
  max?: number | null
  integer?: boolean
}

export type ValidationError = { field: string; label: string; message: string }

export function parseValidation(raw?: string | null): FieldValidation {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
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
    const raw = String(value).trim()
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw)) {
      return { field: fieldName, label: fieldLabel, message: `${fieldLabel} peab olema arv` }
    }
    const num = Number(raw)
    if (!Number.isFinite(num)) return { field: fieldName, label: fieldLabel, message: `${fieldLabel} peab olema lõplik arv` }
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
      return { field: fieldName, label: fieldLabel, message: `${fieldLabel} peab olema formaadis m:ss või h:mm:ss` }
    }
    const parts = str.split(":").map(Number)
    const minutePart = parts.length === 3 ? parts[1] : null
    const secondPart = parts.at(-1) ?? 0
    if ((minutePart != null && minutePart > 59) || secondPart > 59) {
      return { field: fieldName, label: fieldLabel, message: `${fieldLabel} minutid ja sekundid peavad olema vahemikus 0–59` }
    }
    if (validation.min != null || validation.max != null) {
      let seconds = 0
      if (parts.length === 3) seconds = parts[0] * 3600 + parts[1] * 60 + parts[2]
      else if (parts.length === 2) seconds = parts[0] * 60 + parts[1]
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

export function validateClockValue(
  value: string | number | undefined | null,
  fieldName: string,
  fieldLabel: string,
  required: boolean
): ValidationError | null {
  const raw = value == null ? "" : String(value).trim()
  if (!raw) {
    return required
      ? { field: fieldName, label: fieldLabel, message: `${fieldLabel} on kohustuslik` }
      : null
  }
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(raw)) {
    return { field: fieldName, label: fieldLabel, message: `${fieldLabel} peab olema korrektne kellaaeg` }
  }
  return null
}
