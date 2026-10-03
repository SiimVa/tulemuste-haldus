// Asukohtade Exceli malli veerud ja impordi rea tõlgendamine.

export const MAP_TEMPLATE_HEADERS = ["Tähis", "Nimi", "Tüüp", "MGRS"] as const
export const MARKER_TYPE_LABEL = "Märk"

export const ELEMENT_TYPE_SHORT_LABELS: Record<string, string> = {
  CHECKPOINT: "KP",
  PENALTY_BOX: "PK",
  COUNTER_ACTION: "VT",
  EQUIPMENT_CHECK: "VA",
  LATENESS: "HL",
  ABANDONMENT: "KT",
  OTHER: "MU",
  MANUAL: "KS",
}

export type MapImportRow =
  | { row: number; kind: "ELEMENT"; code: string; mgrs: string }
  | { row: number; kind: "MARKER"; label: string; mgrs: string }

const normalize = (value: unknown) => String(value ?? "").trim()
const key = (value: unknown) => normalize(value).toLocaleLowerCase("et")

// Leiab päiserea (Tähis/Nimi/Tüüp/MGRS) ja tagastab andmeread. Real ilma
// MGRS-ita pole muudatust ning see jäetakse vahele.
export function parseMapImportRows(rows: unknown[][]): { rows: MapImportRow[]; error: string | null } {
  const headerIndex = rows.findIndex((row) => row.some((cell) => key(cell) === "mgrs"))
  if (headerIndex < 0) return { rows: [], error: "Failist ei leitud veergu „MGRS”." }
  const header = rows[headerIndex].map(key)
  const column = (name: string) => header.indexOf(name.toLocaleLowerCase("et"))
  const codeColumn = column("Tähis"), nameColumn = column("Nimi"), typeColumn = column("Tüüp"), mgrsColumn = column("MGRS")
  if (codeColumn < 0 && nameColumn < 0) return { rows: [], error: "Failist ei leitud veergu „Tähis”." }
  const result: MapImportRow[] = []
  rows.slice(headerIndex + 1).forEach((row, index) => {
    const mgrs = normalize(row[mgrsColumn])
    if (!mgrs) return
    const rowNumber = headerIndex + index + 2
    if (typeColumn >= 0 && key(row[typeColumn]) === key(MARKER_TYPE_LABEL)) {
      result.push({ row: rowNumber, kind: "MARKER", label: normalize(row[nameColumn]), mgrs })
    } else {
      result.push({ row: rowNumber, kind: "ELEMENT", code: normalize(row[codeColumn]), mgrs })
    }
  })
  return { rows: result, error: null }
}
