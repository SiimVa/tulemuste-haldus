-- Existing judge memberships used to grant access to every scoring element.
-- Keep that access while moving to explicit, element-level assignments.
CREATE UNIQUE INDEX "ScoringElement_id_competitionId_key"
ON "ScoringElement"("id", "competitionId");

CREATE TABLE "JudgeElementAssignment" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "elementId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JudgeElementAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JudgeElementAssignment_memberId_elementId_key"
ON "JudgeElementAssignment"("memberId", "elementId");

CREATE INDEX "JudgeElementAssignment_competitionId_memberId_idx"
ON "JudgeElementAssignment"("competitionId", "memberId");

CREATE INDEX "JudgeElementAssignment_elementId_idx"
ON "JudgeElementAssignment"("elementId");

ALTER TABLE "JudgeElementAssignment"
ADD CONSTRAINT "JudgeElementAssignment_competitionId_fkey"
FOREIGN KEY ("competitionId") REFERENCES "Competition"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JudgeElementAssignment"
ADD CONSTRAINT "JudgeElementAssignment_memberId_competitionId_fkey"
FOREIGN KEY ("memberId", "competitionId")
REFERENCES "CompetitionMember"("id", "competitionId")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JudgeElementAssignment"
ADD CONSTRAINT "JudgeElementAssignment_elementId_competitionId_fkey"
FOREIGN KEY ("elementId", "competitionId")
REFERENCES "ScoringElement"("id", "competitionId")
ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "JudgeElementAssignment" (
    "id",
    "competitionId",
    "memberId",
    "elementId"
)
SELECT
    CONCAT('legacy_', MD5(role."memberId" || ':' || element."id")),
    member."competitionId",
    member."id",
    element."id"
FROM "CompetitionMemberRole" role
JOIN "CompetitionMember" member ON member."id" = role."memberId"
JOIN "ScoringElement" element
  ON element."competitionId" = member."competitionId"
WHERE role."role" = 'JUDGE';
