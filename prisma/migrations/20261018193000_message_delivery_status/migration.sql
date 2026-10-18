ALTER TABLE "CompetitionMessageRecipient"
  ADD COLUMN "resendId" TEXT,
  ADD COLUMN "deliveredAt" TIMESTAMP(3),
  ADD COLUMN "openedAt" TIMESTAMP(3),
  ADD COLUMN "bouncedAt" TIMESTAMP(3),
  ADD COLUMN "complainedAt" TIMESTAMP(3),
  ADD COLUMN "deliveryDelayedAt" TIMESTAMP(3),
  ADD COLUMN "deliveryFailedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "CompetitionMessageRecipient_resendId_key" ON "CompetitionMessageRecipient"("resendId");
