ALTER TABLE "RegistrationApplication"
ADD COLUMN "waitlistPosition" INTEGER;

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "competitionId"
      ORDER BY "submittedAt" ASC NULLS LAST, "createdAt" ASC, "id" ASC
    ) AS "position"
  FROM "RegistrationApplication"
  WHERE "status" = 'WAITLISTED'
)
UPDATE "RegistrationApplication" AS application
SET "waitlistPosition" = ranked."position"::INTEGER
FROM ranked
WHERE application."id" = ranked."id";

CREATE INDEX "RegistrationApplication_waitlist_order_idx"
ON "RegistrationApplication"("competitionId", "status", "waitlistPosition");
