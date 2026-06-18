import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { notFound } from "next/navigation"
import Link from "next/link"
import { RecalculateButton } from "@/components/RecalculateButton"
import { ExportMenu } from "@/components/ExportMenu"
import { ElementList } from "@/components/competition/ElementList"

const ELEMENT_TYPE_LABEL: Record<string, string> = { CHECKPOINT: "KP", PENALTY_BOX: "Postkast/Vastutegevus", MANUAL: "Käsitsi", OTHER: "Muu" }
const STATUS_LABEL: Record<string, string> = { SETUP: "Ettevalmistus", ACTIVE: "Aktiivne", FINISHED: "Lõppenud" }
const STATUS_COLOR: Record<string, string> = {
  SETUP: "bg-gray-100 text-gray-600",
  ACTIVE: "bg-green-100 text-green-700",
  FINISHED: "bg-blue-100 text-blue-700",
}

export default async function CompetitionPage({ params }: { params: Promise<{ id: string }> }) {
  await auth()
  const { id } = await params

  const competition = await prisma.competition.findUnique({
    where: { id },
    include: {
      elements: {
        orderBy: { order: "asc" },
        include: { _count: { select: { results: true } } },
      },
      _count: { select: { teams: true, elements: true, accessTokens: true } },
    },
  })

  if (!competition) notFound()

  const nav = [
    { href: `/dashboard/competitions/${id}`, label: "Ülevaade" },
    { href: `/dashboard/competitions/${id}/elements/new`, label: "+ Element" },
    { href: `/dashboard/competitions/${id}/teams`, label: "Võistkonnad" },
    { href: `/dashboard/competitions/${id}/access`, label: "Juurdepääs" },
    { href: `/dashboard/competitions/${id}/leaderboard`, label: "Pingerida" },
    { href: `/dashboard/competitions/${id}/settings`, label: "Seaded" },
  ]

  return (
    <div>
      {/* Päis */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/dashboard" className="text-gray-400 hover:text-gray-600 text-sm">← Võistlused</Link>
            <span className="text-gray-300">/</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{competition.name}</h1>
          {(competition.date || competition.endDate) && (
            <p className="text-sm text-gray-500 mt-1">
              📅 {competition.date ? competition.date.toLocaleDateString("et-EE") : ""}
              {competition.endDate && competition.endDate.toDateString() !== competition.date?.toDateString()
                && ` – ${competition.endDate.toLocaleDateString("et-EE")}`}
              {competition.location && ` · ${competition.location}`}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <ExportMenu groups={[
            {
              title: "Kõik KP-d",
              options: [{
                label: "Kõik elemendid",
                href: `/api/competitions/${id}/export/elements?format=xlsx`,
                printHref: `/dashboard/competitions/${id}/all-results-print`,
              }],
            },
            {
              title: "Lõpuprotokoll",
              options: [{
                label: "Pingerida",
                href: `/api/competitions/${id}/export?format=xlsx`,
                printHref: `/dashboard/competitions/${id}/leaderboard/print`,
              }],
            },
          ]} />
          <RecalculateButton competitionId={id} />
          <span className={`text-sm px-3 py-1 rounded-full font-medium ${STATUS_COLOR[competition.status]}`}>
            {STATUS_LABEL[competition.status]}
          </span>
        </div>
      </div>

      {/* Navigatsioon */}
      <div className="flex gap-2 mb-6 border-b">
        {nav.map((n) => (
          <Link key={n.href} href={n.href}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-blue-600 hover:border-b-2 hover:border-blue-600 transition-colors">
            {n.label}
          </Link>
        ))}
      </div>

      {/* Statistika */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: "Elemendid", value: competition._count.elements, icon: "🏳" },
          { label: "Võistkonnad", value: competition._count.teams, icon: "👥" },
          { label: "Juurdepääsud", value: competition._count.accessTokens, icon: "🔑" },
        ].map((s) => (
          <div key={s.label} className="bg-white border rounded-xl p-4 text-center">
            <p className="text-2xl mb-1">{s.icon}</p>
            <p className="text-2xl font-bold text-gray-900">{s.value}</p>
            <p className="text-sm text-gray-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Hindamiselemendid */}
      <div className="bg-white border rounded-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold text-gray-900">Hindamiselemendid</h2>
          <Link href={`/dashboard/competitions/${id}/elements/new`}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium">
            + Lisa element
          </Link>
        </div>

        <ElementList
          competitionId={id}
          initialElements={competition.elements.map(el => ({
            id: el.id,
            name: el.name,
            code: el.code,
            type: el.type,
            order: el.order,
            isCancelled: el.isCancelled,
            _count: { results: el._count.results },
          }))}
          teamCount={competition._count.teams}
        />
      </div>
    </div>
  )
}
