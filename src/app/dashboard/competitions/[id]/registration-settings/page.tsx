"use client"

import Link from "next/link"
import { use, useEffect, useState } from "react"
import { AllocationRuleBuilder } from "@/components/registration/AllocationRuleBuilder"
import { FormBuilder } from "@/components/registration/FormBuilder"
import type { ApprovalMode } from "@/lib/approvalModes"
import type { RegistrationAccessMode } from "@/lib/registrationAccess"
import type {
  AllocationRuleDefinition,
  ClassBalanceMode,
} from "@/lib/registrationAllocation"
import type { FormFieldDefinition } from "@/lib/registrationForm"
import type { TeamMemberRoleDefinition } from "@/lib/teamComposition"
import { cardClass } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { Input, Select } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

type PhaseOverride = "AUTO" | "OPEN" | "CLOSED"
type PhaseStatus = "NOT_OPEN" | "OPEN" | "CLOSED" | "FINALIZED"
type CompetitionClass = { id?: string; name: string; order: number }

type Settings = {
  name: string
  endDate: string | null
  registrationAccessMode: RegistrationAccessMode
  hasRegistrationLink: boolean
  registrationLinkToken: string | null
  registrationOpensAt: string
  registrationClosesAt: string
  registrationOverride: PhaseOverride
  registrationFinalizedAt: string | null
  registrationCapacity: number | ""
  registrationClassBalanceMode: ClassBalanceMode
  registrationApprovalMode: ApprovalMode
  registrationStatus: PhaseStatus
  mandateOpensAt: string
  mandateClosesAt: string
  mandateOverride: PhaseOverride
  mandateFinalizedAt: string | null
  mandateApprovalMode: ApprovalMode
  mandateStatus: PhaseStatus
  personalDataRetentionDays: number
  personalDataPurgedAt: string | null
  personalDataPurgeDueAt: string | null
  personalDataPurgeDue: boolean
  representativeRequired: boolean
  captainRequired: boolean
  teamMemberRoles: TeamMemberRoleDefinition[]
  registrationClasses: CompetitionClass[]
  registrationFormFields: FormFieldDefinition[]
  registrationAllocationRules: AllocationRuleDefinition[]
}

const STATUS_LABEL: Record<PhaseStatus, string> = {
  NOT_OPEN: "Pole veel avatud",
  OPEN: "Avatud",
  CLOSED: "Suletud",
  FINALIZED: "Kinnitatud ja lukustatud",
}

const STATUS_COLOR: Record<PhaseStatus, string> = {
  NOT_OPEN: "bg-gray-100 text-gray-700",
  OPEN: "bg-green-100 text-green-700",
  CLOSED: "bg-amber-100 text-amber-800",
  FINALIZED: "bg-blue-100 text-blue-700",
}

