import QRCode from "qrcode"

export const MAX_QR_CODES_PER_PAGE = 12
export type QrAudience = "ALL" | "JUDGE" | "ATHLETE"

export function parseQrOptions(params: URLSearchParams) {
  const audience = params.get("audience") ?? "ALL"
  const perPage = Number(params.get("perPage") ?? "6")
  if (!["ALL", "JUDGE", "ATHLETE"].includes(audience) ||
      !Number.isInteger(perPage) || perPage < 1 || perPage > MAX_QR_CODES_PER_PAGE) return null
  return { audience: audience as QrAudience, perPage }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!)
}

export async function renderAccessQrExport(
  competitionName: string,
  entries: { name: string; role: string; subject: string; link: string }[],
  perPage: number,
) {
  if (!Number.isInteger(perPage) || perPage < 1 || perPage > MAX_QR_CODES_PER_PAGE) {
    throw new Error("Vigane QR-koodide arv")
  }
  const columns = perPage === 1 ? 1 : perPage <= 8 ? 2 : 3
  const rows = Math.ceil(perPage / columns)
  const cards = await Promise.all(entries.map(async entry => {
    const svg = await QRCode.toString(entry.link, { type: "svg", errorCorrectionLevel: "M", margin: 4 })
    return `<article><div class="role">${escapeHtml(entry.role)}</div><h2>${escapeHtml(entry.name)}</h2><div class="subject">${escapeHtml(entry.subject)}</div>${svg}<a href="${escapeHtml(entry.link)}">Ava juurdepääsulink</a></article>`
  }))
  const pages: string[] = []
  for (let index = 0; index < cards.length; index += perPage) {
    pages.push(`<section class="page"><header>${escapeHtml(competitionName)} · Juurdepääsulingid <span>${pages.length + 1} / ${Math.ceil(cards.length / perPage)}</span></header><div class="grid">${cards.slice(index, index + perPage).join("")}</div></section>`)
  }
  return `<!doctype html><html lang="et"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><title>${escapeHtml(competitionName)} — QR-koodid</title><style>
  *{box-sizing:border-box}body{margin:0;background:#e5e7eb;color:#111;font-family:Arial,sans-serif}.toolbar{padding:16px;text-align:center}.toolbar p{margin:8px}button{padding:10px 20px;cursor:pointer}.page{width:190mm;height:276mm;margin:16px auto;padding:0;background:white;break-after:page;page-break-after:always}.page:last-child{break-after:auto;page-break-after:auto}header{height:12mm;font-size:12px;padding:3mm;display:flex;justify-content:space-between;gap:8mm;overflow:hidden}header span{white-space:nowrap}.grid{height:264mm;display:grid;grid-template-columns:repeat(${columns},minmax(0,1fr));grid-template-rows:repeat(${rows},minmax(0,1fr))}article{min-height:0;min-width:0;border:1px dashed #aaa;padding:3mm;display:flex;flex-direction:column;align-items:center;text-align:center;break-inside:avoid;overflow:hidden}.role{font-size:10px}h2{font-size:13px;margin:2mm 0 1mm;overflow-wrap:anywhere;max-width:100%}.subject{font-size:10px;overflow-wrap:anywhere;max-width:100%}svg{display:block;width:100%;max-width:65mm;flex:1;min-height:32mm;margin:1mm 0}a{font-size:9px;color:#111} @page{size:A4 portrait;margin:10mm} @media print{body{background:white}.toolbar{display:none}.page{margin:0}}
  </style></head><body><div class="toolbar"><button onclick="window.print()">Prindi / salvesta PDF</button><p>${entries.length} QR-koodi · ${perPage} koodi lehel</p><p>Prindi A4 paberile, mõõtkava 100%. Lülita brauseri päised ja jalused välja.</p></div>${pages.join("")}</body></html>`
}
