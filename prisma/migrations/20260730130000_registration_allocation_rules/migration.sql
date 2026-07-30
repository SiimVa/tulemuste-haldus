ALTER TABLE "Competition"
ADD COLUMN "registrationClassBalanceMode" TEXT NOT NULL DEFAULT 'OFF';

ALTER TABLE "RegistrationApplication"
ADD COLUMN "allocationReason" TEXT;

CREATE TABLE "RegistrationAllocationRule" (
  "id" TEXT NOT NULL,
  "competitionId" TEXT NOT NULL,
  "fieldId" TEXT,
  "label" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "values" TEXT NOT NULL DEFAULT '[]',
  "quota" INTEGER,
  "order" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RegistrationAllocationRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RegistrationAllocationRule_competitionId_isActive_order_idx"
ON "RegistrationAllocationRule"("competitionId", "isActive", "order");

CREATE INDEX "RegistrationAllocationRule_fieldId_idx"
ON "RegistrationAllocationRule"("fieldId");

ALTER TABLE "RegistrationAllocationRule"
ADD CONSTRAINT "RegistrationAllocationRule_competitionId_fkey"
FOREIGN KEY ("competitionId") REFERENCES "Competition"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RegistrationAllocationRule"
ADD CONSTRAINT "RegistrationAllocationRule_fieldId_fkey"
FOREIGN KEY ("fieldId") REFERENCES "CompetitionFormField"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
