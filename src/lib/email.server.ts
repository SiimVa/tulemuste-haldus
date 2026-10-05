import "server-only"

// Resendi seadistus. RESEND_API_URL on vaikimisi Resendi aadress; testides
// suunatakse saatmine kohalikku võltsserverisse.
export function resendConfig(): { apiKey: string; from: string; baseUrl: string } | null {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM
  if (!apiKey || !from) return null
  return { apiKey, from, baseUrl: (process.env.RESEND_API_URL || "https://api.resend.com").replace(/\/$/, "") }
}
