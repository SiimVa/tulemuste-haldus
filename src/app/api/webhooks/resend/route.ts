import { Webhook } from "svix"
import { recordMessageDelivery } from "@/lib/messageDelivery.server"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) return Response.json({ error: "Webhook pole seadistatud" }, { status: 503 })
  if (Number(request.headers.get("content-length")) > 100_000) return new Response(null, { status: 413 })
  const payload = await request.text()
  if (Buffer.byteLength(payload) > 100_000) return new Response(null, { status: 413 })
  let event: unknown
  try {
    new Webhook(secret).verify(payload, {
      "svix-id": request.headers.get("svix-id") ?? "",
      "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
      "svix-signature": request.headers.get("svix-signature") ?? "",
    })
    event = JSON.parse(payload)
  } catch {
    return Response.json({ error: "Vigane allkiri" }, { status: 400 })
  }
  // Database failures return 500, so Resend retries instead of losing an event.
  await recordMessageDelivery(event)
  return Response.json({ received: true })
}
