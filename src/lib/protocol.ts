export function protocolFieldHeading(field: {
  name: string
  label: string
}): string {
  return field.label.trim() || field.name
}
