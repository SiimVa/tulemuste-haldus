type HeadingCompetition = {
  name: string
  date: Date | null
  endDate: Date | null
  location: string | null
}

type HeadingElement = {
  code: string
  name: string
}

export function ProtocolDocumentHeading({
  competition,
  element,
  detail,
  pageNumber,
  pageCount,
}: {
  competition: HeadingCompetition
  element: HeadingElement
  detail?: string
  pageNumber?: number
  pageCount?: number
}) {
  const dateStr = competition.date
    ? competition.date.toLocaleDateString("et-EE")
    : ""
  const endDateStr =
    competition.endDate &&
    competition.endDate.toDateString() !== competition.date?.toDateString()
      ? ` – ${competition.endDate.toLocaleDateString("et-EE")}`
      : ""

  return (
    <div className="flex items-start justify-between text-left">
      <div>
        <p className="text-lg font-bold text-gray-900">{competition.name}</p>
        <p className="text-sm font-normal text-gray-600">
          {dateStr}
          {endDateStr}
          {competition.location && ` · ${competition.location}`}
        </p>
      </div>
      <div className="text-right">
        <p className="text-xl font-bold text-gray-900 font-mono">{element.code}</p>
        <p className="text-sm font-semibold text-gray-700">{element.name}</p>
        {detail && <p className="text-xs font-normal text-gray-500">{detail}</p>}
        {pageNumber !== undefined && pageCount !== undefined && (
          <p className="text-xs font-normal text-gray-400">
            {pageNumber} / {pageCount}
          </p>
        )}
      </div>
    </div>
  )
}
