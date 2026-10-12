"use client"

import Link from "next/link"
import { OrganizerRegistrationEditor, type OrganizerRegistrationTarget } from "@/components/registration/OrganizerRegistrationEditor"
import type { TeamCompositionSettings } from "@/lib/teamComposition"
import { use, useCallback, useEffect, useMemo, useState } from "react"
import { DynamicFormFields } from "@/components/registration/DynamicFormFields"
import {
  isFormFieldVisible,
  validateFormAnswers,
  type FormAnswer,
  type FormAnswers,
  type FormFieldDefinition,
} from "@/lib/registrationForm"
import { Card, cardClass } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge, type BadgeProps } from "@/components/ui/badge"
import { Input, Select } from "@/components/ui/input"
import { mandateProgress, matchesSearch, statusCounts } from "@/lib/registrationDashboard"
import { RegistrationExportButtons } from "@/components/registration/RegistrationExportButtons"
import { CompetitionNav } from "@/components/competition/CompetitionNav"
import { FinalizeReview, type FinalizeCheck } from "@/components/registration/FinalizeReview"

type WorkflowStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "APPROVED"
  | "CHANGES_REQUESTED"

type RegistrationTeam = {
  id: string
  code: string
  name: string
  class: string | null
  pendingRepresentativeEmail: string | null
  pendingRepresentativeName: string | null
  answers: FormAnswers
  registrationStatus: WorkflowStatus
  registrationReviewNote: string | null
  mandateStatus: WorkflowStatus
  mandateReviewNote: string | null
  members: {
    id: string
    name: string
    role: string
    isCaptain: boolean
    assignmentRole: string | null
    user: { id: string; name: string } | null
  }[]
  representative: {
    member: { user: { id: string; name: string; email: string } }
  } | null
  details: { fieldId: string; label: string; value: string }[]
}

type PhaseStatus = "NOT_OPEN" | "OPEN" | "CLOSED" | "FINALIZED"
type RegistrationApplication = {
  id: string
  teamName: string
  status: string
  allocationReason: string | null
  waitlistPosition: number | null
  submittedAt: string | null
  class: { id: string; name: string } | null
  currentRepresentative: { id?: string; name: string; email: string } | null
  submittedBy: { id: string; name: string; email: string }
  team: { id: string; code: string } | null
  pendingRepresentativeEmail: string | null
  pendingRepresentativeName: string | null
  answers: FormAnswers
  details: { fieldId: string; label: string; value: string }[]
  events: {
    id: string
    fromStatus: string | null
    toStatus: string
    note: string | null
    createdAt: string
    actor: { name: string } | null
  }[]
}
type RegistrationOverview = {
  registrationStatus: PhaseStatus
  registrationApprovalMode: "AUTOMATIC" | "MANUAL"
  mandateStatus: PhaseStatus
  mandateApprovalMode: "AUTOMATIC" | "MANUAL"
  registrationFinalizedAt: string | null
  registrationCapacity: number | null
  registrationClasses: { id: string; name: string }[]
}

const STATUS_LABEL: Record<WorkflowStatus, string> = {
  DRAFT: "Mustand",
  SUBMITTED: "Esitatud",
  APPROVED: "Kinnitatud",
  CHANGES_REQUESTED: "Vajab parandamist",
}

const STATUS_TONE: Record<WorkflowStatus, BadgeProps["tone"]> = {
  DRAFT: "neutral",
  SUBMITTED: "info",
  APPROVED: "success",
  CHANGES_REQUESTED: "warning",
}

// Mandaadi filtrite järjekord: kõigepealt need, mis vajavad korraldaja tegevust.
const MANDATE_FILTER_ORDER: readonly WorkflowStatus[] = ["SUBMITTED", "CHANGES_REQUESTED", "DRAFT", "APPROVED"]
const MANDATE_LABEL: Record<WorkflowStatus, string> = {
  SUBMITTED: "Ootab kinnitust",
  CHANGES_REQUESTED: "Vajab parandamist",
  DRAFT: "Esitamata",
  APPROVED: "Kinnitatud",
}

const PHASE_LABEL: Record<PhaseStatus, string> = {
  NOT_OPEN: "Pole veel avatud",
  OPEN: "Avatud",
  CLOSED: "Suletud",
  FINALIZED: "Kinnitatud",
}

const APPLICATION_LABEL: Record<string, string> = {
  DRAFT: "Mustand",
  PENDING_REVIEW: "Ootab ülevaatamist",
  CHANGES_REQUESTED: "Vajab täiendamist",
  CONFIRMED: "Registreeritud",
  WAITLISTED: "Ootenimekirjas",
  REJECTED: "Tagasi lükatud",
  WITHDRAWN: "Loobunud",
}

const APPLICATION_TONE: Record<string, BadgeProps["tone"]> = {
  CONFIRMED: "success",
  WAITLISTED: "warning",
  PENDING_REVIEW: "info",
  CHANGES_REQUESTED: "warning",
  REJECTED: "danger",
  WITHDRAWN: "neutral",
  DRAFT: "neutral",
}

const APPLICATION_FILTER_ORDER = ["PENDING_REVIEW", "CHANGES_REQUESTED", "CONFIRMED", "WAITLISTED", "DRAFT", "WITHDRAWN", "REJECTED"] as const

