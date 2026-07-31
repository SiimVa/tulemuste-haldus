ALTER TABLE "TeamMember"
ADD COLUMN "competitionId" TEXT,
ADD COLUMN "userId" TEXT;

UPDATE "TeamMember" AS member
SET "competitionId" = team."competitionId"
FROM "Team" AS team
WHERE member."teamId" = team."id";

ALTER TABLE "TeamMember"
ALTER COLUMN "competitionId" SET NOT NULL;

ALTER TABLE "TeamMember"
DROP CONSTRAINT "TeamMember_teamId_fkey";

CREATE UNIQUE INDEX "TeamMember_competitionId_userId_key"
ON "TeamMember"("competitionId", "userId");

CREATE INDEX "TeamMember_teamId_idx" ON "TeamMember"("teamId");
CREATE INDEX "TeamMember_userId_idx" ON "TeamMember"("userId");

ALTER TABLE "TeamMember"
ADD CONSTRAINT "TeamMember_teamId_competitionId_fkey"
FOREIGN KEY ("teamId", "competitionId") REFERENCES "Team"("id", "competitionId")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TeamMember"
ADD CONSTRAINT "TeamMember_competitionId_fkey"
FOREIGN KEY ("competitionId") REFERENCES "Competition"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TeamMember"
ADD CONSTRAINT "TeamMember_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
