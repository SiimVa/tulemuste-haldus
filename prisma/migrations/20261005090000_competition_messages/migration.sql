-- CreateTable
CREATE TABLE "CompetitionMessage" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "replyTo" TEXT,
    "sentById" TEXT,
    "recipientCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitionMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitionMessageRecipient" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "context" TEXT NOT NULL,
    "batchNo" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetitionMessageRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompetitionMessage_competitionId_createdAt_idx" ON "CompetitionMessage"("competitionId", "createdAt");

-- CreateIndex
CREATE INDEX "CompetitionMessageRecipient_status_nextAttemptAt_idx" ON "CompetitionMessageRecipient"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "CompetitionMessageRecipient_messageId_batchNo_idx" ON "CompetitionMessageRecipient"("messageId", "batchNo");

-- AddForeignKey
ALTER TABLE "CompetitionMessage" ADD CONSTRAINT "CompetitionMessage_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionMessage" ADD CONSTRAINT "CompetitionMessage_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionMessageRecipient" ADD CONSTRAINT "CompetitionMessageRecipient_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "CompetitionMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

