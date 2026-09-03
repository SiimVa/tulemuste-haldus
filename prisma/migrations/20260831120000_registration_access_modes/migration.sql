ALTER TABLE "Competition"
ADD COLUMN "registrationAccessMode" TEXT NOT NULL DEFAULT 'PRIVATE',
ADD COLUMN "registrationTokenHash" TEXT;

UPDATE "Competition"
SET "registrationAccessMode" = CASE
  WHEN "isPublic" THEN 'PUBLIC'
  ELSE 'PRIVATE'
END;

ALTER TABLE "Competition"
ADD CONSTRAINT "Competition_registrationAccessMode_check"
CHECK ("registrationAccessMode" IN ('PUBLIC', 'LINK_ONLY', 'PRIVATE'));

CREATE UNIQUE INDEX "Competition_registrationTokenHash_key"
ON "Competition"("registrationTokenHash");
