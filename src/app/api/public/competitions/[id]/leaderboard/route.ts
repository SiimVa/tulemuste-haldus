import { createHash } from "node:crypto"
import { getPublicLeaderboard } from "@/lib/publicLeaderboard.server"

export const dynamic = "force-dynamic"

// Like the public page, this is an anonymous, read-only view. Its shared snapshot
// must never depend on the visitor's session or expose organizer-only fields.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const snapshot = await getPublicLeaderboard(id)
    if (!snapshot) return Response.json({ error: "Ei leitud" }, { status: 404, headers: { "Cache-Control": "no-store" } })
    const body = JSON.stringify(snapshot)
    const etag = `"${createHash("sha256").update(body).digest("hex")}"`
    const headers = { "Cache-Control": "no-store", ETag: etag, "Content-Type": "application/json; charset=utf-8" }
    if (request.headers.get("if-none-match")?.split(",").some(value => value.trim().replace(/^W\//, "") === etag || value.trim() === "*")) {
      return new Response(null, { status: 304, headers })
    }
    return new Response(body, { headers })
  } catch {
    console.error("Public leaderboard snapshot unavailable")
    return Response.json({ error: "Pingerida pole ajutiselt saadaval. Proovi hiljem uuesti." }, {
      status: 503, headers: { "Cache-Control": "no-store" },
    })
  }
}
