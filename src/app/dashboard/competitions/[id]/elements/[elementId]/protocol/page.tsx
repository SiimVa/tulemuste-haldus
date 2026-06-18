import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { naturalCompare } from "@/lib/utils"
import { notFound } from "next/navigation"
import { PrintButton } from "@/components/PrintButton"

export default async function ProtocolPage({
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
      competition: {
        select: {
          name: true,
          date: true,
          endDate: true,
          location: true,
          scoringMode: true,
        },
      },
    },
  })

  if (!element) notFound()

  const teams = (await prisma.team.findMany({
    where: { competitionId },
  })).sort((a, b) => naturalCompare(a.code, b.code))

  const inComp = teams.filter((t) => !t.isHorsDeCompetition)
  const horsComp = teams.filter((t) => t.isHorsDeCompetition)

  const comp = element.competition
  const dateStr = comp.date ? comp.date.toLocaleDateString("et-EE") : ""
  const endDateStr = comp.endDate && comp.endDate.toDateString() !== comp.date?.toDateString()
    ? ` – ${comp.endDate.toLocaleDateString("et-EE")}`
    : ""

  // Only show input fields (not computed)
  const inputFields = element.fields.filter((f) => !f.formula)

  const isPlusMode = comp.scoringMode === "PLUS"

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; }
          .print-page { margin: 0; padding: 12mm; }
        }
        @page { size: A4 landscape; margin: 0; }
        .protocol-table td, .protocol-table th {
          border: 1px solid #555;
          padding: 4px 6px;
          font-size: 11px;
        }
        .protocol-table th {
          background: #e5e7eb;
          font-weight: 600;
          text-align: center;
        }
        .protocol-table td.fill {
          min-width: 60px;
          height: 28px;
        }
        .protocol-table td.narrow {
          min-width: 32px;
          height: 28px;
        }
      `}</style>

      <div className="print-page p-6 max-w-none">
        {/* Toolbar – hidden on print */}
        <div className="no-print flex items-center gap-3 mb-6 p-3 bg-gray-50 rounded-lg border">
          <a
            href={`/dashboard/competitions/${competitionId}/elements/${elementId}`}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ← Tagasi
          </a>
          <span className="text-gray-300">|</span>
          <PrintButton />
        </div>

        {/* Protocol header */}
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">{comp.name}</h1>
            <p className="text-sm text-gray-600">
              {dateStr}{endDateStr}
              {comp.location && ` · ${comp.location}`}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold text-gray-900 font-mono">{element.code}</p>
            <p className="text-sm text-gray-700 font-semibold">{element.name}</p>
          </div>
        </div>

        {/* Judge info */}
        <div className="flex gap-8 mb-5 text-sm">
          <div>
            <span className="text-gray-500">Kohtunik: </span>
            <span className="inline-block border-b border-gray-400 w-48">&nbsp;</span>
          </div>
          <div>
            <span className="text-gray-500">Allkiri: </span>
            <span className="inline-block border-b border-gray-400 w-48">&nbsp;</span>
          </div>
          <div>
            <span className="text-gray-500">Kuupäev: </span>
            <span className="inline-block border-b border-gray-400 w-32">&nbsp;</span>
          </div>
        </div>

        {/* Teams table */}
        <table className="protocol-table w-full border-collapse mb-6">
          <thead>
            <tr>
              <th style={{ width: "40px" }}>Nr</th>
              <th style={{ width: "55px" }}>Tähis</th>
              <th style={{ minWidth: "140px", textAlign: "left", paddingLeft: "6px" }}>Võistkond</th>
              <th style={{ width: "55px" }}>Klass</th>
              {inputFields.map((f) => (
                <th key={f.id} style={{ minWidth: "60px" }} title={f.label}>
                  {f.label.length > 12 ? f.name : f.label}
                </th>
              ))}
              {element.exceptions.length > 0 && (
                <th style={{ minWidth: "50px" }}>Erand</th>
              )}
              <th style={{ minWidth: "70px" }}>Märkused</th>
            </tr>
          </thead>
          <tbody>
            {inComp.map((team, i) => (
              <tr key={team.id}>
                <td className="narrow text-center text-gray-500">{i + 1}</td>
                <td className="narrow text-center font-mono font-semibold">{team.code}</td>
                <td style={{ fontSize: "11px", padding: "4px 6px" }}>{team.name}</td>
                <td className="narrow text-center" style={{ fontSize: "10px" }}>{team.class ?? ""}</td>
                {inputFields.map((f) => (
                  <td key={f.id} className="fill" />
                ))}
                {element.exceptions.length > 0 && <td className="fill" />}
                <td className="fill" />
              </tr>
            ))}
            {horsComp.length > 0 && (
              <>
                <tr>
                  <td
                    colSpan={4 + inputFields.length + (element.exceptions.length > 0 ? 1 : 0) + 1}
                    style={{ background: "#fef3c7", fontWeight: 600, fontSize: "10px", padding: "3px 6px" }}
                  >
                    Arvestusvälised
                  </td>
                </tr>
                {horsComp.map((team, i) => (
                  <tr key={team.id}>
                    <td className="narrow text-center text-gray-400">{inComp.length + i + 1}</td>
                    <td className="narrow text-center font-mono" style={{ color: "#b45309" }}>{team.code}</td>
                    <td style={{ fontSize: "11px", padding: "4px 6px", color: "#92400e" }}>{team.name}</td>
                    <td className="narrow text-center" style={{ fontSize: "10px" }}>{team.class ?? ""}</td>
                    {inputFields.map((f) => (
                      <td key={f.id} className="fill" />
                    ))}
                    {element.exceptions.length > 0 && <td className="fill" />}
                    <td className="fill" />
                  </tr>
                ))}
              </>
            )}
          </tbody>
        </table>

        {/* Legend: field descriptions + exceptions */}
        <div className="flex gap-8 text-xs">
          {inputFields.some((f) => f.label !== f.name) && (
            <div>
              <p className="font-semibold text-gray-700 mb-1">Väljade selgitused</p>
              <table className="border-collapse">
                <tbody>
                  {inputFields.map((f) => (
                    <tr key={f.id}>
                      <td className="pr-3 font-mono font-semibold text-gray-700">{f.name}</td>
                      <td className="text-gray-600">{f.label}</td>
                      {f.type === "NUMBER" && (
                        <td className="pl-3 text-gray-400">arv</td>
                      )}
                      {f.type === "BOOLEAN" && (
                        <td className="pl-3 text-gray-400">jah/ei</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {element.exceptions.length > 0 && (
            <div>
              <p className="font-semibold text-gray-700 mb-1">Erandite koodid</p>
              <table className="border-collapse">
                <tbody>
                  {element.exceptions.map((ex, i) => (
                    <tr key={ex.id}>
                      <td className="pr-3 font-mono font-bold text-gray-700">{i + 1}</td>
                      <td className="pr-4 text-gray-700">{ex.label}</td>
                      <td className="font-mono text-red-600">
                        {isPlusMode ? `−${Math.abs(ex.penalty)}` : `+${Math.abs(ex.penalty)}`}p
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-gray-400 mt-1">Kirjuta erandi number lahtrisse</p>
            </div>
          )}
        </div>

        <p className="text-xs text-gray-400 mt-4 no-print">
          Vajuta "Prindi protokoll" et avada prindivaade
        </p>
      </div>
    </>
  )
}
