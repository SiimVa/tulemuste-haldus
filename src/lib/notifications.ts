export type NotificationContent = {
  type: string
  title: string
  message: string
}

function appendNote(message: string, note?: string | null) {
  const normalized = note?.trim()
  return normalized ? `${message} Korraldaja märkus: ${normalized}` : message
}

export function registrationNotificationContent({
  status,
  competitionName,
  teamName,
  waitlistPosition,
  note,
}: {
  status: string
  competitionName: string
  teamName: string
  waitlistPosition?: number | null
  note?: string | null
}): NotificationContent | null {
  if (status === "CONFIRMED") {
    return {
      type: "REGISTRATION_CONFIRMED",
      title: "Registreering kinnitatud",
      message: `Võistkonna „${teamName}” koht võistlusel „${competitionName}” on kinnitatud.`,
    }
  }
  if (status === "WAITLISTED") {
    const position = waitlistPosition
      ? ` Ootenimekirja koht on ${waitlistPosition}.`
      : ""
    return {
      type: "REGISTRATION_WAITLISTED",
      title: "Võistkond on ootenimekirjas",
      message: `Võistkond „${teamName}” lisati võistluse „${competitionName}” ootenimekirja.${position}`,
    }
  }
  if (status === "PENDING_REVIEW" || status === "SUBMITTED") {
    return {
      type: "REGISTRATION_SUBMITTED",
      title: "Registreering esitatud",
      message: `Võistkonna „${teamName}” registreering võistlusele „${competitionName}” ootab korraldaja otsust.`,
    }
  }
  if (status === "CHANGES_REQUESTED") {
    return {
      type: "REGISTRATION_CHANGES_REQUESTED",
      title: "Registreering vajab täiendamist",
      message: appendNote(
        `Võistkonna „${teamName}” registreering võistlusele „${competitionName}” saadeti parandamisele.`,
        note
      ),
    }
  }
  if (status === "REJECTED") {
    return {
      type: "REGISTRATION_REJECTED",
      title: "Registreering lükati tagasi",
      message: appendNote(
        `Võistkonna „${teamName}” registreering võistlusele „${competitionName}” lükati tagasi.`,
        note
      ),
    }
  }
  return null
}

export function teamWorkflowNotificationContent({
  phase,
  status,
  competitionName,
  teamName,
  note,
}: {
  phase: "REGISTRATION" | "MANDATE"
  status: string
  competitionName: string
  teamName: string
  note?: string | null
}): NotificationContent | null {
  if (phase === "REGISTRATION") {
    if (status === "APPROVED") {
      return {
        type: "REGISTRATION_CONFIRMED",
        title: "Registreering kinnitatud",
        message: `Võistkonna „${teamName}” registreering võistlusele „${competitionName}” on kinnitatud.`,
      }
    }
    if (status === "SUBMITTED") {
      return {
        type: "REGISTRATION_SUBMITTED",
        title: "Registreering esitatud",
        message: `Võistkonna „${teamName}” registreering võistlusele „${competitionName}” ootab korraldaja otsust.`,
      }
    }
    if (status === "CHANGES_REQUESTED") {
      return {
        type: "REGISTRATION_CHANGES_REQUESTED",
        title: "Registreering vajab täiendamist",
        message: appendNote(
          `Võistkonna „${teamName}” registreering võistlusele „${competitionName}” saadeti parandamisele.`,
          note
        ),
      }
    }
    return null
  }

  if (status === "APPROVED") {
    return {
      type: "MANDATE_APPROVED",
      title: "Mandaat kinnitatud",
      message: `Võistkonna „${teamName}” mandaat võistlusele „${competitionName}” on kinnitatud.`,
    }
  }
  if (status === "SUBMITTED") {
    return {
      type: "MANDATE_SUBMITTED",
      title: "Mandaat esitatud",
      message: `Võistkonna „${teamName}” mandaat võistlusele „${competitionName}” ootab korraldaja otsust.`,
    }
  }
  if (status === "CHANGES_REQUESTED") {
    return {
      type: "MANDATE_CHANGES_REQUESTED",
      title: "Mandaat vajab täiendamist",
      message: appendNote(
        `Võistkonna „${teamName}” mandaat võistlusele „${competitionName}” saadeti parandamisele.`,
        note
      ),
    }
  }
  return null
}

export function mandateOpenedNotificationContent({
  competitionName,
  teamName,
}: {
  competitionName: string
  teamName: string
}): NotificationContent {
  return {
    type: "MANDATE_OPENED",
    title: "Mandaat on avatud",
    message: `Võistkonna „${teamName}” mandaat võistlusele „${competitionName}” on täitmiseks avatud.`,
  }
}

export function competitionStartedNotificationContent({
  competitionName,
  teamName,
}: {
  competitionName: string
  teamName: string
}): NotificationContent {
  return {
    type: "COMPETITION_STARTED",
    title: "Võistlus on alanud",
    message: `Võistlus „${competitionName}” on alanud. Võistkonna „${teamName}” tulemused on nüüd töölaual nähtavad.`,
  }
}

export function escapeNotificationHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

export function notificationEmailHtml({
  title,
  message,
  actionUrl,
}: {
  title: string
  message: string
  actionUrl?: string | null
}) {
  const action = actionUrl
    ? `<p style="margin:24px 0 0"><a href="${escapeNotificationHtml(actionUrl)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600">Ava tulemuste haldus</a></p>`
    : ""
  return `<!doctype html><html lang="et"><body style="margin:0;background:#f9fafb;font-family:Arial,sans-serif;color:#111827"><div style="max-width:600px;margin:0 auto;padding:32px 20px"><div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:28px"><h1 style="font-size:22px;margin:0 0 16px">${escapeNotificationHtml(title)}</h1><p style="font-size:16px;line-height:1.6;margin:0">${escapeNotificationHtml(message)}</p>${action}</div><p style="font-size:12px;color:#6b7280;margin:16px 4px">Automaatne teavitus tulemuste halduse rakendusest.</p></div></body></html>`
}
