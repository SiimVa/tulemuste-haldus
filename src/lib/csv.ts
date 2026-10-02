// User-entered text must not become a spreadsheet formula when opening CSV.
// Plain numbers such as "-1.50" stay numeric.
export function csvCell(value: unknown): string {
  const text = String(value ?? "")
  const formula = /^[\s﻿]*[=+\-@]/.test(text) && !/^-?\d+(?:[.,]\d+)?$/.test(text)
  return `"${(formula ? `'${text}` : text).replace(/"/g, '""')}"`
}

export function csvRow(values: readonly unknown[]): string {
  return values.map((value) => csvCell(value)).join(",")
}
