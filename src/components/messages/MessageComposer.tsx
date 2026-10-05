"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input, Textarea } from "@/components/ui/input"
import {
  DEFAULT_MESSAGE_GROUPS,
  MESSAGE_BODY_MAX,
  MESSAGE_GROUPS,
  MESSAGE_GROUP_LABELS,
  MESSAGE_ROLES,
  MESSAGE_ROLE_LABELS,
  MESSAGE_SUBJECT_MAX,
  NO_CLASS,
  matchesMessageFilters,
  selectMessageRecipients,
  type MessageContact,
} from "@/lib/competitionMessages"

const chip = (active: boolean) => `flex min-h-9 cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-sm ${active ? "border-primary bg-primary-soft text-primary-hover" : "border-line bg-surface text-ink hover:bg-canvas"}`

function toggle(list: string[], value: string) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

// Kirja koostamine: saajate valik filtritega, eelvaade, proovikiri ja saatmine.
export function MessageComposer({ competitionId, contacts, senderEmail }: { competitionId: string; contacts: MessageContact[]; senderEmail: string }) {
  const router = useRouter()
  const groupsPresent = MESSAGE_GROUPS.filter((group) => contacts.some((contact) => contact.group === group))
  const classes = [...new Set(contacts.map((contact) => contact.className ?? NO_CLASS))].sort((a, b) => a.localeCompare(b, "et"))
  const [groups, setGroups] = useState<string[]>(DEFAULT_MESSAGE_GROUPS.filter((group) => groupsPresent.includes(group)))
  const [roles, setRoles] = useState<string[]>([...MESSAGE_ROLES])
  const [classFilter, setClassFilter] = useState<string[] | null>(null)
  const [excluded, setExcluded] = useState<string[]>([])
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [busy, setBusy] = useState<"test" | "send" | null>(null)
  const [result, setResult] = useState<{ tone: "ok" | "error"; text: string } | null>(null)

  const filters = { groups, roles, classes: classFilter }
  const { recipients, invalid } = useMemo(() => selectMessageRecipients(contacts, { groups, roles, classes: classFilter }), [contacts, groups, roles, classFilter])
  const selected = recipients.filter((recipient) => !excluded.includes(recipient.email))
  const selectedEmails = new Set(selected.map((recipient) => recipient.email))
  const teamCount = new Set(contacts.filter((contact) => matchesMessageFilters(contact, filters) && selectedEmails.has(contact.email)).map((contact) => contact.teamKey)).size
  const registrationCount = (group: string) => new Set(contacts.filter((contact) => contact.group === group).map((contact) => contact.teamKey)).size
  const ready = subject.trim() !== "" && body.trim() !== ""

  async function send(test: boolean) {
    if (!test && !window.confirm(`Saada kiri „${subject.trim()}” ${selected.length} saajale?`)) return
    setBusy(test ? "test" : "send")
    setResult(null)
    const response = await fetch(`/api/competitions/${competitionId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, body, filters, emails: selected.map((recipient) => recipient.email), test }),
    })
    const data = await response.json().catch(() => ({}))
    setBusy(null)
    if (!response.ok) {
      setResult({ tone: "error", text: data.error ?? "Saatmine ebaõnnestus" })
      return
    }
    if (test) {
      setResult({ tone: "ok", text: `Proovikiri saadeti aadressile ${data.to}.` })
      return
    }
    const pending = data.recipientCount - data.sent
    setResult({
      tone: "ok",
      text: data.configurationMissing
        ? `Kiri salvestati ${data.recipientCount} saajale, kuid e-posti saatmine ei ole seadistatud.`
        : pending > 0
          ? `Saadetud ${data.sent}/${data.recipientCount}. Ülejäänud saadetakse mõne minuti jooksul.`
          : `Kiri saadeti ${data.recipientCount} saajale.`,
    })
    setSubject("")
    setBody("")
    setExcluded([])
    router.refresh()
  }

  return (
    <div className="space-y-5">
      <Card className="space-y-4 p-4 sm:p-5">
        <h2 className="font-semibold text-ink">Saajad</h2>
        {contacts.length === 0 ? <p className="text-sm text-ink-muted">Registreerunud võistkondadel pole veel e-posti aadresse.</p> : (
          <>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-ink">Registreeringud</legend>
              <div className="flex flex-wrap gap-2">
                {groupsPresent.map((group) => (
                  <label key={group} className={chip(groups.includes(group))}>
                    <input type="checkbox" checked={groups.includes(group)} onChange={() => setGroups(toggle(groups, group))} className="h-4 w-4" />
                    {MESSAGE_GROUP_LABELS[group]} ({registrationCount(group)})
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-ink">Kellele</legend>
              <div className="flex flex-wrap gap-2">
                {MESSAGE_ROLES.map((role) => (
                  <label key={role} className={chip(roles.includes(role))}>
                    <input type="checkbox" checked={roles.includes(role)} onChange={() => setRoles(toggle(roles, role))} className="h-4 w-4" />
                    {MESSAGE_ROLE_LABELS[role]}
                  </label>
                ))}
              </div>
            </fieldset>
            {classes.length > 1 && (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-ink">Klassid</legend>
                <div className="flex flex-wrap gap-2">
                  <label className={chip(classFilter === null)}>
                    <input type="checkbox" checked={classFilter === null} onChange={() => setClassFilter(classFilter === null ? [] : null)} className="h-4 w-4" />
                    Kõik klassid
                  </label>
                  {classFilter !== null && classes.map((className) => (
                    <label key={className || "none"} className={chip(classFilter.includes(className))}>
                      <input type="checkbox" checked={classFilter.includes(className)} onChange={() => setClassFilter(toggle(classFilter, className))} className="h-4 w-4" />
                      {className || "Klassita"}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <p role="status" className="text-sm text-ink">
              <strong>{selected.length} saajat</strong> · {teamCount} võistkonda
              {invalid.length > 0 && <span className="text-amber-800"> · {invalid.length} vigast aadressi jääb välja ({invalid.join(", ")})</span>}
            </p>
            {recipients.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer text-primary">Vaata saajaid ({recipients.length})</summary>
                <ul className="mt-2 max-h-72 divide-y divide-line overflow-y-auto rounded-control border border-line">
                  {recipients.map((recipient) => (
                    <li key={recipient.email}>
                      <label className="flex cursor-pointer items-start gap-3 px-3 py-2 hover:bg-canvas">
                        <input type="checkbox" checked={!excluded.includes(recipient.email)} onChange={() => setExcluded(toggle(excluded, recipient.email))} className="mt-0.5 h-4 w-4" aria-label={recipient.email} />
                        <span className="min-w-0">
                          <span className="block break-all text-ink">{recipient.email}{recipient.name && <span className="text-ink-muted"> · {recipient.name}</span>}</span>
                          <span className="block text-xs text-ink-muted">{recipient.contexts.join(", ")}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </Card>

      <Card className="space-y-4 p-4 sm:p-5">
        <h2 className="font-semibold text-ink">Kiri</h2>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-ink">Teema</span>
          <Input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={MESSAGE_SUBJECT_MAX} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-ink">Sisu</span>
          <Textarea value={body} onChange={(event) => setBody(event.target.value)} rows={12} maxLength={MESSAGE_BODY_MAX} />
          <span className="mt-1 block text-xs text-ink-muted">Tühi rida alustab uut lõiku, lingid muutuvad klikitavaks. {body.length}/{MESSAGE_BODY_MAX}</span>
        </label>
        <p className="text-sm text-ink-muted">
          Iga saaja saab eraldi kirja ega näe teisi saajaid. Kirja lõppu lisatakse, miks saaja kirja sai (võistkond ja roll).
          {senderEmail && <> Vastused tulevad aadressile <strong className="text-ink">{senderEmail}</strong>.</>}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" onClick={() => send(true)} disabled={!ready || busy !== null}>
            {busy === "test" ? "Saadan…" : "Saada proovikiri mulle"}
          </Button>
          <Button type="button" onClick={() => send(false)} disabled={!ready || selected.length === 0 || busy !== null}>
            {busy === "send" ? "Saadan…" : `Saada ${selected.length} saajale`}
          </Button>
        </div>
        {result && <p role={result.tone === "error" ? "alert" : "status"} className={`text-sm ${result.tone === "error" ? "text-danger" : "text-green-700"}`}>{result.text}</p>}
      </Card>
    </div>
  )
}
