-- Separate the original submitter from the person managing the application.
ALTER TABLE "RegistrationApplication" ADD COLUMN "representativeId" TEXT;
UPDATE "RegistrationApplication" SET "representativeId" = "submittedById"
WHERE "pendingRepresentativeEmail" IS NULL;
-- Recover the original submitter only when an explicit creation event exists.
UPDATE "RegistrationApplication" a SET "submittedById" = e."actorId"
FROM (SELECT DISTINCT ON ("applicationId") "applicationId", "actorId"
      FROM "RegistrationApplicationEvent"
      WHERE "fromStatus" IS NULL AND "actorId" IS NOT NULL
      ORDER BY "applicationId", "createdAt", "id") e
WHERE a.id = e."applicationId";
ALTER TABLE "RegistrationApplication" ADD CONSTRAINT "RegistrationApplication_representativeId_fkey"
FOREIGN KEY ("representativeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "RegistrationApplication_representativeId_idx" ON "RegistrationApplication"("representativeId");
-- The existing outbox also delivers email to representatives awaiting an account.
ALTER TABLE "Notification" ALTER COLUMN "userId" DROP NOT NULL;

-- For finalized applications the actual team assignment takes precedence.
UPDATE "RegistrationApplication" a
SET "representativeId" = m."userId",
    "pendingRepresentativeEmail" = t."pendingRepresentativeEmail",
    "pendingRepresentativeName" = t."pendingRepresentativeName"
FROM "Team" t
LEFT JOIN "TeamRepresentative" r ON r."teamId" = t.id
LEFT JOIN "CompetitionMember" m ON m.id = r."memberId"
WHERE a."teamId" = t.id;
