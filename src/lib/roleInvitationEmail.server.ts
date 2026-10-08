import "server-only"
import { resendConfig } from "@/lib/email.server"
import { notificationEmailHtml } from "@/lib/notifications"
import type { EditableCompetitionRole } from "@/lib/competitionRoleManagement"

const roleLabels: Record<EditableCompetitionRole, string> = {
  ORGANIZER: "korraldaja", JUDGE: "kohtunik", REPRESENTATIVE: "esindaja",
}

export async function sendRoleInvitationEmail(input: {
  email: string
  inviterName: string
  competitionName: string
  roles: EditableCompetitionRole[]
  token: string
}): Promise<"SENT" | "FAILED" | "NOT_CONFIGURED"> {
  const config = resendConfig()
  if (!config) return "NOT_CONFIGURED"
  const title = `Kutse võistlusele „${input.competitionName}”`
  const message = `${input.inviterName} soovib määrata sind võistlusel „${input.competitionName}” järgmistesse rollidesse: ${input.roles.map(role => roleLabels[role]).join(", ")}. Kutse vastuvõtmiseks ava link ja logi sisse või loo Matkamängu konto e-posti aadressiga ${input.email}. Kutse kehtib seitse päeva. Kui sa ei soovi kutset vastu võtta, võid seda e-kirja eirata.`
  const actionUrl = new URL(`/invitations/${input.token}`, process.env.AUTH_URL || "https://www.matkamang.ee").href
  try {
    const response = await fetch(`${config.baseUrl}/emails`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: config.from, to: [input.email], subject: title,
        text: `${message}\n\n${actionUrl}`,
        html: notificationEmailHtml({ title, message, actionUrl }),
      }),
      signal: AbortSignal.timeout(10_000),
    })
    return response.ok ? "SENT" : "FAILED"
  } catch {
    return "FAILED"
  }
}
