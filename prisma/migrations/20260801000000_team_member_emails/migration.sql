ALTER TABLE "TeamMember"
ADD COLUMN "email" TEXT;

UPDATE "TeamMember" AS member
SET "email" = LOWER(BTRIM("User"."email"))
FROM "User"
WHERE member."userId" = "User"."id";

WITH member_answers AS (
  SELECT
    value."teamId",
    BTRIM(answer ->> 'name') AS name,
    LOWER(BTRIM(answer ->> 'email')) AS email
  FROM "TeamFormFieldValue" AS value
  INNER JOIN "CompetitionFormField" AS field
    ON field."id" = value."fieldId"
  CROSS JOIN LATERAL JSONB_ARRAY_ELEMENTS(
    CASE
      WHEN LEFT(LTRIM(value."value"), 1) = '[' THEN value."value"::JSONB
      ELSE '[]'::JSONB
    END
  ) AS answer
  WHERE field."type" = 'MEMBER_LIST'
    AND NULLIF(BTRIM(answer ->> 'name'), '') IS NOT NULL
    AND NULLIF(BTRIM(answer ->> 'email'), '') IS NOT NULL
)
UPDATE "TeamMember" AS member
SET "email" = member_answers.email
FROM member_answers
WHERE member."teamId" = member_answers."teamId"
  AND LOWER(BTRIM(member."name")) = LOWER(member_answers.name)
  AND member."email" IS NULL;

UPDATE "TeamMember"
SET "email" = NULLIF(LOWER(BTRIM("email")), '');

WITH ranked_emails AS (
  SELECT
    member."id",
    ROW_NUMBER() OVER (
      PARTITION BY member."competitionId", member."email"
      ORDER BY (member."userId" IS NOT NULL) DESC, team."createdAt", member."id"
    ) AS position
  FROM "TeamMember" AS member
  INNER JOIN "Team" AS team ON team."id" = member."teamId"
  WHERE member."email" IS NOT NULL
)
UPDATE "TeamMember" AS member
SET "email" = NULL
FROM ranked_emails
WHERE member."id" = ranked_emails."id"
  AND ranked_emails.position > 1;

CREATE UNIQUE INDEX "TeamMember_competitionId_email_key"
ON "TeamMember"("competitionId", "email");

CREATE INDEX "TeamMember_email_idx" ON "TeamMember"("email");
