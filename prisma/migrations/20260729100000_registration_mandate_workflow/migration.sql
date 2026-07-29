ALTER TABLE "Team"
ADD COLUMN "workflowUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "registrationStatus" TEXT NOT NULL DEFAULT 'DRAFT',
ADD COLUMN "registrationSubmittedAt" TIMESTAMP(3),
ADD COLUMN "registrationReviewedAt" TIMESTAMP(3),
ADD COLUMN "registrationReviewNote" TEXT,
ADD COLUMN "mandateStatus" TEXT NOT NULL DEFAULT 'DRAFT',
ADD COLUMN "mandateSubmittedAt" TIMESTAMP(3),
ADD COLUMN "mandateReviewedAt" TIMESTAMP(3),
ADD COLUMN "mandateReviewNote" TEXT;

CREATE INDEX "Team_competitionId_registrationStatus_idx"
ON "Team"("competitionId", "registrationStatus");

CREATE INDEX "Team_competitionId_mandateStatus_idx"
ON "Team"("competitionId", "mandateStatus");
