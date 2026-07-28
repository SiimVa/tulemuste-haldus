-- CreateEnum
CREATE TYPE "CompetitionRole" AS ENUM (
    'OWNER',
    'ORGANIZER',
    'JUDGE',
    'COMPETITOR',
    'REPRESENTATIVE',
    'VIEWER'
);

-- AlterTable
ALTER TABLE "User"
    ALTER COLUMN "passwordHash" DROP NOT NULL,
    ALTER COLUMN "role" SET DEFAULT 'USER',
    ADD COLUMN "emailVerified" TIMESTAMP(3),
    ADD COLUMN "image" TEXT;

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "CompetitionMemberRole" (
    "memberId" TEXT NOT NULL,
    "role" "CompetitionRole" NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitionMemberRole_pkey" PRIMARY KEY ("memberId", "role")
);

-- The same competitionId is stored on both sides so PostgreSQL can enforce
-- that a representative and their team belong to the same competition.
CREATE TABLE "TeamRepresentative" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamRepresentative_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key"
    ON "Account"("provider", "providerAccountId");
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

CREATE UNIQUE INDEX "VerificationToken_identifier_token_key"
    ON "VerificationToken"("identifier", "token");

CREATE INDEX "CompetitionMemberRole_role_idx" ON "CompetitionMemberRole"("role");

CREATE UNIQUE INDEX "Team_id_competitionId_key" ON "Team"("id", "competitionId");
CREATE UNIQUE INDEX "CompetitionMember_id_competitionId_key"
    ON "CompetitionMember"("id", "competitionId");

CREATE UNIQUE INDEX "TeamRepresentative_teamId_key" ON "TeamRepresentative"("teamId");
CREATE UNIQUE INDEX "TeamRepresentative_teamId_competitionId_key"
    ON "TeamRepresentative"("teamId", "competitionId");
CREATE INDEX "TeamRepresentative_memberId_idx" ON "TeamRepresentative"("memberId");

-- Backfill every competition owner into the membership model. Deterministic
-- ids make this migration safe to reason about and avoid application-level ids.
INSERT INTO "CompetitionMember" ("id", "competitionId", "userId", "addedAt")
SELECT
    'legacy_owner_' || md5(c."id" || ':' || c."organizerId"),
    c."id",
    c."organizerId",
    c."createdAt"
FROM "Competition" c
ON CONFLICT ("competitionId", "userId") DO NOTHING;

-- Existing co-organizers retain their current access, while competition owners
-- receive the explicit OWNER role.
INSERT INTO "CompetitionMemberRole" ("memberId", "role", "addedAt")
SELECT
    cm."id",
    CASE
        WHEN c."organizerId" = cm."userId"
            THEN 'OWNER'::"CompetitionRole"
        ELSE 'ORGANIZER'::"CompetitionRole"
    END,
    cm."addedAt"
FROM "CompetitionMember" cm
JOIN "Competition" c ON c."id" = cm."competitionId"
ON CONFLICT ("memberId", "role") DO NOTHING;

-- AddForeignKey
ALTER TABLE "Account"
    ADD CONSTRAINT "Account_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Session"
    ADD CONSTRAINT "Session_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CompetitionMemberRole"
    ADD CONSTRAINT "CompetitionMemberRole_memberId_fkey"
    FOREIGN KEY ("memberId") REFERENCES "CompetitionMember"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TeamRepresentative"
    ADD CONSTRAINT "TeamRepresentative_teamId_competitionId_fkey"
    FOREIGN KEY ("teamId", "competitionId")
    REFERENCES "Team"("id", "competitionId")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TeamRepresentative"
    ADD CONSTRAINT "TeamRepresentative_memberId_competitionId_fkey"
    FOREIGN KEY ("memberId", "competitionId")
    REFERENCES "CompetitionMember"("id", "competitionId")
    ON DELETE CASCADE ON UPDATE CASCADE;
