"use client"

import { Button } from "@/components/ui/button"
import { cardClass } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { finalizeIssueKeys, finalizeIssueText, type ApplicationIssues } from "@/lib/registrationFinalize"

export type FinalizeCheck = { blocking: string[]; issues: ApplicationIssues[]; applicationCount: number }

// Osalejate nimekirja kinnitamise ülevaatus: kõik takistused ja e-posti
// kordused korraga. Korraldaja parandab või lükkab avaldused tagasi või
// kinnitab nii, et e-post jääb esimesele liikmele.
export function FinalizeReview({ check, busy, canEdit, onEditMembers, onReject, onConfirm, onCancel }: {
  check: FinalizeCheck
  busy: boolean
  canEdit: (applicationId: string) => boolean
  onEditMembers: (applicationId: string) => void
  onReject: (applicationId: string) => void
  onConfirm: (acceptedIssueKeys: string[]) => void
  onCancel: () => void
}) {
  const issueCount = check.issues.reduce((sum, application) => sum + application.issues.length, 0)
  return (
    <section aria-labelledby="finalize-review-title" className={cn(cardClass, "mb-6 border-2 border-primary-soft p-5")}>
      <h2 id="finalize-review-title" className="font-semibold text-ink">Osalejate nimekirja kinnitamine</h2>
      {check.blocking.length > 0 ? (
        <>
          <p className="mt-2 text-sm text-ink-soft">Kinnitada ei saa veel:</p>
          <ul role="alert" className="mt-2 list-disc space-y-1 pl-5 text-sm text-danger-hover">
            {check.blocking.map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
          <div className="mt-4"><Button type="button" variant="secondary" onClick={onCancel}>Sulge</Button></div>
        </>
      ) : check.issues.length === 0 ? (
        <>
          <p className="mt-2 text-sm text-ink-soft">
            Kõik {check.applicationCount} kinnitatud avaldust on korras. Kinnitamisel luuakse neist võistkonnad ja registreerimine lukustatakse.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" onClick={() => onConfirm([])} disabled={busy}>{busy ? "Kinnitan…" : "Kinnita osalejate nimekiri"}</Button>
            <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>Tühista</Button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-2 text-sm text-ink-soft">
            Leiti {issueCount} e-posti {issueCount === 1 ? "kordus" : "kordust"} {check.issues.length} avalduses. Liikme e-post seob ta
            kasutajakontoga, seega võib üks e-post olla võistlusel ainult ühel liikmel.
          </p>
          <ul className="mt-4 space-y-3">
            {check.issues.map((application) => (
              <li key={application.applicationId} className="rounded-lg border border-warning-soft bg-warning-soft/40 p-3" data-finalize-application={application.teamName}>
                <p className="font-medium text-ink">{application.teamName}</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ink-soft">
                  {application.issues.map((issue) => <li key={issue.key}>{finalizeIssueText(issue)}</li>)}
                </ul>
                <div className="mt-3 flex flex-wrap gap-2">
                  {canEdit(application.applicationId) && (
                    <Button type="button" size="sm" variant="secondary" onClick={() => onEditMembers(application.applicationId)} disabled={busy}>Muuda osalejaid</Button>
                  )}
                  <Button type="button" size="sm" variant="secondary" className="text-danger" onClick={() => onReject(application.applicationId)} disabled={busy}>Lükka avaldus tagasi</Button>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-ink-muted">
            Kui kinnitad nii, jääb iga e-post esimesele liikmele. Teisi liikmeid kasutajakontoga ei seota; nende e-post jääb avalduse andmetesse.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" onClick={() => onConfirm(finalizeIssueKeys(check.issues))} disabled={busy}>{busy ? "Kinnitan…" : "Kinnita nii"}</Button>
            <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>Tühista</Button>
          </div>
        </>
      )}
    </section>
  )
}
