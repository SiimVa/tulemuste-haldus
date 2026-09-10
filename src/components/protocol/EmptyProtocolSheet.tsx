import { protocolFieldHeading } from "@/lib/protocol"

type ProtocolCompetition = {
  name: string
  date: Date | null
  endDate: Date | null
  location: string | null
  scoringMode: string
}

type ProtocolElement = {
  id: string
  code: string
  name: string
  fields: Array<{
    id: string
    name: string
    label: string
    formula: string | null
  }>
  exceptions: Array<{
    id: string
    label: string
    penalty: number
  }>
}

type ProtocolTeam = {
  id: string
  code: string
  name: string
  class: string | null
  isHorsDeCompetition: boolean
}

export const emptyProtocolStyles = `
  @media print {
    .no-print { display: none !important; }
    body { margin: 0; }
    .print-page { margin: 0; padding: 12mm; }
    .page-break { break-before: page; page-break-before: always; }
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
  .protocol-table th.protocol-field-heading {
    min-width: 80px;
    max-width: 180px;
    white-space: normal;
    overflow-wrap: anywhere;
  }
  .protocol-table td.fill {
    min-width: 60px;
    height: 28px;
  }
  .protocol-table td.narrow {
    min-width: 32px;
    height: 28px;
  }
`

export function EmptyProtocolSheet({
  competition,
  element,
  teams,
  className = "",
  pageNumber,
  pageCount,
}: {
  competition: ProtocolCompetition
  element: ProtocolElement
  teams: ProtocolTeam[]
  className?: string
  pageNumber?: number
  pageCount?: number
}) {
  const inComp = teams.filter((team) => !team.isHorsDeCompetition)
  const horsComp = teams.filter((team) => team.isHorsDeCompetition)
  const inputFields = element.fields.filter((field) => !field.formula)
  const isPlusMode = competition.scoringMode === "PLUS"
  const dateStr = competition.date
    ? competition.date.toLocaleDateString("et-EE")
    : ""
  const endDateStr =
    competition.endDate &&
    competition.endDate.toDateString() !== competition.date?.toDateString()
      ? ` – ${competition.endDate.toLocaleDateString("et-EE")}`
      : ""

  return (
    <section className={`print-page p-6 max-w-none ${className}`}>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">{competition.name}</h1>
          <p className="text-sm text-gray-600">
            {dateStr}
            {endDateStr}
            {competition.location && ` · ${competition.location}`}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold text-gray-900 font-mono">{element.code}</p>
          <p className="text-sm text-gray-700 font-semibold">{element.name}</p>
          {pageNumber !== undefined && pageCount !== undefined && (
            <p className="text-xs text-gray-400">
              {pageNumber} / {pageCount}
            </p>
          )}
        </div>
      </div>

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

      <table className="protocol-table w-full border-collapse mb-6">
        <thead>
          <tr>
            <th style={{ width: "40px" }}>Nr</th>
            <th style={{ width: "55px" }}>Tähis</th>
            <th style={{ minWidth: "140px", textAlign: "left", paddingLeft: "6px" }}>
              Võistkond
            </th>
            <th style={{ width: "55px" }}>Klass</th>
            {inputFields.map((field) => (
              <th key={field.id} className="protocol-field-heading">
                {protocolFieldHeading(field)}
              </th>
            ))}
            {element.exceptions.length > 0 && (
              <th style={{ minWidth: "50px" }}>Erand</th>
            )}
            <th style={{ minWidth: "70px" }}>Märkused</th>
          </tr>
        </thead>
        <tbody>
          {inComp.map((team, index) => (
            <tr key={team.id}>
              <td className="narrow text-center text-gray-500">{index + 1}</td>
              <td className="narrow text-center font-mono font-semibold">{team.code}</td>
              <td style={{ fontSize: "11px", padding: "4px 6px" }}>{team.name}</td>
              <td className="narrow text-center" style={{ fontSize: "10px" }}>
                {team.class ?? ""}
              </td>
              {inputFields.map((field) => (
                <td key={field.id} className="fill" />
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
                  style={{
                    background: "#fef3c7",
                    fontWeight: 600,
                    fontSize: "10px",
                    padding: "3px 6px",
                  }}
                >
                  Arvestusvälised
                </td>
              </tr>
              {horsComp.map((team, index) => (
                <tr key={team.id}>
                  <td className="narrow text-center text-gray-400">
                    {inComp.length + index + 1}
                  </td>
                  <td
                    className="narrow text-center font-mono"
                    style={{ color: "#b45309" }}
                  >
                    {team.code}
                  </td>
                  <td style={{ fontSize: "11px", padding: "4px 6px", color: "#92400e" }}>
                    {team.name}
                  </td>
                  <td className="narrow text-center" style={{ fontSize: "10px" }}>
                    {team.class ?? ""}
                  </td>
                  {inputFields.map((field) => (
                    <td key={field.id} className="fill" />
                  ))}
                  {element.exceptions.length > 0 && <td className="fill" />}
                  <td className="fill" />
                </tr>
              ))}
            </>
          )}
        </tbody>
      </table>

      {element.exceptions.length > 0 && (
        <div className="text-xs">
          <p className="font-semibold text-gray-700 mb-1">Erandite koodid</p>
          <table className="border-collapse">
            <tbody>
              {element.exceptions.map((exception, index) => (
                <tr key={exception.id}>
                  <td className="pr-3 font-mono font-bold text-gray-700">{index + 1}</td>
                  <td className="pr-4 text-gray-700">{exception.label}</td>
                  <td className="font-mono text-red-600">
                    {isPlusMode
                      ? `−${Math.abs(exception.penalty)}`
                      : `+${Math.abs(exception.penalty)}`}
                    p
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-gray-400 mt-1">Kirjuta erandi number lahtrisse</p>
        </div>
      )}
    </section>
  )
}
