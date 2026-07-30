ALTER TABLE "Competition"
ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "registrationOpensAt" TIMESTAMP(3),
ADD COLUMN "registrationClosesAt" TIMESTAMP(3),
ADD COLUMN "registrationOverride" TEXT NOT NULL DEFAULT 'AUTO',
ADD COLUMN "registrationFinalizedAt" TIMESTAMP(3),
ADD COLUMN "registrationCapacity" INTEGER,
ADD COLUMN "mandateOpensAt" TIMESTAMP(3),
ADD COLUMN "mandateClosesAt" TIMESTAMP(3),
ADD COLUMN "mandateOverride" TEXT NOT NULL DEFAULT 'AUTO',
ADD COLUMN "mandateFinalizedAt" TIMESTAMP(3);

CREATE TABLE "CompetitionClass" (
  "id" TEXT NOT NULL,
  "competitionId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompetitionClass_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RegistrationApplication" (
  "id" TEXT NOT NULL,
  "competitionId" TEXT NOT NULL,
  "submittedById" TEXT NOT NULL,
  "teamName" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "submittedAt" TIMESTAMP(3),
  "decidedAt" TIMESTAMP(3),
  "withdrawnAt" TIMESTAMP(3),
  "teamId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RegistrationApplication_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RegistrationApplicationEvent" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT NOT NULL,
  "actorId" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RegistrationApplicationEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompetitionPhaseEvent" (
  "id" TEXT NOT NULL,
  "competitionId" TEXT NOT NULL,
  "phase" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompetitionPhaseEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompetitionClass_competitionId_name_key"
ON "CompetitionClass"("competitionId", "name");

CREATE INDEX "CompetitionClass_competitionId_isActive_order_idx"
ON "CompetitionClass"("competitionId", "isActive", "order");

CREATE UNIQUE INDEX "RegistrationApplication_teamId_key"
ON "RegistrationApplication"("teamId");

CREATE INDEX "RegistrationApplication_competitionId_status_submittedAt_idx"
ON "RegistrationApplication"("competitionId", "status", "submittedAt");

CREATE INDEX "RegistrationApplication_submittedById_createdAt_idx"
ON "RegistrationApplication"("submittedById", "createdAt");

CREATE INDEX "RegistrationApplicationEvent_applicationId_createdAt_idx"
ON "RegistrationApplicationEvent"("applicationId", "createdAt");

CREATE INDEX "CompetitionPhaseEvent_competitionId_phase_createdAt_idx"
ON "CompetitionPhaseEvent"("competitionId", "phase", "createdAt");

ALTER TABLE "CompetitionClass"
ADD CONSTRAINT "CompetitionClass_competitionId_fkey"
FOREIGN KEY ("competitionId") REFERENCES "Competition"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RegistrationApplication"
ADD CONSTRAINT "RegistrationApplication_competitionId_fkey"
FOREIGN KEY ("competitionId") REFERENCES "Competition"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RegistrationApplication"
ADD CONSTRAINT "RegistrationApplication_submittedById_fkey"
FOREIGN KEY ("submittedById") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RegistrationApplication"
ADD CONSTRAINT "RegistrationApplication_classId_fkey"
FOREIGN KEY ("classId") REFERENCES "CompetitionClass"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RegistrationApplication"
ADD CONSTRAINT "RegistrationApplication_teamId_fkey"
FOREIGN KEY ("teamId") REFERENCES "Team"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RegistrationApplicationEvent"
ADD CONSTRAINT "RegistrationApplicationEvent_applicationId_fkey"
FOREIGN KEY ("applicationId") REFERENCES "RegistrationApplication"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RegistrationApplicationEvent"
ADD CONSTRAINT "RegistrationApplicationEvent_actorId_fkey"
FOREIGN KEY ("actorId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CompetitionPhaseEvent"
ADD CONSTRAINT "CompetitionPhaseEvent_competitionId_fkey"
FOREIGN KEY ("competitionId") REFERENCES "Competition"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CompetitionPhaseEvent"
ADD CONSTRAINT "CompetitionPhaseEvent_actorId_fkey"
FOREIGN KEY ("actorId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
