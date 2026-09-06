ALTER TABLE "Competition"
ADD COLUMN "analysisAccessMode" TEXT NOT NULL DEFAULT 'PUBLIC',
ADD COLUMN "analysisTokenHash" TEXT;

ALTER TABLE "Competition"
ADD CONSTRAINT "Competition_analysisAccessMode_check"
CHECK ("analysisAccessMode" IN ('PUBLIC', 'LINK_ONLY', 'PRIVATE'));

CREATE UNIQUE INDEX "Competition_analysisTokenHash_key"
ON "Competition"("analysisTokenHash");
