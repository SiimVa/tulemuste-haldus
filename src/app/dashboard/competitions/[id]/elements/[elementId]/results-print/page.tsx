import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { naturalCompare } from "@/lib/utils"
import { notFound } from "next/navigation"
import Link from "next/link"
import { PrintButton } from "@/components/PrintButton"
import { computeFields } from "@/lib/calculators"

export default async function ElementResultsPrintPage({
  params,
}: {
  params: Promise<{ id: string; elementId: string }>
}) {
  await auth()
  const { id: competitionId, elementId } = await params

  const element = await prisma.scoringElement.findUnique({
    where: { id: elementId },
    include: {
      fields: { orderBy: { order: "asc" } },
      exceptions: { orderBy: { order: "asc" } },
      scores: { include: { team: true } },
      results: { include: { team: true } },
      competition: { select: { name: true, date: true, endDate: true, location: true, scoringMode: true } },
    },
  })
  if (!element) notFound()

  const teams = (await prisma.team.findMany({
    where: { competitionId },
  })).sort((a, b) => naturalCompare(a.code, b.code))

  const comp = element.competition
  const dateStr = comp.date ? comp.date.toLocaleDateString("et-EE") : ""
  const endDateStr = comp.endDate && comp.endDate.toDateString() !== comp.date?.toDateString()
    ? ` – ${comp.endDate.toLocaleDateString("et-EE")}` : ""
  const isPlusMode = comp.scoringMode === "PLUS"

  const inputFields = element.fields.filter((f) => !f.formula)

  const scoreMap = new Map(element.scores.map((s) => [s.teamId, s.penaltyPoints]))

  const rows = teams.map((team) => {
    const result = element.results.find((r) => r.teamId === team.id)
    const score = scoreMap.get(team.id)
    let fieldValues: Record<string, unknown> = {}
    let exceptionLabel: string | null = null

    if (result) {
      if (result.exceptionLabel) {
        exceptionLabel = result.exceptionLabel
      } else {
        try { fieldValues = JSON.parse(result.values || "{}") } catch {}
        fieldValues = computeFields(fieldValues as Record<string, string | number>, element.fields)
      }
    }

    return { team, fieldValues, exceptionLabel, score }
  })

  const inComp = rows.filter((r) => !r.team.isHorsDeCompetition)
  const horsComp = rows.filter((r) => r.team.isHorsDeCompetition)

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; font-size: 11px; }
          .print-page { padding: 10mm; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #666; padding: 3px 6px; }
          th { background: #e5e7eb; font-weight: 600; }
        }
        @page { size: A4 landscape; margin: 0; }
        table { border-collapse: collapse; }
        th, td { border: 1px solid #999; padding: 4px 8px; font-size: 12px; }
        th { background: #f3f4f6; font-weight: 600; }
      `}</style>

      <div className="print-page p-6">
        {/* Toolbar */}
        <div className="no-print flex items-center gap-3 mb-6 p-3 bg-gray-50 rounded-lg border">
          <Link href={`/dashboard/competitions/${competitionId}/elements/${elementId}`}
            className="text-sm text-gray-500 hover:text-gray-700">← Tagasi</Link>
          <span className="text-gray-300">|</span>
          <PrintButton label="Prindi / Salvesta PDF" />
        </div>

        {/* Päis */}
        <div className="flex justify-between items-start mb-4">
          <div>
            <h1 className="text-lg font-bold">{comp.name}</h1>
            <p className="text-sm text-gray-600">{dateStr}{endDateStr}{comp.location && ` · ${comp.location}`}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold font-mono">{element.code}</p>
            <p className="text-sm font-semibold">{element.name}</p>
            <p className="text-xs text-gray-500">{isPlusMode ? "Plusspunktid" : "Karistuspunktid"}</p>
          </div>
        </div>

        <table className="w-full mb-6">
          <thead>
            <tr>
              <th style={{ width: 30 }}>#</th>
              <th style={{ width: 55 }}>Tähis</th>
              <th style={{ minWidth: 140, textAlign: "left" }}>Võistkond</th>
              <th style={{ width: 55 }}>Klass</th>
              {inputFields.map((f) => (
                <th key={f.id} style={{ minWidth: 65 }}>{f.label}</th>
              ))}
              <th style={{ width: 55 }}>Erand</th>
              <th style={{ minWidth: 70, textAlign: "right" }}>
                {isPlusMode ? "Punktid" : "Karistus"}
              </th>
            </tr>
          </thead>
          <tbody>
            {inComp.map((row, i) => (
              <tr key={row.team.id} style={{ background: i % 2 === 0 ? "#fff" : "#f9fafb" }}>
                <td style={{ textAlign: "center", color: "#6b7280" }}>{i + 1}</td>
                <td style={{ textAlign: "center", fontFamily: "monospace", fontWeight: 600 }}>{row.team.code}</td>
                <td>{row.team.name}</td>
                <td style={{ textAlign: "center", fontSize: 10 }}>{row.team.class ?? ""}</td>
                {inputFields.map((f) => (
                  <td key={f.id} style={{ textAlign: "right", fontFamily: "monospace" }}>
                    {row.exceptionLabel ? "–" : (row.fieldValues[f.name] !== undefined ? String(row.fieldValues[f.name]) : "–")}
                  </td>
                ))}
                <td style={{ fontSize: 10, color: "#b45309" }}>
                  {row.exceptionLabel ?? "–"}
                </td>
                <td style={{ textAlign: "right", fontWeight: 700, fontFamily: "monospace" }}>
                  {row.score !== undefined ? row.score.toFixed(2) : "–"}
                </td>
              </tr>
            ))}
            {horsComp.length > 0 && (
              <>
                <tr>
                  <td colSpan={4 + inputFields.length + 2}
                    style={{ background: "#fef3c7", fontWeight: 600, fontSize: 10, padding: "3px 6px" }}>
                    Arvestusvälised
                  </td>
                </tr>
                {horsComp.map((row, i) => (
                  <tr key={row.team.id} style={{ background: i % 2 === 0 ? "#fffbeb" : "#fef9e7" }}>
                    <td style={{ textAlign: "center", color: "#92400e" }}>AV</td>
                    <td style={{ textAlign: "center", fontFamily: "monospace", color: "#b45309" }}>{row.team.code}</td>
                    <td style={{ color: "#92400e" }}>{row.team.name}</td>
                    <td style={{ textAlign: "center", fontSize: 10 }}>{row.team.class ?? ""}</td>
                    {inputFields.map((f) => (
                      <td key={f.id} style={{ textAlign: "right", fontFamily: "monospace" }}>
                        {row.exceptionLabel ? "–" : (row.fieldValues[f.name] !== undefined ? String(row.fieldValues[f.name]) : "–")}
                      </td>
                    ))}
                    <td style={{ fontSize: 10, color: "#b45309" }}>{row.exceptionLabel ?? "–"}</td>
                    <td style={{ textAlign: "right", fontWeight: 700, fontFamily: "monospace", color: "#92400e" }}>
                      {row.score !== undefined ? row.score.toFixed(2) : "–"}
                    </td>
                  </tr>
                ))}
              </>
            )}
          </tbody>
        </table>

        <p className="text-xs text-gray-400 no-print">Vajuta "Prindi / Salvesta PDF" ja vali "Salvesta PDF-ina" printerina.</p>
      </div>
    </>
  )
}
