import "server-only"

import { prisma } from "@/lib/prisma"

export async function mapImageResponse(competitionId: string, cacheControl: string): Promise<Response> {
  const map = await prisma.competitionMap.findUnique({
    where: { competitionId },
    select: { image: true, imageType: true },
  })
  if (!map?.image || !map.imageType) {
    return Response.json({ error: "Kaarti pole" }, { status: 404, headers: { "Cache-Control": "no-store" } })
  }
  return new Response(new Uint8Array(map.image), {
    headers: {
      "Content-Type": map.imageType,
      "Content-Length": String(map.image.length),
      "Content-Disposition": "inline",
      "Cache-Control": cacheControl,
    },
  })
}
