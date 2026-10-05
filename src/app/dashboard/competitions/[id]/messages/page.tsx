import Link from "next/link"
import { notFound } from "next/navigation"
import { CompetitionNav } from "@/components/competition/CompetitionNav"
import { requireCompetitionManager } from "@/lib/competitionPageAccess.server"
import { prisma } from "@/lib/prisma"
import { resendConfig } from "@/lib/email.server"
import { loadMessageContacts, loadMessageHistory } from "@/lib/competitionMessages.server"
import { MessageComposer } from "@/components/messages/MessageComposer"
import { MessageHistory } from "@/components/messages/MessageHistory"

export const dynamic = "force-dynamic"

export default async function CompetitionMessagesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await requireCompetitionManager(id)
  const [competition, sender, contacts, history] = await Promise.all([
    prisma.competition.findUnique({ where: { id }, select: { name: true, personalDataPurgedAt: true } }),
    prisma.user.findUnique({ where: { id: session.user.id }, select: { email: true } }),
    loadMessageContacts(id),
    loadMessageHistory(id),
  ])
  if (!competition) notFound()

  return (
    <div className="min-w-0 space-y-6">
      <Link href={`/dashboard/competitions/${id}`} className="text-sm text-ink-muted">← {competition.name}</Link>
      <header>
        <h1 className="text-2xl font-bold">Kirjad võistkondadele</h1>
        <p className="mt-2 text-ink-muted">
          Saada teade registreerunud võistkondade esindajatele ja liikmetele, kes on lisanud e-posti aadressi.
        </p>
      </header>
      <CompetitionNav competitionId={id} />
      <div className="max-w-4xl space-y-6">
        {!resendConfig() && (
          <p role="status" className="rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            E-posti saatmine ei ole serveris seadistatud. Kirjad salvestatakse ja saadetakse, kui seadistus on olemas.
          </p>
        )}
        {competition.personalDataPurgedAt ? (
          <p className="rounded-card border border-line bg-canvas px-4 py-3 text-sm text-ink-muted">
            Võistluse isikuandmed on kustutatud, seega kirju saata ei saa.
          </p>
        ) : (
          <MessageComposer competitionId={id} contacts={contacts} senderEmail={sender?.email ?? ""} />
        )}
        <MessageHistory items={history} />
      </div>
    </div>
  )
}
