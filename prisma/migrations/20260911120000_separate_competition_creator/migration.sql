ALTER TABLE "Competition"
ADD COLUMN "createdById" TEXT;

UPDATE "Competition"
SET "createdById" = "organizerId";

ALTER TABLE "Competition"
ALTER COLUMN "createdById" SET NOT NULL,
ALTER COLUMN "organizerId" DROP NOT NULL;

ALTER TABLE "Competition"
DROP CONSTRAINT "Competition_organizerId_fkey";

ALTER TABLE "Competition"
ADD CONSTRAINT "Competition_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Competition"
ADD CONSTRAINT "Competition_organizerId_fkey"
FOREIGN KEY ("organizerId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Competition_createdById_idx" ON "Competition"("createdById");
CREATE INDEX "Competition_organizerId_idx" ON "Competition"("organizerId");
