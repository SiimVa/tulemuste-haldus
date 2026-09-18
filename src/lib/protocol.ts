export function protocolFieldHeading(field: {
  name: string
  label: string
}): string {
  return field.label.trim() || field.name
}

export const MAX_EMPTY_PROTOCOL_ROWS = 100

export function normalizeEmptyProtocolRowCount(value: number): number {
  if (Number.isNaN(value)) return 0
  return Math.min(MAX_EMPTY_PROTOCOL_ROWS, Math.max(0, Math.floor(value)))
}
