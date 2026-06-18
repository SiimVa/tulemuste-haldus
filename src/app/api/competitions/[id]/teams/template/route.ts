import { NextResponse } from "next/server"
import * as XLSX from "xlsx"

export async function GET() {
  const wsData = [
    ["code", "name", "class", "members"],
    ["VK 1", "Näidis meeskond", "P", "Jaan Tamm; Mari Mägi"],
    ["VK 2", "Teine meeskond", "S", ""],
  ]

  const ws = XLSX.utils.aoa_to_sheet(wsData)
  ws["!cols"] = [{ wch: 10 }, { wch: 25 }, { wch: 8 }, { wch: 35 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Võistkonnad")

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="voistkonnad_mall.xlsx"',
    },
  })
}
