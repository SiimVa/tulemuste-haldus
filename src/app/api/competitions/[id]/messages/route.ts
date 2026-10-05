import { withSecurityRoute } from "@/lib/securityRoute.server"
import { setSecurityRecordCount } from "@/lib/security.server"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { canAccessCompetition } from "@/lib/competitionAccess"
import { MESSAGE_GROUPS, MESSAGE_ROLES, validateMessageInput, type MessageFilters } from "@/lib/competitionMessages"
import { MessageError, createCompetitionMessage, deliverCompetitionMessages, sendTestMessage } from "@/lib/competitionMessages.server"

const strings = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [])

function parseFilters(value: unknown): MessageFilters {
  const input = value && typeof value === "object" ? (value as Record<string, unknown>) : {}
  return {
    groups: strings(input.groups).filter((group) => (MESSAGE_GROUPS as readonly string[]).includes(group)),
    roles: strings(input.roles).filter((role) => (MESSAGE_ROLES as readonly string[]).includes(role)),
    classes: input.classes === null ? null : strings(input.classes),
  }
}

// Kiri registreerunud võistkondade esindajatele ja liikmetele või proovikiri
// saatjale endale. Saata saab võistluse korraldaja.
async function handlePOST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id: competitionId } = await params
  if (!await canAccessCompetition(competitionId, { id: session.user.id, role: session.user.role })) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  }
  const body = await req.json().catch(() => ({}))
  const inputError = validateMessageInput(body.subject, body.body)
  if (inputError) return NextResponse.json({ error: inputError }, { status: 400 })

  const [competition, sender] = await Promise.all([
    prisma.competition.findUnique({ where: { id: competitionId }, select: { name: true, personalDataPurgedAt: true } }),
    prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, email: true } }),
  ])
  if (!competition || !sender) return NextResponse.json({ error: "Võistlust ei leitud" }, { status: 404 })

  try {
    if (body.test === true) {
      await sendTestMessage({ competitionName: competition.name, subject: body.subject, body: body.body, to: sender.email })
      setSecurityRecordCount(1)
      return NextResponse.json({ test: true, to: sender.email })
    }
    if (competition.personalDataPurgedAt) {
      return NextResponse.json({ error: "Võistluse isikuandmed on kustutatud, kirju saata ei saa" }, { status: 409 })
    }
    const message = await createCompetitionMessage({
      competitionId,
      subject: body.subject,
      body: body.body,
      filters: parseFilters(body.filters),
      emails: strings(body.emails),
      sender,
    })
    setSecurityRecordCount(message.recipientCount)
    // Esimesed partiid kohe, ülejäänud saadab cron.
    const delivery = await deliverCompetitionMessages({ messageId: message.id, maxBatches: 5 })
    return NextResponse.json({ id: message.id, recipientCount: message.recipientCount, ...delivery }, { status: 201 })
  } catch (error) {
    if (error instanceof MessageError) return NextResponse.json({ error: error.message }, { status: error.status })
    throw error
  }
}

export const POST = withSecurityRoute("/api/competitions/[id]/messages", handlePOST)
