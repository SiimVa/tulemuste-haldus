import "server-only"
import { prisma } from "@/lib/prisma"
import { parseDeliveryEvent } from "./messageDelivery"

export async function recordMessageDelivery(value: unknown) {
  const event = parseDeliveryEvent(value)
  if (!event) return
  // Tags associate events arriving before the sending response is persisted.
  // Require both the stored recipient and its email; never match by address alone.
  const recipient = await prisma.competitionMessageRecipient.findFirst({
    where: { email: event.email, OR: [
      { resendId: event.resendId },
      ...(event.recipientId ? [{ id: event.recipientId, resendId: null, status: { in: ["SENDING", "SENT", "FAILED"] } }] : []),
    ] }, select: { id: true },
  })
  if (!recipient) return // Other Resend messages and deleted personal data are ignored.
  // Independent first-event timestamps make duplicates and out-of-order events safe.
  await prisma.$transaction([
    prisma.competitionMessageRecipient.updateMany({ where: { id: recipient.id, resendId: null }, data: { resendId: event.resendId } }),
    prisma.competitionMessageRecipient.updateMany({
      where: { id: recipient.id, OR: [{ [event.field]: null }, { [event.field]: { gt: event.at } }] },
      data: { [event.field]: event.at },
    }),
  ])
}
