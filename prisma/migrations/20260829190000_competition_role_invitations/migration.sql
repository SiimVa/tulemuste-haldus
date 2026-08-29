CREATE TABLE "CompetitionRoleInvitation" (
  "id" TEXT NOT NULL,
  "competitionId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "roles" TEXT NOT NULL,
  "elementIds" TEXT NOT NULL DEFAULT '[]',
  "teamIds" TEXT NOT NULL DEFAULT '[]',
  "invitedById" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "acceptedById" TEXT,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CompetitionRoleInvitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompetitionRoleInvitation_tokenHash_key"
ON "CompetitionRoleInvitation"("tokenHash");

CREATE UNIQUE INDEX "CompetitionRoleInvitation_competitionId_email_key"
ON "CompetitionRoleInvitation"("competitionId", "email");

CREATE INDEX "CompetitionRoleInvitation_email_expiresAt_idx"
ON "CompetitionRoleInvitation"("email", "expiresAt");

CREATE INDEX "CompetitionRoleInvitation_competitionId_acceptedAt_revokedAt_idx"
ON "CompetitionRoleInvitation"("competitionId", "acceptedAt", "revokedAt");

ALTER TABLE "CompetitionRoleInvitation"
ADD CONSTRAINT "CompetitionRoleInvitation_competitionId_fkey"
FOREIGN KEY ("competitionId") REFERENCES "Competition"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CompetitionRoleInvitation"
ADD CONSTRAINT "CompetitionRoleInvitation_invitedById_fkey"
FOREIGN KEY ("invitedById") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CompetitionRoleInvitation"
ADD CONSTRAINT "CompetitionRoleInvitation_acceptedById_fkey"
FOREIGN KEY ("acceptedById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
