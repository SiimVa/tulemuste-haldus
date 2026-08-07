ALTER TABLE "Competition"
ADD COLUMN "personalDataRetentionDays" INTEGER NOT NULL DEFAULT 90,
ADD COLUMN "personalDataPurgedAt" TIMESTAMP(3);

ALTER TABLE "CompetitionFormField"
ADD COLUMN "purgeAfterCompetition" BOOLEAN NOT NULL DEFAULT false;

UPDATE "CompetitionFormField"
SET "purgeAfterCompetition" = true
WHERE "type" IN ('EMAIL', 'PHONE')
   OR (
     "type" = 'MEMBER_LIST'
     AND (
       "memberFields" LIKE '%"email"%'
       OR "memberFields" LIKE '%"phone"%'
       OR "memberFields" LIKE '%"birthDate"%'
     )
   );

ALTER TABLE "Competition"
ADD CONSTRAINT "Competition_personalDataRetentionDays_check"
CHECK ("personalDataRetentionDays" BETWEEN 1 AND 90);