type ListTab = "APPLICATIONS" | "MANDATE"

export default function RegistrationsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: competitionId } = use(params)
  const [editor, setEditor] = useState<OrganizerRegistrationTarget | null>(null)
  const [formFields, setFormFields] = useState<FormFieldDefinition[]>([])
  const [teamComposition, setTeamComposition] = useState<TeamCompositionSettings>()
  const [teams, setTeams] = useState<RegistrationTeam[]>([])
  const [applications, setApplications] = useState<RegistrationApplication[]>([])
  const [memberFormFields, setMemberFormFields] = useState<
    FormFieldDefinition[]
  >([])
  const [overview, setOverview] = useState<RegistrationOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [reviewing, setReviewing] = useState<string | null>(null)
  const [finalizing, setFinalizing] = useState(false)
  const [finalizeCheck, setFinalizeCheck] = useState<FinalizeCheck | null>(null)
  const [editingApplicationId, setEditingApplicationId] = useState<
    string | null
  >(null)
  const [editingAnswers, setEditingAnswers] = useState<FormAnswers>({})
  const [editingErrors, setEditingErrors] = useState<Record<string, string>>({})
  const [tab, setTab] = useState<ListTab | null>(null)
  const [applicationFilter, setApplicationFilter] = useState<string>("ALL")
  const [mandateFilter, setMandateFilter] = useState<WorkflowStatus | "ALL">("ALL")
  const [search, setSearch] = useState("")
  const [classFilter, setClassFilter] = useState("")
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())

  const loadTeams = useCallback(async () => {
    const response = await fetch(
      `/api/competitions/${competitionId}/registrations`
    )
    const data = await response.json()
    if (!response.ok) {
      setError(data.error ?? "Registreerimiste laadimine ebaõnnestus")
      setLoading(false)
      return
    }
    setFormFields(data.formFields ?? [])
    setTeamComposition(data.teamComposition)
    setTeams(data.legacyTeams ?? [])
    setApplications(data.applications ?? [])
    setMemberFormFields(data.memberFormFields ?? [])
    setOverview(data.competition ?? null)
    setLoading(false)
  }, [competitionId])

  function editTeam(team: RegistrationTeam) {
    setEditingApplicationId(null)
    setEditor({ teamId: team.id, teamName: team.name, className: team.class, answers: team.answers, representativeName: team.pendingRepresentativeName ?? team.representative?.member.user.name, representativeEmail: team.pendingRepresentativeEmail ?? team.representative?.member.user.email })
  }

  useEffect(() => {
    if (editor) document.querySelector('[aria-label="Võistkonna andmete muutmine"]')?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [editor])

  function toggleExpanded(key: string, open?: boolean) {
    setExpanded((current) => {
      const next = new Set(current)
      if (open ?? !next.has(key)) next.add(key)
      else next.delete(key)
      return next
    })
  }

  function startEditingMembers(application: RegistrationApplication) {
    setEditor(null)
    setTab("APPLICATIONS")
    toggleExpanded(application.id, true)
    setEditingApplicationId(application.id)
    setEditingAnswers(application.answers ?? {})
    setEditingErrors({})
    setError("")
    setMessage("")
  }

  function updateEditingAnswer(key: string, value: FormAnswer) {
    setEditingAnswers((current) => ({ ...current, [key]: value }))
    setEditingErrors((current) => {
      if (!current[key]) return current
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  async function saveApplicationMembers(applicationId: string) {
    const validated = validateFormAnswers(
      memberFormFields,
      editingAnswers,
      "REGISTRATION"
    )
    setEditingErrors(validated.errors)
    if (Object.keys(validated.errors).length > 0) {
      setError("Kontrolli osalejate kohustuslikke ja vigaseid välju")
      return
    }

    setReviewing(`application-members-${applicationId}`)
    setError("")
    setMessage("")
    const response = await fetch(
      `/api/competitions/${competitionId}/registration-applications/${applicationId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "UPDATE_MEMBERS",
          answers: validated.answers,
        }),
      }
    )
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      setError(data.error ?? "Osalejate salvestamine ebaõnnestus")
    } else {
      setEditingApplicationId(null)
      setEditingAnswers({})
      setMessage("Osalejate andmed salvestatud")
      await loadTeams()
      if (finalizeCheck) await loadFinalizeCheck()
    }
    setReviewing(null)
  }

  function canEditApplicationMembers(application: RegistrationApplication) {
    return (
      !overview?.registrationFinalizedAt &&
      !["WITHDRAWN", "REJECTED"].includes(application.status) &&
      memberFormFields.some((field) =>
        isFormFieldVisible(field, application.answers)
      )
    )
  }

  useEffect(() => {
    void loadTeams()
  }, [loadTeams])

  async function review(
    teamId: string,
    phase: "REGISTRATION" | "MANDATE",
    decision: "APPROVE" | "REQUEST_CHANGES"
  ) {
    const note =
      decision === "REQUEST_CHANGES"
        ? window.prompt("Kirjelda, mida esindaja peab parandama:")
        : ""
    if (decision === "REQUEST_CHANGES" && !note?.trim()) return

    setReviewing(`${teamId}-${phase}`)
    setError("")
    const response = await fetch(
      `/api/competitions/${competitionId}/registrations/${teamId}/review`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase, decision, note }),
      }
    )
    const data = await response.json()
    setMessage("")
    if (!response.ok) {
      setError(data.error ?? "Läbivaatamine ebaõnnestus")
    } else {
      setMessage(`${phase === "MANDATE" ? "Mandaat" : "Registreerimine"} ${decision === "APPROVE" ? "kinnitatud" : "saadeti parandamisele"}`)
      await loadTeams()
    }
    setReviewing(null)
  }

  async function decideApplication(
    applicationId: string,
    action: "CONFIRM" | "WAITLIST" | "REQUEST_CHANGES" | "REJECT"
  ) {
    const note =
      action === "REQUEST_CHANGES"
        ? window.prompt("Kirjelda, mida registreerija peab täiendama:")
        : action === "REJECT"
          ? window.prompt("Soovi korral lisa tagasilükkamise põhjus:")
          : ""
    // Katkestatud küsimus ei tee otsust.
    if (note === null) return
    if (action === "REQUEST_CHANGES" && !note.trim()) return
    setReviewing(`application-${applicationId}`)
    setError("")
    const response = await fetch(
      `/api/competitions/${competitionId}/registration-applications/${applicationId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note }),
      }
    )
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      setError(data.error ?? "Otsuse salvestamine ebaõnnestus")
    } else {
      await loadTeams()
      if (finalizeCheck) await loadFinalizeCheck()
    }
    setReviewing(null)
  }

  function canManuallyPlaceApplication() {
    return (
      overview?.registrationApprovalMode === "MANUAL" ||
      overview?.registrationStatus !== "OPEN"
    )
  }

  // Eelkontroll näitab kõik kinnitamise takistused ja e-posti kordused korraga.
  async function loadFinalizeCheck() {
    setFinalizing(true)
    setError("")
    const response = await fetch(
      `/api/competitions/${competitionId}/registration-applications/finalize`,
      { cache: "no-store" }
    )
    const data = await response.json().catch(() => ({}))
    if (!response.ok) setError(data.error ?? "Nimekirja kontroll ebaõnnestus")
    else setFinalizeCheck(data as FinalizeCheck)
    setFinalizing(false)
  }

  async function finalizeRegistrations(acceptedIssueKeys: string[]) {
    setFinalizing(true)
    setError("")
    setMessage("")
    const response = await fetch(
      `/api/competitions/${competitionId}/registration-applications/finalize`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acceptedIssueKeys }),
      }
    )
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      // Vahepeal muutunud avaldused: näita uut seisu, mitte vana kinnitust.
      if (Array.isArray(data.issues) || Array.isArray(data.blocking)) {
        setFinalizeCheck((current) => ({
          blocking: data.blocking ?? [],
          issues: data.issues ?? [],
          applicationCount: current?.applicationCount ?? 0,
        }))
        setError("Avaldused muutusid vahepeal. Vaata ülevaatus uuesti üle.")
      } else {
        setError(data.error ?? "Nimekirja kinnitamine ebaõnnestus")
      }
    } else {
      setFinalizeCheck(null)
      setMessage(`Osalejate nimekiri kinnitatud. Loodi ${data.createdTeams} võistkonda.`)
      await loadTeams()
    }
    setFinalizing(false)
  }

  function editMembersFromReview(applicationId: string) {
    const application = applications.find((item) => item.id === applicationId)
    if (!application) return
    startEditingMembers(application)
    requestAnimationFrame(() => document.getElementById(`application-${applicationId}`)?.scrollIntoView({ behavior: "smooth", block: "start" }))
  }

  const mandate = useMemo(() => mandateProgress(teams), [teams])
  const confirmedCount = applications.filter((item) => item.status === "CONFIRMED").length
  const waitlistedCount = applications.filter((item) => item.status === "WAITLISTED").length
  const pendingCount = applications.filter((item) => item.status === "PENDING_REVIEW").length
  const classNames = useMemo(() => [...new Set([
    ...(overview?.registrationClasses ?? []).map((item) => item.name),
    ...applications.map((item) => item.class?.name),
    ...teams.map((item) => item.class),
  ].filter((name): name is string => Boolean(name)))], [overview, applications, teams])

  const defaultTab: ListTab = overview?.registrationFinalizedAt && teams.length > 0 ? "MANDATE" : applications.length > 0 ? "APPLICATIONS" : "MANDATE"
  const activeTab = tab ?? defaultTab
  const visibleApplications = applications
    .map((application, index) => ({ application, number: index + 1 }))
    .filter(({ application }) =>
      (applicationFilter === "ALL" || application.status === applicationFilter) &&
      (!classFilter || application.class?.name === classFilter) &&
      matchesSearch(search, [application.teamName, application.class?.name, application.currentRepresentative?.name, application.currentRepresentative?.email, application.submittedBy.name, application.team?.code])
    )
  const visibleTeams = teams.filter((team) =>
    (mandateFilter === "ALL" || team.mandateStatus === mandateFilter) &&
    (!classFilter || team.class === classFilter) &&
    matchesSearch(search, [team.code, team.name, team.class, team.representative?.member.user.name, team.representative?.member.user.email, team.pendingRepresentativeName, team.pendingRepresentativeEmail, ...team.members.map((member) => member.name)])
  )
  const visibleKeys = activeTab === "APPLICATIONS" ? visibleApplications.map(({ application }) => application.id) : visibleTeams.map((team) => `team-${team.id}`)
  const allVisibleExpanded = visibleKeys.length > 0 && visibleKeys.every((key) => expanded.has(key))
  const filtersActive = Boolean(search.trim() || classFilter || (activeTab === "APPLICATIONS" ? applicationFilter !== "ALL" : mandateFilter !== "ALL"))

  function clearFilters() {
    setSearch("")
    setClassFilter("")
    setApplicationFilter("ALL")
    setMandateFilter("ALL")
  }

  function showMandateStatus(status: WorkflowStatus | "ALL") {
    setTab("MANDATE")
    setMandateFilter(status)
  }

  function showApplicationStatus(status: string) {
    setTab("APPLICATIONS")
    setApplicationFilter(status)
  }

  function openApplicationEditor(application: RegistrationApplication) {
    setEditingApplicationId(null)
    const team = teams.find((item) => item.id === application.team?.id)
    if (team) editTeam(team)
    else setEditor({ applicationId: application.id, teamName: application.teamName, classId: application.class?.id, answers: application.answers, representativeName: application.currentRepresentative?.name ?? "Esindaja määramata", representativeEmail: application.currentRepresentative?.email ?? "" })
  }

  if (loading) return <p className="text-gray-400 py-10">Laadin...</p>

  const tabs = [
    applications.length > 0 && { value: "APPLICATIONS" as const, label: "Avaldused", count: applications.length },
    teams.length > 0 && { value: "MANDATE" as const, label: "Mandaat", count: teams.length },
  ].filter((item): item is { value: ListTab; label: string; count: number } => Boolean(item))

  return (
    <div>
      <Link
        href={`/dashboard/competitions/${competitionId}`}
        className="text-sm text-gray-400 hover:text-gray-600"
      >
        ← Tagasi
      </Link>
      <div className="mt-4 mb-6">
        <h1 className="text-xl font-bold text-gray-900">
          Registreerimine ja mandaat
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Halda avaldusi, ootenimekirja ja mandaadi töövoogu.
        </p>
      </div>

      <CompetitionNav competitionId={competitionId} />

      {error && (
        <p className="mb-4 px-4 py-3 rounded-lg bg-red-50 text-red-700 text-sm">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="mb-4 px-4 py-3 rounded-lg bg-green-50 text-green-700 text-sm">
          {message}
        </p>
      )}

      {overview && (
        <div className="grid md:grid-cols-2 gap-4 mb-4">
          <section aria-label="Registreerimise kokkuvõte" className={cn(cardClass, "p-4")}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-ink">Registreerimine</h2>
                <Badge tone={overview.registrationStatus === "OPEN" ? "success" : "neutral"}>{PHASE_LABEL[overview.registrationStatus]}</Badge>
              </div>
              <Link href={`/dashboard/competitions/${competitionId}/registration-settings`} className="text-xs text-primary hover:underline">
                Muuda avatust
              </Link>
            </div>
            <p className="mt-3 text-2xl font-semibold text-ink tabular-nums">
              {confirmedCount}
              {overview.registrationCapacity ? <span className="text-ink-subtle">/{overview.registrationCapacity}</span> : null}
              <span className="ml-2 text-sm font-normal text-ink-muted">registreeritud</span>
            </p>
            {overview.registrationCapacity ? <ProgressBar segments={[{ value: confirmedCount, className: "bg-success" }]} total={overview.registrationCapacity} label={`${confirmedCount} kohta ${overview.registrationCapacity}-st täidetud`} /> : null}
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
              <CountLink count={pendingCount} label="ootab ülevaatust" tone="text-primary" onClick={() => showApplicationStatus("PENDING_REVIEW")} />
              <CountLink count={waitlistedCount} label="ootenimekirjas" tone="text-warning" onClick={() => showApplicationStatus("WAITLISTED")} />
              <span>Kinnitamine: {overview.registrationApprovalMode === "AUTOMATIC" ? "automaatne" : "käsitsi"}</span>
            </div>
            {overview.registrationStatus === "CLOSED" &&
              !overview.registrationFinalizedAt && (
                <Button size="sm" className="mt-4 py-2"
                  type="button"
                  onClick={loadFinalizeCheck}
                  disabled={finalizing}
                >
                  {finalizing && !finalizeCheck
                    ? "Kontrollin..."
                    : "Kinnita osalejate nimekiri"}</Button>
              )}
          </section>
          <section aria-label="Mandaadi kokkuvõte" className={cn(cardClass, "p-4")}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-ink">Mandaat</h2>
                <Badge tone={overview.mandateStatus === "OPEN" ? "success" : "neutral"}>{PHASE_LABEL[overview.mandateStatus]}</Badge>
              </div>
              <span className="text-xs text-ink-muted">Kinnitamine: {overview.mandateApprovalMode === "AUTOMATIC" ? "automaatne" : "käsitsi"}</span>
            </div>
            {mandate.total > 0 ? (
              <>
                <p className="mt-3 text-2xl font-semibold text-ink tabular-nums" data-testid="mandate-counter">
                  {mandate.done}<span className="text-ink-subtle">/{mandate.total}</span>
                  <span className="ml-2 text-sm font-normal text-ink-muted">võistkonda on mandaadi esitanud</span>
                </p>
                <ProgressBar total={mandate.total} label={`${mandate.done} võistkonda ${mandate.total}-st on mandaadi esitanud`} segments={[
                  { value: mandate.approved, className: "bg-success" },
                  { value: mandate.submitted, className: "bg-primary" },
                ]} />
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
                  <CountLink count={mandate.approved} label="kinnitatud" tone="text-success" onClick={() => showMandateStatus("APPROVED")} />
                  <CountLink count={mandate.submitted} label="ootab kinnitust" tone="text-primary" onClick={() => showMandateStatus("SUBMITTED")} />
                  <CountLink count={mandate.changesRequested} label="vajab parandamist" tone="text-warning" onClick={() => showMandateStatus("CHANGES_REQUESTED")} />
                  <CountLink count={mandate.notStarted} label="esitamata" tone="text-ink" onClick={() => showMandateStatus("DRAFT")} />
                </div>
              </>
            ) : (
              <p className="mt-3 text-sm text-ink-muted">Võistkonnad tekivad mandaadi jaoks pärast osalejate nimekirja kinnitamist.</p>
            )}
          </section>
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link href={`/dashboard/competitions/${competitionId}/registration-overview`} className="text-sm text-primary hover:underline">
          Registreerimise ülevaade ja ekspordi veergude valik →
        </Link>
        <details className="group relative">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-control border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-canvas [&::-webkit-details-marker]:hidden">
            Ekspordi <span aria-hidden className="transition-transform group-open:rotate-180">▾</span>
          </summary>
          <div className={cn(cardClass, "absolute left-0 sm:left-auto sm:right-0 z-20 mt-2 w-[min(26rem,calc(100vw-2rem))] space-y-4 p-4 shadow-lg")}>
            <section aria-label="Registreerimise eksport">
              <p className="mb-2 text-xs font-medium text-ink-muted">Kõik registreerimise andmed</p>
              <RegistrationExportButtons competitionId={competitionId} phase="REGISTRATION" />
            </section>
            <section aria-label="Mandaadi eksport">
              <p className="mb-2 text-xs font-medium text-ink-muted">Kõik mandaadi andmed</p>
              <RegistrationExportButtons competitionId={competitionId} phase="MANDATE" />
            </section>
          </div>
        </details>
      </div>

      {finalizeCheck && !overview?.registrationFinalizedAt && (
        <FinalizeReview
          check={finalizeCheck}
          busy={finalizing || Boolean(reviewing)}
          canEdit={(applicationId) => {
            const application = applications.find((item) => item.id === applicationId)
            return Boolean(application && canEditApplicationMembers(application))
          }}
          onEditMembers={editMembersFromReview}
          onReject={(applicationId) => void decideApplication(applicationId, "REJECT")}
          onConfirm={(keys) => void finalizeRegistrations(keys)}
          onCancel={() => setFinalizeCheck(null)}
        />
      )}

      {editor && (
        <section className="mb-6">
          <OrganizerRegistrationEditor
            key={editor.applicationId ?? editor.teamId ?? "new"}
            competitionId={competitionId} target={editor} fields={formFields}
            classes={overview?.registrationClasses ?? []} teamComposition={teamComposition}
            includeMandate={Boolean(editor.teamId || (!editor.applicationId && overview?.registrationFinalizedAt))}
            onCancel={() => setEditor(null)}
            onSaved={async () => { setEditor(null); setMessage("Võistkonna andmed salvestatud"); await loadTeams() }}
          />
        </section>
      )}

      <section aria-label="Võistkondade nimekiri" className="mb-8">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3 border-b border-line">
          <div role="tablist" aria-label="Nimekirja vaade" className="flex gap-1">
            {tabs.map((item) => (
              <button
                key={item.value}
                type="button"
                role="tab"
                id={`tab-${item.value}`}
                aria-selected={activeTab === item.value}
                aria-controls="registration-list-panel"
                onClick={() => setTab(item.value)}
                className={cn(
                  "-mb-px border-b-2 px-3 py-2 text-sm",
                  activeTab === item.value ? "border-primary font-medium text-primary" : "border-transparent text-ink-muted hover:text-ink"
                )}
              >
                {item.label} <span className="ml-1 text-xs opacity-70">{item.count}</span>
              </button>
            ))}
          </div>
          <Button type="button" size="sm" className="mb-2" title="Korraldaja ja administraator saavad võistkondi lisada ja muuta ka pärast registreerimise lõppu ning mandaadi ajal." onClick={() => { setEditingApplicationId(null); setEditor({ teamName: "", answers: {} }) }}>Lisa võistkond</Button>
        </div>

        {tabs.length === 0 ? (
          <Card className="py-10 text-center text-sm text-gray-400">
            Registreerimisavaldusi ega võistkondi veel pole.
          </Card>
        ) : (
          <div id="registration-list-panel" role="tabpanel" aria-labelledby={`tab-${activeTab}`}>
            <div className="mb-3 flex flex-col gap-3">
              <div className="flex flex-wrap gap-1.5" aria-label="Olekufilter">
                {(activeTab === "APPLICATIONS"
                  ? [{ value: "ALL", label: "Kõik", count: applications.length }, ...statusCounts(applications as { status: (typeof APPLICATION_FILTER_ORDER)[number] }[], APPLICATION_FILTER_ORDER).map(({ status, count }) => ({ value: status as string, label: APPLICATION_LABEL[status], count }))]
                  : [{ value: "ALL", label: "Kõik", count: teams.length }, ...statusCounts(teams.map((team) => ({ status: team.mandateStatus })), MANDATE_FILTER_ORDER).map(({ status, count }) => ({ value: status as string, label: MANDATE_LABEL[status], count }))]
                ).map((filter) => {
                  const selected = (activeTab === "APPLICATIONS" ? applicationFilter : mandateFilter) === filter.value
                  return (
                    <button
                      key={filter.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => activeTab === "APPLICATIONS" ? setApplicationFilter(filter.value) : setMandateFilter(filter.value as WorkflowStatus | "ALL")}
                      className={cn("rounded-full px-3 py-1 text-xs", selected ? "bg-primary-soft font-medium text-primary-hover ring-1 ring-primary/30" : "bg-surface text-ink-soft ring-1 ring-line hover:bg-canvas")}
                    >
                      {filter.label} <span className="ml-0.5 tabular-nums opacity-70">{filter.count}</span>
                    </button>
                  )
                })}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input type="search" aria-label="Otsi võistkonda" placeholder="Otsi võistkonna, esindaja või liikme järgi" value={search} onChange={(event) => setSearch(event.target.value)} className="sm:flex-1" />
                {classNames.length > 1 && (
                  <Select aria-label="Filtreeri klassi järgi" value={classFilter} onChange={(event) => setClassFilter(event.target.value)} className="sm:w-48">
                    <option value="">Kõik klassid</option>
                    {classNames.map((name) => <option key={name} value={name}>{name}</option>)}
                  </Select>
                )}
                <Button type="button" variant="ghost" size="sm" disabled={visibleKeys.length === 0} onClick={() => setExpanded((current) => {
                  const next = new Set(current)
                  visibleKeys.forEach((key) => allVisibleExpanded ? next.delete(key) : next.add(key))
                  return next
                })}>{allVisibleExpanded ? "Sulge kõik" : "Ava kõik"}</Button>
              </div>
            </div>

            {visibleKeys.length === 0 && (
              <Card className="py-8 text-center text-sm text-ink-muted">
                <p>Sellele valikule vastavaid võistkondi pole.</p>
                {filtersActive && <button type="button" onClick={clearFilters} className="mt-2 font-medium text-primary hover:underline">Tühjenda filtrid</button>}
              </Card>
            )}

            {activeTab === "APPLICATIONS" && (
              <div className="space-y-2">
                {visibleApplications.map(({ application, number }) => {
                  const open = expanded.has(application.id)
                  const decisionsAllowed = !overview?.registrationFinalizedAt && ["PENDING_REVIEW", "CONFIRMED", "WAITLISTED"].includes(application.status)
                  return (
                    <article
                      key={application.id}
                      id={`application-${application.id}`}
                      className={cn(cardClass, "scroll-mt-4")}
                    >
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-xs text-ink-subtle tabular-nums">#{number}</span>
                            <h3 className="font-semibold text-ink">
                              <button type="button" aria-expanded={open} aria-controls={`application-${application.id}-details`} onClick={() => toggleExpanded(application.id)} className="inline-flex items-center gap-1.5 text-left hover:text-primary">
                                <Chevron open={open} />
                                {application.teamName}
                              </button>
                            </h3>
                            <Badge tone={APPLICATION_TONE[application.status] ?? "neutral"} className="py-0.5">
                              {APPLICATION_LABEL[application.status] ?? application.status}
                            </Badge>
                            {application.status === "WAITLISTED" && application.waitlistPosition && (
                              <span className="text-xs font-medium text-warning">Ootenimekirja koht: {application.waitlistPosition}.</span>
                            )}
                          </div>
                          <p className="mt-0.5 break-words text-xs text-ink-muted">
                            {application.class ? `${application.class.name} · ` : ""}Praegune esindaja:{" "}
                            {application.currentRepresentative?.name ?? "Esindaja määramata"}
                            {application.currentRepresentative?.email ? ` · ${application.currentRepresentative.email}` : ""}
                            {application.currentRepresentative && !application.currentRepresentative.id && " · Konto sidumise ootel"}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {decisionsAllowed && canManuallyPlaceApplication() && application.status !== "CONFIRMED" && (
                            <Button type="button" size="sm" className="bg-success hover:bg-success/90" onClick={() => decideApplication(application.id, "CONFIRM")} disabled={Boolean(reviewing)}>Kinnita</Button>
                          )}
                          {decisionsAllowed && canManuallyPlaceApplication() && application.status !== "WAITLISTED" && (
                            <Button type="button" variant="secondary" size="sm" className="text-warning" onClick={() => decideApplication(application.id, "WAITLIST")} disabled={Boolean(reviewing)}>Ootenimekirja</Button>
                          )}
                          {!["WITHDRAWN", "REJECTED"].includes(application.status) && (
                            <Button type="button" variant="secondary" size="sm" onClick={() => openApplicationEditor(application)}>Muuda võistkonda</Button>
                          )}
                          {editingApplicationId !== application.id && canEditApplicationMembers(application) && (
                            <Button type="button" variant="ghost" size="sm" onClick={() => startEditingMembers(application)}>Muuda osalejaid</Button>
                          )}
                        </div>
                      </div>

                      {open && (
                        <div id={`application-${application.id}-details`} className="border-t border-line px-4 py-4">
                          <p className="text-xs text-ink-muted">Registreeris: {application.submittedBy.name}</p>
                          {application.allocationReason && (
                            <p className="text-xs text-primary-hover mt-1">
                              {application.allocationReason}
                            </p>
                          )}
                          {application.details.length > 0 && (
                            <dl className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-2 mt-3">
                              {application.details.map((detail) => (
                                <div key={detail.fieldId} className="min-w-0">
                                  <dt className="text-xs text-ink-subtle">
                                    {detail.label}
                                  </dt>
                                  <dd className="text-sm text-ink-soft whitespace-pre-line break-words">
                                    {detail.value}
                                  </dd>
                                </div>
                              ))}
                            </dl>
                          )}
                          {editingApplicationId === application.id && (
                            <div className="mt-4 border-t border-line pt-4 space-y-4">
                              <h4 className="text-sm font-semibold text-gray-800">
                                Muuda osalejaid
                              </h4>
                              <DynamicFormFields
                                fields={memberFormFields}
                                phase="REGISTRATION"
                                values={editingAnswers}
                                onChange={updateEditingAnswer}
                                errors={editingErrors}
                              />
                              <div className="flex flex-wrap gap-2">
                                <Button size="sm" className="py-2"
                                  type="button"
                                  onClick={() => saveApplicationMembers(application.id)}
                                  disabled={Boolean(reviewing)}
                                >
                                  Salvesta osalejad</Button>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  className="py-2"
                                  onClick={() => {
                                    setEditingApplicationId(null)
                                    setEditingAnswers({})
                                    setEditingErrors({})
                                  }}
                                  disabled={Boolean(reviewing)}
                                >
                                  Tühista
                                </Button>
                              </div>
                            </div>
                          )}
                          {decisionsAllowed && (
                            <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
                              <Button type="button" variant="secondary" size="sm" className="text-primary" onClick={() => decideApplication(application.id, "REQUEST_CHANGES")} disabled={Boolean(reviewing)}>Saada täiendamisele</Button>
                              {canManuallyPlaceApplication() && (
                                <Button type="button" variant="secondary" size="sm" className="text-danger" onClick={() => decideApplication(application.id, "REJECT")} disabled={Boolean(reviewing)}>Lükka tagasi</Button>
                              )}
                            </div>
                          )}
                          {application.events.length > 0 && (
                            <details className="mt-4 border-t border-line pt-3">
                              <summary className="text-xs text-primary cursor-pointer">
                                Muudatuste ajalugu ({application.events.length})
                              </summary>
                              <ul className="mt-3 space-y-3">
                                {application.events.map((event) => (
                                  <li key={event.id} className="text-xs text-gray-600">
                                    <p>
                                      {new Date(event.createdAt).toLocaleString("et-EE", {
                                        dateStyle: "medium",
                                        timeStyle: "short",
                                      })}
                                      {" · "}
                                      {event.actor?.name ?? "Süsteem"}
                                      {" · "}
                                      {event.fromStatus &&
                                      event.fromStatus !== event.toStatus
                                        ? `${
                                            APPLICATION_LABEL[event.fromStatus] ??
                                            event.fromStatus
                                          } → ${
                                            APPLICATION_LABEL[event.toStatus] ??
                                            event.toStatus
                                          }`
                                        : APPLICATION_LABEL[event.toStatus] ??
                                          event.toStatus}
                                    </p>
                                    {event.note && (
                                      <p className="text-gray-500 mt-0.5">{event.note}</p>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            </details>
                          )}
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
            )}

            {activeTab === "MANDATE" && (
              <div className="space-y-2">
                {visibleTeams.map((team) => {
                  const key = `team-${team.id}`
                  const open = expanded.has(key)
                  return (
                    <article key={team.id} id={key} className={cn(cardClass, "scroll-mt-4")}>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <h3 className="font-semibold text-ink">
                              <button type="button" aria-expanded={open} aria-controls={`${key}-details`} onClick={() => toggleExpanded(key)} className="inline-flex items-center gap-1.5 text-left hover:text-primary">
                                <Chevron open={open} />
                                {team.code} · {team.name}
                              </button>
                            </h3>
                            {team.registrationStatus !== "APPROVED" && (
                              <Badge tone={STATUS_TONE[team.registrationStatus]} className="py-0.5">
                                <span className="mr-1 opacity-70">Registreerimine</span>
                                <span>{STATUS_LABEL[team.registrationStatus]}</span>
                              </Badge>
                            )}
                            <Badge tone={STATUS_TONE[team.mandateStatus]} className="py-0.5">
                              <span className="mr-1 opacity-70">Mandaat</span>
                              <span>{MANDATE_LABEL[team.mandateStatus]}</span>
                            </Badge>
                          </div>
                          <p className="mt-0.5 break-words text-xs text-ink-muted">
                            {team.class ? `${team.class} · ` : ""}
                            {team.representative
                              ? `${team.representative.member.user.name} · ${team.representative.member.user.email}`
                              : team.pendingRepresentativeEmail
                                ? `${team.pendingRepresentativeName} · ${team.pendingRepresentativeEmail} · Konto sidumise ootel`
                                : "Esindaja määramata"}
                            {` · ${team.members.length} liiget`}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {team.registrationStatus === "SUBMITTED" && (
                            <Button type="button" size="sm" className="bg-success hover:bg-success/90" onClick={() => review(team.id, "REGISTRATION", "APPROVE")} disabled={Boolean(reviewing)}>Kinnita registreerimine</Button>
                          )}
                          {team.mandateStatus === "SUBMITTED" && (
                            <Button type="button" size="sm" className="bg-success hover:bg-success/90" onClick={() => review(team.id, "MANDATE", "APPROVE")} disabled={Boolean(reviewing)}>Kinnita mandaat</Button>
                          )}
                          <Button type="button" variant="secondary" size="sm" onClick={() => editTeam(team)}>Muuda võistkonda</Button>
                        </div>
                      </div>

                      {open && (
                        <div id={`${key}-details`} className="grid gap-4 border-t border-line px-4 py-4 lg:grid-cols-2">
                          <section className="rounded-lg border border-line p-3">
                            <div className="flex items-center justify-between gap-3">
                              <h4 className="text-sm font-semibold">Registreerimine</h4>
                              <Badge tone={STATUS_TONE[team.registrationStatus]} className="py-0.5">{STATUS_LABEL[team.registrationStatus]}</Badge>
                            </div>
                            {team.registrationReviewNote && (
                              <p className="text-xs text-warning mt-2">
                                Märkus: {team.registrationReviewNote}
                              </p>
                            )}
                            {team.details.length > 0 && (
                              <dl className="mt-3 grid gap-x-4 gap-y-2 sm:grid-cols-2">
                                {team.details.map((detail) => (
                                  <div key={detail.fieldId} className="min-w-0">
                                    <dt className="text-xs text-ink-subtle">
                                      {detail.label}
                                    </dt>
                                    <dd className="text-xs text-ink-soft whitespace-pre-line break-words">
                                      {detail.value}
                                    </dd>
                                  </div>
                                ))}
                              </dl>
                            )}
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              {(["SUBMITTED", "APPROVED"] as WorkflowStatus[]).includes(team.registrationStatus) && (
                                <Button type="button" variant="secondary" size="sm" className="text-warning" onClick={() => review(team.id, "REGISTRATION", "REQUEST_CHANGES")} disabled={Boolean(reviewing)}>Saada registreerimine parandamisele</Button>
                              )}
                              <Link href={`/dashboard/competitions/${competitionId}/settings`} className="text-xs text-primary hover:underline">
                                Halda esindajat
                              </Link>
                            </div>
                          </section>

                          <section className="rounded-lg border border-line p-3">
                            <div className="flex items-center justify-between gap-3">
                              <h4 className="text-sm font-semibold">
                                Mandaat · {team.members.length} liiget
                              </h4>
                              <Badge tone={STATUS_TONE[team.mandateStatus]} className="py-0.5">{MANDATE_LABEL[team.mandateStatus]}</Badge>
                            </div>
                            {team.members.length > 0 && (
                              <ul className="text-xs text-ink-soft mt-3 space-y-1">
                                {team.members.map((member) => (
                                  <li key={member.id}>
                                    {member.name} ·{" "}
                                    {member.role === "SUPPORT" ? "Tugiliige" : "Võistleja"}
                                    {member.isCaptain && " · Kapten"}
                                    {member.assignmentRole &&
                                      ` · ${member.assignmentRole}`}
                                    {member.user && (
                                      <span className="ml-1 text-success">
                                        · Konto seotud
                                      </span>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            )}
                            {team.mandateReviewNote && (
                              <p className="text-xs text-warning mt-3">
                                Märkus: {team.mandateReviewNote}
                              </p>
                            )}
                            {(["SUBMITTED", "APPROVED"] as WorkflowStatus[]).includes(team.mandateStatus) && (
                              <Button type="button" variant="secondary" size="sm" className="mt-3 text-warning" onClick={() => review(team.id, "MANDATE", "REQUEST_CHANGES")} disabled={Boolean(reviewing)}>Saada mandaat parandamisele</Button>
                            )}
                          </section>
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

function Chevron({ open }: { open: boolean }) {
  return <span aria-hidden className={cn("inline-block text-xs text-ink-subtle transition-transform", open && "rotate-90")}>▸</span>
}

function CountLink({ count, label, tone, onClick }: { count: number; label: string; tone: string; onClick: () => void }) {
  if (count === 0) return <span><span className="font-medium tabular-nums">0</span> {label}</span>
  return (
    <button type="button" onClick={onClick} className="hover:underline">
      <span className={cn("font-semibold tabular-nums", tone)}>{count}</span> {label}
    </button>
  )
}

function ProgressBar({ segments, total, label }: { segments: { value: number; className: string }[]; total: number; label: string }) {
  const done = segments.reduce((sum, segment) => sum + segment.value, 0)
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} className="mt-2 flex h-2 overflow-hidden rounded-full bg-canvas ring-1 ring-inset ring-line">
      {segments.map((segment, index) => (
        <div key={index} className={segment.className} style={{ width: `${total > 0 ? Math.min(100, (segment.value / total) * 100) : 0}%` }} />
      ))}
    </div>
  )
}
