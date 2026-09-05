ALTER TABLE "Notification"
ADD COLUMN "emailBatchId" TEXT;

CREATE INDEX "Notification_emailBatchId_emailStatus_emailNextAttemptAt_idx"
ON "Notification"("emailBatchId", "emailStatus", "emailNextAttemptAt");
