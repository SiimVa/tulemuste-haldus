-- AlterTable
ALTER TABLE "Competition"
ADD COLUMN "representativeRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "captainRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "teamMemberRoles" TEXT NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "TeamMember"
ADD COLUMN "isCaptain" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "assignmentRole" TEXT;

-- CreateIndex
CREATE INDEX "TeamMember_teamId_isCaptain_idx"
ON "TeamMember"("teamId", "isCaptain");
