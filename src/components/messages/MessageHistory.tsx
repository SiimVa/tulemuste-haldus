import { Card } from "@/components/ui/card"
import type { MessageHistoryItem } from "@/lib/competitionMessages.server"
import { messageDeliveryLabel } from "@/lib/messageDelivery"
import { AutoRefresh } from "@/components/AutoRefresh"

function formatTime(date: Date) {
  return date.toLocaleString("et-EE", { timeZone: "Europe/Tallinn", dateStyle: "medium", timeStyle: "short" })
}

// Saadetud kirjad koos saajate ja saatmise olekuga.
export function MessageHistory({ items }: { items: MessageHistoryItem[] }) {
  return (
    <Card className="p-4 sm:p-5">
      <h2 className="font-semibold text-ink">Saadetud kirjad</h2>
      {items.length > 0 && <>
        <p className="mt-2 text-xs text-ink-muted">Kohale toimetatud tähendab, et saaja meiliserver võttis kirja vastu; kiri võib olla ka rämpspostis. Avamine on Resendi registreeritud signaal, mitte lugemiskinnitus. Avamismärke puudumine ei tähenda, et kiri on lugemata.</p>
        <div className="mt-2"><AutoRefresh intervalSeconds={30} /></div>
      </>}
      {items.length === 0 ? <p className="mt-2 text-sm text-ink-muted">Kirju pole veel saadetud.</p> : (
        <ul className="mt-3 divide-y divide-line">
          {items.map((item) => (
            <li key={item.id} data-message={item.subject}>
              <details className="py-3">
                <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="min-w-0">
                    <span className="font-medium text-ink">{item.subject}</span>
                    <span className="block text-xs text-ink-muted">{formatTime(item.createdAt)}{item.senderName ? ` · ${item.senderName}` : ""}</span>
                  </span>
                  <span className="text-sm text-ink-muted" data-message-status>
                    Saadetud {item.counts.sent}/{item.recipientCount}
                    {` · kohale ${item.counts.delivered} · avatud ${item.counts.opened}`}
                    {item.counts.pending > 0 && ` · ootel ${item.counts.pending}`}
                    {item.counts.failed > 0 && <span className="text-danger"> · ebaõnnestus {item.counts.failed}</span>}
                    {item.counts.bounced > 0 && <span className="text-danger"> · kohaletoimetamata {item.counts.bounced}</span>}
                  </span>
                </summary>
                <div className="mt-3 space-y-3 text-sm">
                  <p className="whitespace-pre-wrap rounded-control bg-canvas p-3 text-ink">{item.body}</p>
                  {item.replyTo && <p className="text-ink-muted">Vastused: {item.replyTo}</p>}
                  {item.recipients.length === 0 ? (
                    <p className="text-ink-muted">Saajate aadressid on kustutatud koos võistluse isikuandmetega.</p>
                  ) : (
                    <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-control border border-line">
                      {item.recipients.map((recipient) => (
                        <li key={recipient.email} className="flex flex-wrap justify-between gap-2 px-3 py-1.5">
                          <span className="min-w-0 break-all">{recipient.email}<span className="block text-xs text-ink-muted">{recipient.context}</span></span>
                          <span className={`text-xs ${recipient.status === "FAILED" || recipient.bouncedAt || recipient.complainedAt || recipient.deliveryFailedAt ? "text-danger" : recipient.openedAt ? "text-emerald-700" : "text-ink-muted"}`}>
                            <span className="block font-medium">{messageDeliveryLabel(recipient)}</span>
                            {recipient.deliveredAt && <span className="block">Kohale: {formatTime(recipient.deliveredAt)}</span>}
                            {recipient.openedAt && <span className="block">Avatud: {formatTime(recipient.openedAt)}</span>}
                            {recipient.status === "SENT" && !recipient.openedAt && <span className="block">{recipient.tracked ? "Avamist pole registreeritud" : "Selle vana kirja jälgimisandmed puuduvad"}</span>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {item.failures.length > 0 && (
                    <p className="text-xs text-danger">Viimane viga: {item.failures[0].error ?? "teadmata"}. Ebaõnnestunud kirju proovitakse automaatselt uuesti.</p>
                  )}
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
