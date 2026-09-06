import {
  PublicAnalysisPage,
  analysisPageMetadata,
} from "@/components/public/PublicAnalysisPage"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return analysisPageMetadata({ type: "LINK_ONLY", analysisLinkToken: token })
}

export default async function LinkOnlyAnalysisPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return (
    <PublicAnalysisPage access={{ type: "LINK_ONLY", analysisLinkToken: token }} />
  )
}
