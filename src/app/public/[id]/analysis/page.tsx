import {
  PublicAnalysisPage,
  analysisPageMetadata,
} from "@/components/public/PublicAnalysisPage"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return analysisPageMetadata({ type: "PUBLIC", competitionId: id })
}

export default async function PublicCompetitionAnalysisPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <PublicAnalysisPage access={{ type: "PUBLIC", competitionId: id }} />
}
