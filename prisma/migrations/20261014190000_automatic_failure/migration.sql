ALTER TABLE "Result" ADD COLUMN "failureMode" TEXT NOT NULL DEFAULT 'AUTO';
UPDATE "Result" AS r SET "failureMode" = 'FORCE_FAILED'
WHERE EXISTS (
  SELECT 1 FROM "ElementException" e
  WHERE e."elementId" = r."elementId" AND e."label" = r."exceptionLabel" AND e."kind" = 'FAILED'
) OR (
  LOWER(TRIM(r."exceptionLabel")) LIKE 'ebaõnnestu%'
  AND NOT EXISTS (
    SELECT 1 FROM "ElementException" e
    WHERE e."elementId" = r."elementId" AND e."label" = r."exceptionLabel"
      AND e."kind" IN ('NOT_PASSED', 'PASSED_NOT_DONE', 'OTHER')
  )
);
