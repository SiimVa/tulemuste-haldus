import { Card } from "@/components/ui/card"
import type { MessageHistoryItem } from "@/lib/competitionMessages.server"

const STATUS_LABELS: Record<string, string> = { PENDING: "Ootel", SENDING: "Saatmisel", SENT: "Saadetud", FAILED: "Ebaõnnestus" }

function formatTime(date: Date) {
  return date.toLocaleString("et-EE", { timeZone: "Europe/Tallinn", dateStyle: "medium", timeStyle: "short" })
}

// Saadetud kirjad koos saajate ja saatmise olekuga.
export function MessageHistory({ items }: { items: MessageHistoryItem[] }) {
  return (
    <Card className="p-4 sm:p-5">
      <h2 className="font-semibold text-ink">Saadetud kirjad</h2>
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
                    {item.counts.pending > 0 && ` · ootel ${item.counts.pending}`}
                    {item.counts.failed > 0 && <span className="text-danger"> · ebaõnnestus {item.counts.failed}</span>}
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
                          <span className={`text-xs ${recipient.status === "FAILED" ? "text-danger" : "text-ink-muted"}`}>{STATUS_LABELS[recipient.status] ?? recipient.status}</span>
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
