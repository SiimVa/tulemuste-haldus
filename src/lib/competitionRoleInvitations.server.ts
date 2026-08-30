import { createHash } from "node:crypto"
import { prisma } from "@/lib/prisma"

export function hashCompetitionRoleInvitationToken(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

export async function findCompetitionRoleInvitationByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) return null
  return prisma.competitionRoleInvitation.findUnique({
    where: { tokenHash: hashCompetitionRoleInvitationToken(token) },
    include: {
      competition: { select: { id: true, name: true } },
      invitedBy: { select: { id: true, name: true, role: true } },
    },
  })
}
