ALTER TABLE "RegistrationApplication"
  ADD COLUMN "pendingRepresentativeEmail" TEXT,
  ADD COLUMN "pendingRepresentativeName" TEXT;
ALTER TABLE "Team"
  ADD COLUMN "pendingRepresentativeEmail" TEXT,
  ADD COLUMN "pendingRepresentativeName" TEXT;
CREATE INDEX "RegistrationApplication_pendingRepresentativeEmail_idx" ON "RegistrationApplication"("pendingRepresentativeEmail");
CREATE INDEX "Team_pendingRepresentativeEmail_idx" ON "Team"("pendingRepresentativeEmail");
