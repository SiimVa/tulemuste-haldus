import { notFound } from "next/navigation"
import Link from "next/link"
import { requireCompetitionManager } from "@/lib/competitionPageAccess.server"
import { prisma } from "@/lib/prisma"
import { loadMapEditorData } from "@/lib/competitionMap.server"
import { MapEditor } from "@/components/dashboard/MapEditor"
import { TRACKED_ELEMENT_TYPES } from "@/lib/dashboard/types"

export const dynamic = "force-dynamic"

export default async function CompetitionMapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requireCompetitionManager(id)
  const [competition, data] = await Promise.all([
    prisma.competition.findUnique({ where: { id }, select: { name: true } }),
    loadMapEditorData(id),
  ])
  if (!competition) notFound()

  return (
    <div>
      <div className="mb-4 flex items-center gap-2 text-sm text-gray-400">
        <Link href={`/dashboard/competitions/${id}/overview`}>← Statistika</Link>
      </div>
      <h1 className="text-2xl font-bold text-gray-900">{competition.name} — Kaart</h1>
      <p className="mb-6 mt-1 max-w-3xl text-sm text-gray-500">
        Lae üles võistluse kaart ja märgi KP-d sellele või sisesta KP-de MGRS-koordinaadid. Kui kaardil on vähemalt kaks
        koordinaadiga KP-d, paigutatakse ülejäänud koordinaadiga KP-d automaatselt.
      </p>
      <MapEditor
        competitionId={id}
        initialImage={data.image ? { ...data.image, updatedAt: data.image.updatedAt.toISOString() } : null}
        initialElements={data.elements.filter((element) => !element.isCancelled && TRACKED_ELEMENT_TYPES.includes(element.type))}
        initialMarkers={data.markers}
      />
    </div>
  )
}
