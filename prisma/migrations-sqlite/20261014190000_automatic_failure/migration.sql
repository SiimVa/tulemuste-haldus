ALTER TABLE "Result" ADD COLUMN "failureMode" TEXT NOT NULL DEFAULT 'AUTO';
UPDATE "Result" SET "failureMode" = 'FORCE_FAILED'
WHERE EXISTS (
  SELECT 1 FROM "ElementException" e
  WHERE e."elementId" = "Result"."elementId" AND e."label" = "Result"."exceptionLabel" AND e."kind" = 'FAILED'
) OR (
  (LOWER(TRIM("exceptionLabel")) LIKE 'ebaõnnestu%' OR LOWER(TRIM("exceptionLabel")) LIKE 'ebaÕnnestu%')
  AND NOT EXISTS (
    SELECT 1 FROM "ElementException" e
    WHERE e."elementId" = "Result"."elementId" AND e."label" = "Result"."exceptionLabel"
      AND e."kind" IN ('NOT_PASSED', 'PASSED_NOT_DONE', 'OTHER')
  )
);
