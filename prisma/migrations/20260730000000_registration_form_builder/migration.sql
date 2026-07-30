CREATE TABLE "CompetitionFormField" (
  "id" TEXT NOT NULL,
  "competitionId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "helpText" TEXT,
  "type" TEXT NOT NULL,
  "semanticKey" TEXT,
  "options" TEXT NOT NULL DEFAULT '[]',
  "memberFields" TEXT NOT NULL DEFAULT '["name"]',
  "showInRegistration" BOOLEAN NOT NULL DEFAULT true,
  "requiredInRegistration" BOOLEAN NOT NULL DEFAULT false,
  "showInMandate" BOOLEAN NOT NULL DEFAULT true,
  "requiredInMandate" BOOLEAN NOT NULL DEFAULT false,
  "editableInMandate" BOOLEAN NOT NULL DEFAULT true,
  "conditionFieldKey" TEXT,
  "conditionOperator" TEXT,
  "conditionValue" TEXT,
  "order" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompetitionFormField_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RegistrationApplicationFieldValue" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "fieldId" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RegistrationApplicationFieldValue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TeamFormFieldValue" (
  "id" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "fieldId" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TeamFormFieldValue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompetitionFormField_competitionId_key_key"
ON "CompetitionFormField"("competitionId", "key");

CREATE UNIQUE INDEX "CompetitionFormField_competitionId_semanticKey_key"
ON "CompetitionFormField"("competitionId", "semanticKey");

CREATE INDEX "CompetitionFormField_competitionId_isActive_order_idx"
ON "CompetitionFormField"("competitionId", "isActive", "order");

CREATE UNIQUE INDEX "RegistrationApplicationFieldValue_applicationId_fieldId_key"
ON "RegistrationApplicationFieldValue"("applicationId", "fieldId");

CREATE INDEX "RegistrationApplicationFieldValue_fieldId_idx"
ON "RegistrationApplicationFieldValue"("fieldId");

CREATE UNIQUE INDEX "TeamFormFieldValue_teamId_fieldId_key"
ON "TeamFormFieldValue"("teamId", "fieldId");

CREATE INDEX "TeamFormFieldValue_fieldId_idx"
ON "TeamFormFieldValue"("fieldId");

ALTER TABLE "CompetitionFormField"
ADD CONSTRAINT "CompetitionFormField_competitionId_fkey"
FOREIGN KEY ("competitionId") REFERENCES "Competition"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RegistrationApplicationFieldValue"
ADD CONSTRAINT "RegistrationApplicationFieldValue_applicationId_fkey"
FOREIGN KEY ("applicationId") REFERENCES "RegistrationApplication"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RegistrationApplicationFieldValue"
ADD CONSTRAINT "RegistrationApplicationFieldValue_fieldId_fkey"
FOREIGN KEY ("fieldId") REFERENCES "CompetitionFormField"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TeamFormFieldValue"
ADD CONSTRAINT "TeamFormFieldValue_teamId_fkey"
FOREIGN KEY ("teamId") REFERENCES "Team"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TeamFormFieldValue"
ADD CONSTRAINT "TeamFormFieldValue_fieldId_fkey"
FOREIGN KEY ("fieldId") REFERENCES "CompetitionFormField"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