function toLocalInput(value: string | null | undefined): string {
  if (!value) return ""
  const date = new Date(value)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function toIso(value: string): string | null {
  return value ? new Date(value).toISOString() : null
}

function phaseCard(
  title: string,
  prefix: "registration" | "mandate",
  form: Settings,
  setForm: React.Dispatch<React.SetStateAction<Settings | null>>
) {
  const status = form[`${prefix}Status`] as PhaseStatus
  const finalized = form[`${prefix}FinalizedAt`] as string | null
  const override = form[`${prefix}Override`] as PhaseOverride
  const opensAt = form[`${prefix}OpensAt`] as string
  const closesAt = form[`${prefix}ClosesAt`] as string
  const approvalMode = form[`${prefix}ApprovalMode`] as ApprovalMode

  function update(key: string, value: string) {
    setForm((current) => current ? { ...current, [key]: value } : current)
  }

  return (
    <section className={cn(cardClass, "p-5 space-y-4")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <p className="text-xs text-gray-500 mt-1">
            Käsitsi valik on automaatsest ajakavast tähtsam.
          </p>
        </div>
        <span className={`text-xs px-3 py-1 rounded-full ${STATUS_COLOR[status]}`}>
          {STATUS_LABEL[status]}
        </span>
      </div>

      <div>
        <label className="text-xs text-gray-500 mb-1 block">Juhtimine</label>
        <Select
          value={override}
          disabled={Boolean(finalized)}
          onChange={(event) =>
            update(`${prefix}Override`, event.target.value)
          }
          className="disabled:bg-gray-100"
        >
          <option value="AUTO">Automaatne ajakava</option>
          <option value="OPEN">Käsitsi avatud</option>
          <option value="CLOSED">Käsitsi suletud</option>
        </Select>
      </div>

      <div>
        <label className="text-xs text-gray-500 mb-1 block">
          Kinnitamine
        </label>
        <Select
          aria-label={`${title} kinnitamine`}
          value={approvalMode}
          onChange={(event) =>
            update(`${prefix}ApprovalMode`, event.target.value)
          }
        >
          <option value="AUTOMATIC">Automaatne kinnitamine</option>
          <option value="MANUAL">Käsitsi kinnitamine</option>
        </Select>
        <p className="text-xs text-gray-500 mt-1">
          {prefix === "registration"
            ? approvalMode === "AUTOMATIC"
              ? "Nõuetele vastav avaldus saab koha või ootenimekirja positsiooni automaatselt."
              : "Iga avaldus ootab korraldaja kinnitamist või ootenimekirja määramist."
            : approvalMode === "AUTOMATIC"
              ? "Nõuetele vastav mandaat kinnitatakse kohe esitamisel."
              : "Esitatud mandaat jääb korraldaja kinnitamist ootama."}
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">
            Automaatne avamine
          </label>
          <Input
            type="datetime-local"
            value={opensAt}
            disabled={Boolean(finalized)}
            onChange={(event) =>
              update(`${prefix}OpensAt`, event.target.value)
            }
            className="disabled:bg-gray-100"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">
            Automaatne sulgemine
          </label>
          <Input
            type="datetime-local"
            value={closesAt}
            disabled={Boolean(finalized)}
            onChange={(event) =>
              update(`${prefix}ClosesAt`, event.target.value)
            }
            className="disabled:bg-gray-100"
          />
        </div>
      </div>

      {prefix === "mandate" && !form.registrationFinalizedAt && (
        <p className="text-xs rounded-lg bg-amber-50 text-amber-800 px-3 py-2">
          Mandaat avaneb alles pärast registreeritud osalejate nimekirja
          kinnitamist. Kui avamisaeg saabub varem, jääb mandaat ootele.
        </p>
      )}
    </section>
  )
}

export default function RegistrationSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: competitionId } = use(params)
  const [form, setForm] = useState<Settings | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [purging, setPurging] = useState(false)
  const [rotatingLink, setRotatingLink] = useState(false)
  const [origin, setOrigin] = useState("")
  const [linkCopied, setLinkCopied] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    setOrigin(window.location.origin)
    fetch(`/api/competitions/${competitionId}/registration-settings`)
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error ?? "Laadimine ebaõnnestus")
        setForm({
          ...data,
          registrationAccessMode:
            data.registrationAccessMode ??
            (data.isPublic ? "PUBLIC" : "PRIVATE"),
          hasRegistrationLink: Boolean(data.hasRegistrationLink),
          registrationLinkToken: data.registrationLinkToken ?? null,
          registrationOpensAt: toLocalInput(data.registrationOpensAt),
          registrationClosesAt: toLocalInput(data.registrationClosesAt),
          mandateOpensAt: toLocalInput(data.mandateOpensAt),
          mandateClosesAt: toLocalInput(data.mandateClosesAt),
          registrationCapacity: data.registrationCapacity ?? "",
          registrationClassBalanceMode:
            data.registrationClassBalanceMode ?? "OFF",
          registrationApprovalMode:
            data.registrationApprovalMode ?? "AUTOMATIC",
          registrationAllocationRules:
            data.registrationAllocationRules ?? [],
          representativeRequired: Boolean(data.representativeRequired),
          captainRequired: Boolean(data.captainRequired),
          teamMemberRoles: data.teamMemberRoles ?? [],
          mandateApprovalMode: data.mandateApprovalMode ?? "MANUAL",
          personalDataRetentionDays:
            data.personalDataRetentionDays ?? 90,
          personalDataPurgedAt: data.personalDataPurgedAt ?? null,
          personalDataPurgeDueAt: data.personalDataPurgeDueAt ?? null,
          personalDataPurgeDue: Boolean(data.personalDataPurgeDue),
        })
      })
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : "Laadimine ebaõnnestus")
      )
  }, [competitionId])

  function updateClass(index: number, name: string) {
    setForm((current) => {
      if (!current) return current
      const classes = [...current.registrationClasses]
      classes[index] = { ...classes[index], name }
      return { ...current, registrationClasses: classes }
    })
  }

  function addClass() {
    setForm((current) =>
      current
        ? {
            ...current,
            registrationClasses: [
              ...current.registrationClasses,
              {
                name: "",
                order: current.registrationClasses.length,
              },
            ],
          }
        : current
    )
  }

  function removeClass(index: number) {
    setForm((current) =>
      current
        ? {
            ...current,
            registrationClasses: current.registrationClasses.filter(
              (_, classIndex) => classIndex !== index
            ),
          }
        : current
    )
  }

  function addMemberRole() {
    setForm((current) =>
      current
        ? {
            ...current,
            teamMemberRoles: [
              ...current.teamMemberRoles,
              { name: "", required: false },
            ],
          }
        : current
    )
  }

  function updateMemberRole(
    index: number,
    patch: Partial<TeamMemberRoleDefinition>
  ) {
    setForm((current) => {
      if (!current) return current
      const teamMemberRoles = [...current.teamMemberRoles]
      teamMemberRoles[index] = { ...teamMemberRoles[index], ...patch }
      return { ...current, teamMemberRoles }
    })
  }

  function removeMemberRole(index: number) {
    setForm((current) =>
      current
        ? {
            ...current,
            teamMemberRoles: current.teamMemberRoles.filter(
              (_, roleIndex) => roleIndex !== index
            ),
          }
        : current
    )
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!form) return
    setSaving(true)
    setSaved(false)
    setError("")

    const response = await fetch(
      `/api/competitions/${competitionId}/registration-settings`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registrationAccessMode: form.registrationAccessMode,
          registrationOpensAt: toIso(form.registrationOpensAt),
          registrationClosesAt: toIso(form.registrationClosesAt),
          registrationOverride: form.registrationOverride,
          registrationCapacity:
            form.registrationCapacity === ""
              ? null
              : Number(form.registrationCapacity),
          registrationClassBalanceMode: form.registrationClassBalanceMode,
          registrationApprovalMode: form.registrationApprovalMode,
          mandateOpensAt: toIso(form.mandateOpensAt),
          mandateClosesAt: toIso(form.mandateClosesAt),
          mandateOverride: form.mandateOverride,
          mandateApprovalMode: form.mandateApprovalMode,
          personalDataRetentionDays: form.personalDataRetentionDays,
          representativeRequired: form.representativeRequired,
          captainRequired: form.captainRequired,
          teamMemberRoles: form.teamMemberRoles,
          classes: form.registrationClasses,
          formFields: form.registrationFormFields,
          allocationRules: form.registrationAllocationRules,
        }),
      }
    )
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      setError(data.error ?? "Salvestamine ebaõnnestus")
    } else {
      setForm({
        ...data,
        registrationAccessMode:
          data.registrationAccessMode ??
          (data.isPublic ? "PUBLIC" : "PRIVATE"),
        hasRegistrationLink: Boolean(data.hasRegistrationLink),
        registrationLinkToken:
          data.registrationAccessMode === "LINK_ONLY"
            ? data.registrationLinkToken ?? form.registrationLinkToken
            : null,
        registrationOpensAt: toLocalInput(data.registrationOpensAt),
        registrationClosesAt: toLocalInput(data.registrationClosesAt),
        mandateOpensAt: toLocalInput(data.mandateOpensAt),
        mandateClosesAt: toLocalInput(data.mandateClosesAt),
        registrationCapacity: data.registrationCapacity ?? "",
        registrationClassBalanceMode:
          data.registrationClassBalanceMode ?? "OFF",
        registrationApprovalMode:
          data.registrationApprovalMode ?? "AUTOMATIC",
        registrationAllocationRules:
          data.registrationAllocationRules ?? [],
        representativeRequired: Boolean(data.representativeRequired),
        captainRequired: Boolean(data.captainRequired),
        teamMemberRoles: data.teamMemberRoles ?? [],
        mandateApprovalMode: data.mandateApprovalMode ?? "MANUAL",
        personalDataRetentionDays: data.personalDataRetentionDays ?? 90,
        personalDataPurgedAt: data.personalDataPurgedAt ?? null,
        personalDataPurgeDueAt: data.personalDataPurgeDueAt ?? null,
        personalDataPurgeDue: Boolean(data.personalDataPurgeDue),
      })
      setSaved(true)
      setLinkCopied(false)
      window.setTimeout(() => setSaved(false), 2500)
    }
    setSaving(false)
  }

  async function rotateRegistrationLink() {
    if (!form || rotatingLink) return
    if (
      form.hasRegistrationLink &&
      !window.confirm(
        "Uue lingi loomisel lõpetab senine registreerimislink kohe töötamise. Kas jätkad?"
      )
    ) {
      return
    }
    setRotatingLink(true)
    setError("")
    setLinkCopied(false)
    const response = await fetch(
      `/api/competitions/${competitionId}/registration-link/rotate`,
      { method: "POST" }
    )
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      setError(data.error ?? "Uue registreerimislingi loomine ebaõnnestus")
    } else {
      setForm({
        ...form,
        hasRegistrationLink: true,
        registrationLinkToken: data.registrationLinkToken,
      })
    }
    setRotatingLink(false)
  }

  async function copyRegistrationLink(link: string) {
    try {
      await navigator.clipboard.writeText(link)
      setLinkCopied(true)
      window.setTimeout(() => setLinkCopied(false), 2500)
    } catch {
      setError("Lingi kopeerimine ebaõnnestus. Kopeeri link tekstiväljalt.")
    }
  }

  async function purgePersonalData() {
    if (!form || purging) return
    const confirmed = window.confirm(
      "Kontakt- ja sünniandmed eemaldatakse jäädavalt. Seda toimingut ei saa tagasi võtta. Kas jätkad?"
    )
    if (!confirmed) return
    setPurging(true)
    setError("")
    const response = await fetch(
      `/api/competitions/${competitionId}/personal-data/purge`,
      { method: "POST" }
    )
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      setError(data.error ?? "Isikuandmete kustutamine ebaõnnestus")
    } else {
      setForm({
        ...form,
        personalDataPurgedAt: data.purgedAt,
        personalDataPurgeDue: false,
      })
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2500)
    }
    setPurging(false)
  }

  if (!form && !error) {
    return <p className="text-sm text-gray-400 py-10">Laadin...</p>
  }

  return (
    <div className="max-w-3xl">
      <Link
        href={`/dashboard/competitions/${competitionId}`}
        className="text-sm text-gray-400 hover:text-gray-600"
      >
        ← Tagasi
      </Link>
      <div className="mt-4 mb-6">
        <h1 className="text-xl font-bold text-gray-900">
          Registreerimise ja mandaadi seaded
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Määra avalikkus, klassid, kohtade arv ja etappide ajakava.
        </p>
      </div>

      {error && (
        <p className="mb-4 px-4 py-3 rounded-lg bg-red-50 text-red-700 text-sm">
          {error}
        </p>
      )}

      {form && (
        <form onSubmit={save} className="space-y-6">
          <section className={cn(cardClass, "p-5 space-y-4")}>
            <div>
              <h2 className="font-semibold text-gray-900">
                Registreerimislehe ligipääs
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                Registreerimiseks peab kasutaja alati sisse logima. Lingiga
                võistlust avalikus nimekirjas ei kuvata.
              </p>
            </div>
            <label className="block text-xs text-gray-600">
              Ligipääsu viis
              <select
                aria-label="Registreerimise ligipääs"
                value={form.registrationAccessMode}
                onChange={(event) =>
                  setForm({
                    ...form,
                    registrationAccessMode: event.target
                      .value as RegistrationAccessMode,
                    registrationLinkToken:
                      event.target.value === "LINK_ONLY"
                        ? form.registrationLinkToken
                        : null,
                  })
                }
                className="mt-1 w-full px-3 py-2 border rounded-lg text-sm"
              >
                <option value="PUBLIC">
                  Avalik – nimekirjas ja registreeritav
                </option>
                <option value="LINK_ONLY">
                  Ainult lingiga – nimekirjas peidetud
                </option>
                <option value="PRIVATE">
                  Privaatne – väline registreerimine keelatud
                </option>
              </select>
            </label>

            {form.registrationAccessMode === "LINK_ONLY" && (
              <div className="rounded-lg border bg-gray-50 p-4 space-y-3">
                {form.registrationLinkToken && origin ? (
                  <>
                    <label className="block text-xs text-gray-600">
                      Registreerimislink
                      <Input
                        aria-label="Registreerimislink"
                        readOnly
                        value={`${origin}/register/${form.registrationLinkToken}`}
                        onFocus={(event) => event.currentTarget.select()}
                        className="mt-1 bg-white"
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" className="py-2 text-sm"
                        type="button"
                        onClick={() =>
                          copyRegistrationLink(
                            `${origin}/register/${form.registrationLinkToken}`
                          )
                        }
                      >
                        {linkCopied ? "Kopeeritud" : "Kopeeri link"}</Button>
                      <button
                        type="button"
                        onClick={rotateRegistrationLink}
                        disabled={rotatingLink}
                        className="px-3 py-2 border rounded-lg text-sm hover:bg-white disabled:opacity-50"
                      >
                        {rotatingLink ? "Loon..." : "Loo uus link"}
                      </button>
                    </div>
                  </>
                ) : form.hasRegistrationLink ? (
                  <>
                    <p className="text-xs text-gray-600">
                      Registreerimislink on aktiivne. Turvalisuse tõttu ei saa
                      varem loodud tunnust uuesti kuvada. Uue kopeeritava lingi
                      loomine muudab vana lingi kehtetuks.
                    </p>
                    <button
                      type="button"
                      onClick={rotateRegistrationLink}
                      disabled={rotatingLink}
                      className="px-3 py-2 border rounded-lg text-sm hover:bg-white disabled:opacity-50"
                    >
                      {rotatingLink ? "Loon..." : "Loo uus link"}
                    </button>
                  </>
                ) : (
                  <p className="text-xs text-gray-600">
                    Salvesta seaded. Seejärel luuakse kopeeritav turvaline
                    registreerimislink.
                  </p>
                )}
              </div>
            )}
          </section>

          <section className={cn(cardClass, "p-5 space-y-4")}>
            <div>
              <h2 className="font-semibold text-gray-900">Klassid</h2>
              <p className="text-xs text-gray-500 mt-1">
                Klassid on valikulised. Üks klass määratakse automaatselt;
                mitme klassi korral valib registreerija klassi rippmenüüst.
                Tühja nimekirja korral klassi ei küsita.
              </p>
            </div>
            <div className="space-y-2">
              {form.registrationClasses.map((item, index) => (
                <div key={item.id ?? `new-${index}`} className="flex gap-2">
                  <Input
                    type="text"
                    value={item.name}
                    onChange={(event) => updateClass(index, event.target.value)}
                    placeholder="nt Põhiklass"
                    className="flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => removeClass(index)}
                    className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg"
                  >
                    Eemalda
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addClass}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              + Lisa klass
            </button>

            <div className="pt-2">
              <label className="text-xs text-gray-500 mb-1 block">
                Võistkondade üldarvu piirang
              </label>
              <input
                type="number"
                min={1}
                step={1}
                value={form.registrationCapacity}
                onChange={(event) =>
                  setForm({
                    ...form,
                    registrationCapacity:
                      event.target.value === ""
                        ? ""
                        : Number(event.target.value),
                  })
                }
                placeholder="Piirang puudub"
                className="w-full sm:w-56 px-3 py-2 border rounded-lg text-sm"
              />
              <p className="text-xs text-gray-400 mt-1">
                Kui piirang täitub, lähevad järgmised avaldused ootenimekirja.
              </p>
            </div>
          </section>

          <FormBuilder
            fields={form.registrationFormFields}
            onChange={(registrationFormFields) =>
              setForm({ ...form, registrationFormFields })
            }
          />

          <section className={cn(cardClass, "p-5 space-y-4")}>
            <div>
              <h2 className="font-semibold text-gray-900">
                Isikuandmete säilitamine
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                Kontaktandmed ja sünniajad kustutatakse pärast võistluse
                lõppu. Võistkonna nimi, liikmete nimed, rollid ja tulemused
                säilivad võistluse ajaloos.
              </p>
            </div>
            <label className="text-xs text-gray-600 block">
              Säilitustähtaeg pärast võistluse lõppu (päeva)
              <input
                type="number"
                min={1}
                max={90}
                step={1}
                value={form.personalDataRetentionDays}
                disabled={Boolean(form.personalDataPurgedAt)}
                onChange={(event) =>
                  setForm({
                    ...form,
                    personalDataRetentionDays: Number(event.target.value),
                  })
                }
                className="mt-1 w-full sm:w-56 px-3 py-2 border rounded-lg text-sm disabled:bg-gray-100"
              />
              <span className="block text-xs text-gray-400 mt-1">
                Maksimaalne tähtaeg on 90 päeva. Tähtaega arvestatakse
                võistluse lõppkuupäevast.
              </span>
            </label>

            {!form.endDate && (
              <p className="text-xs rounded-lg bg-amber-50 text-amber-800 px-3 py-2">
                Automaatseks kustutamiseks määra esmalt võistluse seadetes
                lõppkuupäev.
              </p>
            )}
            {form.personalDataPurgedAt ? (
              <p className="text-xs rounded-lg bg-green-50 text-green-700 px-3 py-2">
                Isikuandmed kustutati {new Date(
                  form.personalDataPurgedAt
                ).toLocaleString("et-EE")}.
              </p>
            ) : form.personalDataPurgeDueAt ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-3">
                <p className="text-xs text-gray-600">
                  Kustutamise tähtaeg: {new Date(
                    form.personalDataPurgeDueAt
                  ).toLocaleString("et-EE")}
                </p>
                {form.personalDataPurgeDue && (
                  <button
                    type="button"
                    onClick={purgePersonalData}
                    disabled={purging}
                    className="px-3 py-2 text-xs font-medium text-red-700 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50"
                  >
                    {purging
                      ? "Kustutan..."
                      : "Kustuta aegunud isikuandmed"}
                  </button>
                )}
              </div>
            ) : null}
          </section>

          <section className={cn(cardClass, "p-5 space-y-4")}>
            <div>
              <h2 className="font-semibold text-gray-900">
                Koosseisu nõuded
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                Neid nõudeid kontrollitakse mandaadi esitamisel. Mustandit
                saab salvestada ka poolelioleva koosseisuga.
              </p>
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.representativeRequired}
                onChange={(event) =>
                  setForm({
                    ...form,
                    representativeRequired: event.target.checked,
                  })
                }
                className="mt-1 accent-blue-600"
              />
              <span>
                <span className="block text-sm text-gray-700">
                  Esindaja on kohustuslik
                </span>
                <span className="block text-xs text-gray-500 mt-0.5">
                  Esindaja nimi, e-post ja telefon lisatakse vormi
                  automaatselt. Esindaja võib olla ka ühe esindatava
                  võistkonna liige.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.captainRequired}
                onChange={(event) =>
                  setForm({ ...form, captainRequired: event.target.checked })
                }
                className="mt-1 accent-blue-600"
              />
              <span className="text-sm text-gray-700">
                Võistkonnal peab olema üks kapten
              </span>
            </label>

            <div className="pt-2">
              <div className="flex items-center justify-between gap-3 mb-2">
                <div>
                  <h3 className="text-sm font-medium text-gray-700">
                    Liikmerollid
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Näiteks meedik, radist või autojuht.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addMemberRole}
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  + Lisa roll
                </button>
              </div>
              <div className="space-y-2">
                {form.teamMemberRoles.map((role, index) => (
                  <div
                    key={index}
                    className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
                  >
                    <Input
                      type="text"
                      value={role.name}
                      onChange={(event) =>
                        updateMemberRole(index, { name: event.target.value })
                      }
                      aria-label={`Liikmeroll ${index + 1}`}
                      placeholder="nt Meedik"
                    />
                    <label className="flex items-center gap-2 text-sm text-gray-600">
                      <input
                        type="checkbox"
                        checked={role.required}
                        onChange={(event) =>
                          updateMemberRole(index, {
                            required: event.target.checked,
                          })
                        }
                      />
                      Kohustuslik
                    </label>
                    <button
                      type="button"
                      onClick={() => removeMemberRole(index)}
                      className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg"
                    >
                      Eemalda
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <AllocationRuleBuilder
            capacity={form.registrationCapacity}
            classes={form.registrationClasses}
            fields={form.registrationFormFields}
            rules={form.registrationAllocationRules}
            classBalanceMode={form.registrationClassBalanceMode}
            onRulesChange={(registrationAllocationRules) =>
              setForm({ ...form, registrationAllocationRules })
            }
            onClassBalanceModeChange={(registrationClassBalanceMode) =>
              setForm({ ...form, registrationClassBalanceMode })
            }
          />

          {phaseCard("Registreerimine", "registration", form, setForm)}
          {phaseCard("Mandaat", "mandate", form, setForm)}

          <div className="flex items-center gap-3 pb-8">
            <Button size="lg"
              type="submit"
              disabled={saving}
            >
              {saving ? "Salvestan..." : "Salvesta seaded"}</Button>
            {saved && <span className="text-sm text-green-600">Salvestatud</span>}
          </div>
        </form>
      )}
    </div>
  )
}
