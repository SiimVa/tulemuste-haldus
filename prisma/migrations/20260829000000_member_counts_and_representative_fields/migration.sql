ALTER TABLE "CompetitionFormField"
ADD COLUMN "memberMinCount" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "memberMaxCount" INTEGER;

ALTER TABLE "CompetitionFormField"
ADD CONSTRAINT "CompetitionFormField_memberMinCount_check"
CHECK ("memberMinCount" >= 1 AND "memberMinCount" <= 500);

ALTER TABLE "CompetitionFormField"
ADD CONSTRAINT "CompetitionFormField_memberMaxCount_check"
CHECK (
  "memberMaxCount" IS NULL OR
  ("memberMaxCount" >= "memberMinCount" AND "memberMaxCount" <= 500)
);

-- Kohustusliku esindajaga olemasolevad võistlused saavad samad süsteemiväljad,
-- mille seadete API lisab edaspidi nõude sisselülitamisel automaatselt.
UPDATE "CompetitionFormField" field
SET "order" = field."order" + 3
FROM "Competition" competition
WHERE field."competitionId" = competition."id"
  AND competition."representativeRequired" = TRUE
  AND field."isActive" = TRUE;

INSERT INTO "CompetitionFormField" (
  "id", "competitionId", "key", "label", "helpText", "type",
  "semanticKey", "options", "memberFields", "memberMinCount",
  "memberMaxCount", "showInRegistration", "requiredInRegistration",
  "showInMandate", "requiredInMandate", "editableInMandate",
  "conditionFieldKey", "conditionOperator", "conditionValue",
  "purgeAfterCompetition", "order", "isActive", "createdAt", "updatedAt"
)
SELECT
  CONCAT('sys_rep_name_', competition."id"), competition."id",
  'system_representative_name', 'Esindaja nimi',
  'Esindaja, kelle kasutajakonto seotakse võistkonnaga.', 'TEXT',
  NULL, '[]', '["name"]', 1, NULL, TRUE, TRUE, TRUE, TRUE, TRUE,
  NULL, NULL, NULL, FALSE, 0, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Competition" competition
WHERE competition."representativeRequired" = TRUE
ON CONFLICT ("competitionId", "key") DO NOTHING;

INSERT INTO "CompetitionFormField" (
  "id", "competitionId", "key", "label", "helpText", "type",
  "semanticKey", "options", "memberFields", "memberMinCount",
  "memberMaxCount", "showInRegistration", "requiredInRegistration",
  "showInMandate", "requiredInMandate", "editableInMandate",
  "conditionFieldKey", "conditionOperator", "conditionValue",
  "purgeAfterCompetition", "order", "isActive", "createdAt", "updatedAt"
)
SELECT
  CONCAT('sys_rep_email_', competition."id"), competition."id",
  'system_representative_email', 'Esindaja e-post',
  'Eeltäidetakse sisselogitud kasutaja e-posti aadressiga.', 'EMAIL',
  NULL, '[]', '["name"]', 1, NULL, TRUE, TRUE, TRUE, TRUE, TRUE,
  NULL, NULL, NULL, TRUE, 1, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Competition" competition
WHERE competition."representativeRequired" = TRUE
ON CONFLICT ("competitionId", "key") DO NOTHING;

INSERT INTO "CompetitionFormField" (
  "id", "competitionId", "key", "label", "helpText", "type",
  "semanticKey", "options", "memberFields", "memberMinCount",
  "memberMaxCount", "showInRegistration", "requiredInRegistration",
  "showInMandate", "requiredInMandate", "editableInMandate",
  "conditionFieldKey", "conditionOperator", "conditionValue",
  "purgeAfterCompetition", "order", "isActive", "createdAt", "updatedAt"
)
SELECT
  CONCAT('sys_rep_phone_', competition."id"), competition."id",
  'system_representative_phone', 'Esindaja telefon',
  'Telefon, millelt korraldaja saab esindajaga ühendust.', 'PHONE',
  NULL, '[]', '["name"]', 1, NULL, TRUE, TRUE, TRUE, TRUE, TRUE,
  NULL, NULL, NULL, TRUE, 2, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Competition" competition
WHERE competition."representativeRequired" = TRUE
ON CONFLICT ("competitionId", "key") DO NOTHING;
