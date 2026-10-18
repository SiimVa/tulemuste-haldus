export const DELIVERY_EVENTS = {
  "email.delivered": "deliveredAt",
  "email.opened": "openedAt",
  "email.bounced": "bouncedAt",
  "email.complained": "complainedAt",
  "email.delivery_delayed": "deliveryDelayedAt",
  "email.failed": "deliveryFailedAt",
  "email.suppressed": "deliveryFailedAt",
} as const
export type DeliveryField = typeof DELIVERY_EVENTS[keyof typeof DELIVERY_EVENTS]
export type DeliveryDates = Record<DeliveryField, Date | null>

export function parseDeliveryEvent(value: unknown) {
  if (!value || typeof value !== "object") return null
  const event = value as Record<string, unknown>
  if (typeof event.type !== "string" || !Object.prototype.hasOwnProperty.call(DELIVERY_EVENTS, event.type)) return null
  const data = event.data as Record<string, unknown> | undefined
  if (!data || typeof data.email_id !== "string" || !data.email_id || !Array.isArray(data.to) || data.to.length !== 1 || typeof data.to[0] !== "string") return null
  const at = typeof event.created_at === "string" ? new Date(event.created_at) : new Date(NaN)
  if (!Number.isFinite(at.getTime())) return null
  const tags = data.tags as Record<string, unknown> | undefined
  return {
    field: DELIVERY_EVENTS[event.type as keyof typeof DELIVERY_EVENTS], at,
    resendId: data.email_id, email: data.to[0].trim().toLowerCase(),
    recipientId: typeof tags?.portal_recipient_id === "string" ? tags.portal_recipient_id : null,
  }
}

export function messageDeliveryLabel(row: DeliveryDates & { status: string }): string {
  if (row.complainedAt) return "Märgitud rämpspostiks"
  if (row.bouncedAt) return "Tagasi põrganud"
  if (row.deliveryFailedAt) return "Kohaletoimetamine ebaõnnestus"
  if (row.openedAt) return "Avatud"
  if (row.deliveredAt) return "Kohale toimetatud"
  if (row.deliveryDelayedAt) return "Kohaletoimetamine viibib"
  return ({ PENDING: "Ootel", SENDING: "Saatmisel", SENT: "Saadetud", FAILED: "Saatmine ebaõnnestus" } as Record<string, string>)[row.status] ?? row.status
}
